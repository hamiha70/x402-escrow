## x402 "exact" Scheme – Intent-Based Payment with EIP-3009

High-level design for an x402-compliant "exact" payment scheme where each HTTP request is tied to a single, exact token transfer authorization, settled via EIP-3009 (or equivalent transfer-with-authorization mechanism on the token contract).

This script is structured as 4 implementation steps. Each step contains:

- **Design goals**
- **Protocol / component design**
- **Test expectations** (unit, integration, and E2E)

The intent is that an LLM (or human) can implement this end-to-end without needing to see any existing code, while staying aligned with common x402 patterns and EIP-3009 usage.

---

### Step 1 – HTTP 402 Negotiation & "exact" Payment Requirements

**Design goals**

- Implement x402-style HTTP negotiation for paid resources.
- Use a strict **"exact"** scheme: the client must pay _exactly_ the specified amount, in the specified token, on the specified chain.
- Ensure the seller does **not** hardcode client behavior; the buyer must discover everything from the 402 response.

**Design**

- Seller exposes protected HTTP endpoints (e.g. `/api/content/premium`).
- On unauthenticated or unpaid request, seller responds with:
  - HTTP `402 Payment Required`.
  - Standard x402 headers (name them generically, e.g. `X-PAYMENT-REQUIREMENTS` or `X-PAYMENT-REQUEST`) encoded as JSON.
- The payment requirements document SHOULD include at least:
  - **scheme**: `"x402-exact"` (distinct from escrow modes).
  - **version**: protocol version (e.g. `"1.0"`).
  - **network**: symbolic chain name or chainId (e.g. `"base-sepolia"` or `84532`).
  - **asset**: token identifier (symbol + on-chain address for the given network).
  - **amount**: exact token amount required (e.g. `"0.01"` USDC).
  - **currencyDecimals**: decimals for the asset (e.g. `6` for USDC).
  - **seller**: beneficiary address.
  - **resource**: canonical resource identifier (URI path or opaque ID); must be stable and used in signing.
  - **expiresAt** (optional but recommended): time after which requirements are invalid.
  - **metadata** (optional): human-readable description, plan id, etc.
- Seller must respond with `200 OK` and the requested content when a valid payment proof is provided (see later steps).

**Test expectations**

- **Unit / seller tests**
  - When no valid payment proof is present:
    - Response status is `402`.
    - Payment requirements header is present, parseable JSON, and contains all required fields.
  - For a paid/authorized request:
    - With a structurally valid and verified payment proof:
      - Response status is `200`.
      - Content is delivered.
    - For malformed or tampered payment proofs:
      - Response is `4xx` (e.g. `400` or `401`) and content is not delivered.
- **Protocol conformance tests**
  - Compare the payment requirements JSON with official x402 examples (e.g. Polygon’s documentation) to ensure naming and semantics match the standard as closely as possible while using the `"x402-exact"` scheme label.

---

### Step 2 – Off-Chain Payment Intent Format & EIP-712 Signing

**Design goals**

- Define a canonical **PaymentIntent** structure used across buyer, seller, and facilitator.
- Use EIP-712 typed data for robust off-chain verification.
- Bind the intent to:
  - buyer, seller, amount, token, chain, and **resource**.
  - a unique `nonce` and `expiry`.
- Prepare this intent so it can be mapped 1:1 into an EIP-3009 `transferWithAuthorization` (or equivalent) call.

**Design**

- Define a PaymentIntent struct (logical schema; implementation language-agnostic):
  - `buyer`: address (EOA initiating payment).
  - `seller`: address (beneficiary of the payment).
  - `amount`: uint256 (token units, e.g. 6 decimals for USDC).
  - `token`: address (ERC-20 contract).
  - `nonce`: bytes32 (globally unique per buyer; used both off-chain and on-chain).
  - `expiry`: uint256 (unix timestamp after which intent is invalid).
  - `resource`: string (exact match with HTTP payment requirements).
  - `chainId`: uint256 (EVM chain ID).
- Use an EIP-712 domain roughly of the form:
  - `name`: application or protocol name (MUST match what on-chain verification expects if shared).
  - `version`: protocol version.
  - `chainId`: the chain ID where settlement occurs.
  - `verifyingContract`: address (either a dedicated verifying contract, or the USDC token itself if using EIP-3009-style domain).
- Buyer agent:
  - Parses 402 response, derives PaymentIntent from requirements.
  - Ensures:
    - `amount` matches the exact required amount.
    - `seller`, `token`, `chainId`, and `resource` match requirements.
  - Signs PaymentIntent with EIP-712 typed data using the buyer’s private key.
  - Attaches the signed intent to the subsequent HTTP request in an `X-PAYMENT-INTENT` / `X-PAYMENT-SIGNATURE` header pair (JSON + signature string).

**Test expectations**

- **Unit tests (intent & signer)**
  - Round-trip: building a PaymentIntent from payment requirements and then verifying it against those same requirements succeeds.
  - Mismatched fields (amount, seller, token, resource, chainId) cause verifier to reject the intent.
  - EIP-712 signature verification:
    - Succeeds for a valid signature from the expected buyer address.
    - Fails if:
      - the signer is different,
      - the typed data domain is altered (e.g. wrong `name` or `verifyingContract`),
      - any field of the intent has been tampered with.
- **Integration tests (buyer ↔ seller ↔ facilitator)**
  - Seller rejects requests if:
    - The intent is missing or invalid.
    - The intent does not bind to the correct `resource`.
    - `expiry` is in the past.

---

### Step 3 – Facilitator & Settlement Queue (Off-Chain)

**Design goals**

- Offload validation and settlement preparation from the seller to a separate **facilitator** service.
- Maintain a robust, persistent **settlement queue** of validated intents.
- Enforce additional safety checks (balance checks, nonce uniqueness) before intents ever reach the chain.

**Design**

- Facilitator exposes an HTTP API, e.g.:
  - `POST /validate-intent`:
    - Input: payment requirements (from seller), PaymentIntent, and its EIP-712 signature.
    - Behavior:
      - Verify signature.
      - Check intent fields against payment requirements.
      - Optionally check buyer’s token balance via RPC call (off-chain).
      - Enforce off-chain nonce uniqueness (e.g. log `buyer + nonce` to a local store).
      - If valid, return a `200` validation response that the seller can trust.
      - Append the validated intent to a durable settlement queue (e.g. JSON file, database, or message queue), with metadata:
        - `status`: `"pending" | "settling" | "settled" | "failed"`.
        - `validatedAt`: timestamp.
- Settlement queue:
  - Stores each validated intent as a record containing the signed PaymentIntent plus metadata.
  - Provides operations:
    - `getPending()`: list all pending intents.
    - `markSettling(nonces[])`, `markSettled(nonces[], txHash)`, `markFailed(nonces[], reason)`.
    - `cleanup(maxAgeSeconds)`: remove old settled/failed records beyond a retention window.

**Test expectations**

- **Facilitator unit/integration tests**
  - Valid intents:
    - Signature verifies.
    - Fields match payment requirements.
    - Intent is added exactly once to the queue.
  - Invalid intents:
    - Rejected with a clear error (bad signature, wrong amount, wrong seller, expired).
    - Not added to the queue.
  - Nonce handling:
    - Off-chain store records `(buyer, nonce)` pairs.
    - Re-submissions with the same `(buyer, nonce)` are rejected before queueing.
- **Queue tests**
  - Adding N intents results in N `pending` records.
  - `markSettling`, `markSettled`, `markFailed` correctly update statuses.
  - `cleanup` removes only settled/failed intents older than the specified age.
  - Idempotency: repeated calls to `mark*` or `cleanup` do not corrupt the queue.

---

### Step 4 – On-Chain Settlement with EIP-3009 & End-to-End Tests

**Design goals**

- Use EIP-3009 (or equivalent) to perform trustless settlement:
  - USDC (or compatible token) verifies authorization, signature, nonce, and validity window.
  - No `approve` or allowance is needed.
- Implement a **settlement worker** process that:
  - Reads pending intents.
  - Submits `transferWithAuthorization` (or similar) to the token contract.
  - Updates the queue status based on transaction outcome.

**Design**

- Settlement worker:
  - Periodically (or on-demand) loads all `pending` intents from the queue.
  - For each:
    - Derives EIP-3009 `TransferWithAuthorization` parameters from PaymentIntent:
      - `from` (buyer), `to` (seller), `value` (`amount`), `validAfter`, `validBefore` (`expiry`), and `nonce`.
    - Submits a transaction calling `transferWithAuthorization(...)` on the token contract.
    - Waits for transaction confirmation.
    - If successful:
      - Marks the corresponding intent as `settled` in the queue, with `txHash`.
    - If it fails:
      - Analyzes the revert reason if possible (e.g. nonce already used, authorization expired, insufficient balance).
      - Marks the intent as `failed` with a specific error string.
- On-chain guarantees (provided by the token contract):
  - The authorization (intent) can only be used once for a given `(from, nonce)`.
  - The authorization is only valid within a time window.
  - The amount, recipient, and token are enforced by the contract.

**Test expectations**

- **Smart contract / on-chain tests (using a fork or local chain)**
  - Successful `transferWithAuthorization`:
    - Buyer balance decreases by `amount`.
    - Seller balance increases by `amount`.
    - Contract records nonce as used.
  - Double-spend prevention:
    - Calling `transferWithAuthorization` again with the same nonce reverts.
  - Expiry enforcement:
    - Authorization with `validBefore` in the past reverts.
  - Domain parameter correctness:
    - Using wrong EIP-712 domain (e.g. wrong name or verifyingContract) results in invalid signature and revert.
- **Settlement worker integration tests**
  - With a set of `pending` intents:
    - Worker processes them and marks them `settled` when the token contract accepts the authorization.
    - If an intent is malformed or expired, worker marks it `failed` with the correct reason.
  - End-to-end test:
    - Buyer calls seller’s HTTP endpoint with no payment → receives 402 with requirements.
    - Buyer signs intent and retries with payment headers → gets 200 and content.
    - Facilitator validates and queues the intent.
    - Settlement worker runs and performs on-chain settlement.
    - Final assertions:
      - Seller’s token balance increased by the expected amount.
      - Buyer’s balance decreased by the same amount.
      - The specific intent (by nonce) is recorded as used on-chain.
      - Queue shows the intent as `settled` with a transaction hash.

---

This 4-step script defines a complete, **"exact"** x402 + EIP-3009 settlement design that is:

- Strict about amount and resource binding.
- Compatible with typical USDC EIP-3009 deployments.
- Structured so that an LLM can implement each step independently, guided by the tests.
