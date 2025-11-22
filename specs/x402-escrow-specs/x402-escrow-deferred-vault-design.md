## x402 "escrow-deferred" Scheme – Pool-Based Vault Design (V3-Style)

High-level design for an x402-compliant **escrow-deferred** payment scheme using a shared vault (pool) contract.

Key characteristics:

- Buyers **pre-deposit** funds into a vault.
- Sellers deliver content immediately after off-chain intent validation.
- Settlement is **batched** and executed later from the vault to sellers.
- Privacy and batching are improved relative to direct per-request transfers.

The design is broken into 5 implementation steps, each with:

- **Design goals**
- **Protocol / component design**
- **Test expectations**

---

### Step 1 – Vault Contract & Token Model

**Design goals**

- Provide a shared **vault pool** for an ERC-20 token (e.g. USDC).
- Track per-buyer deposits and support **batch withdrawals** to sellers based on signed payment intents.
- Enforce cryptographic guarantees on-chain:
  - Nonce uniqueness.
  - Intent expiry.
  - Signature correctness (EIP-712).

**Design**

- Deploy a `Vault` contract with at least:
  - `token`: address of the ERC-20 asset (e.g. USDC).
  - `mapping(address => uint256) deposits`: per-buyer deposited balances.
  - `mapping(address => mapping(bytes32 => bool)) usedNonces`: per-buyer nonce tracking.
- Public functions:
  - `deposit(uint256 amount)`:
    - `msg.sender` approves `amount` of `token` to the vault first.
    - Vault transfers `amount` from sender to itself.
    - Increases `deposits[msg.sender]` by `amount`.
  - `batchWithdraw(PaymentIntent[] intents, bytes[] signatures)`:
    - `PaymentIntent` struct (Solidity view) mirrors the off-chain intent:
      - `buyer`, `seller`, `amount`, `token`, `nonce`, `expiry`, `resource`, `chainId`.
    - For each intent:
      - Verify:
        - `intent.token == address(token)`.
        - `intent.chainId == block.chainid`.
        - Intent is not expired: `block.timestamp <= intent.expiry`.
        - `usedNonces[intent.buyer][intent.nonce] == false`.
        - EIP-712 signature is valid for `intent.buyer` over the standardized typed data.
      - Mark nonce as used: `usedNonces[intent.buyer][intent.nonce] = true`.
    - Enforce per-buyer solvency:
      - For each buyer, sum all `intent.amount` values from this batch.
      - Require `deposits[buyer] >= totalAmountForBuyer`.
    - Perform transfers:
      - For each buyer:
        - Decrease `deposits[buyer]` by `totalAmountForBuyer`.
      - For each intent:
        - Transfer `amount` from the vault to the `seller`.
    - Emit events:
      - `IntentSettled(buyer, seller, amount, nonce, resource, txBatchId)` for each intent.
      - `Withdrawn(seller, amount, txBatchId)` or equivalent aggregate event.
- EIP-712 design:
  - Domain:
    - `name`: vault/protocol name.
    - `version`: protocol version.
    - `chainId`: `block.chainid`.
    - `verifyingContract`: vault’s address.
  - Typed struct:
    - Matches `PaymentIntent` fields, including `resource` and `chainId` for strong binding.

**Test expectations**

- **Unit tests (Solidity)**
  - `deposit`:
    - Increases `deposits[buyer]` by `amount`.
    - Vault’s token balance increases by `amount`.
  - Successful `batchWithdraw`:
    - After depositing sufficient funds for one buyer, calling `batchWithdraw` with valid intents:
      - Decreases `deposits[buyer]` by the sum of their intent amounts.
      - Increases each seller’s token balance by the correct amount.
      - Marks each `(buyer, nonce)` as used.
  - Failure cases:
    - Duplicate nonce: reusing a nonce for the same buyer reverts.
    - Expired intent: `expiry < block.timestamp` causes revert.
    - Insufficient deposit: if `deposits[buyer] < requiredTotal`, the whole batch reverts.
    - Wrong token or chainId: reverts if `intent.token` or `intent.chainId` do not match the current network/asset.
  - Event tests:
    - Correct events are emitted for each settled intent and withdrawal.

---

### Step 2 – HTTP x402 Negotiation for "x402-escrow-deferred"

**Design goals**

- Adapt the HTTP 402 negotiation from the "exact" scheme to the **escrow-deferred** mode.
- Ensure buyers discover:
  - They must use the vault for escrow.
  - The chain, asset, and required deposit amount.
  - The scheme semantics (`x402-escrow-deferred`).

**Design**

- Seller’s protected endpoints behave similarly:
  - Unauthorized/unpaid request → `402 Payment Required`.
  - Payment requirements header/document with fields:
    - `scheme`: `"x402-escrow-deferred"`.
    - `version`: protocol version.
    - `network`: chain descriptor (or chainId).
    - `asset`: symbol + ERC-20 address.
    - `amount`: required payment per request (e.g. `"0.01"` USDC).
    - `currencyDecimals`: decimals for the asset.
    - `seller`: seller’s address (beneficiary of withdrawal).
    - `vault`: vault contract address.
    - `resource`: canonical resource identifier.
    - `escrow`: object describing:
      - `type`: `"vault-pool"` (pooled escrow).
      - `mode`: `"deferred"` (settlement happens later).
    - `expiresAt`: optional expiry time for the requirement.
- Buyer agent behavior:
  - Reads the 402 payment requirements.
  - Ensures they are consistent with its configuration (correct network, vault, token).
  - Checks vault deposit:
    - If insufficient funds, deposits more tokens to the vault before proceeding.
  - Constructs and signs a **PaymentIntent** bound to:
    - The `resource`.
    - The `vault` contract’s EIP-712 domain.
  - Retries the request with:
    - The signed PaymentIntent and its signature in HTTP headers.
  - On success:
    - Receives `200 OK`, content, and a **payment receipt** (e.g. `X-PAYMENT-RESPONSE` header) with:
      - `scheme`, `status`, `amount`, `intentHash` or `intentNonce`, and settlement mode `"deferred"`.

**Test expectations**

- **Seller tests**
  - 402 response for unpaid access includes `scheme: "x402-escrow-deferred"` and `vault` address.
  - After a valid payment header:
    - Seller returns 200.
    - Seller **does not** interact with the blockchain directly; it trusts the facilitator’s validation.
- **Buyer tests**
  - If vault balance is low, buyer deposits before sending the intent.
  - If buyer intentionally mis-matches any field (amount, seller, vault, resource), facilitator/seller rejects the request.
- **Protocol conformance**
  - Compare the payment requirement format and receipt headers against official x402 examples for escrow/deferred flows, ensuring naming and semantics align where possible.

---

### Step 3 – Facilitator for Escrow-Deferred Intents

**Design goals**

- Centralize validation of escrow-deferred intents.
- Ensure only _valid_ intents referencing the correct vault, network, and asset reach the settlement queue.
- Provide basic safety (nonce and balance checks) before on-chain settlement.

**Design**

- Facilitator API:
  - `POST /validate-intent`:
    - Input:
      - Payment requirements (as seen by buyer/seller).
      - PaymentIntent and its EIP-712 signature.
    - Validation steps:
      1. Re-build expected PaymentIntent from payment requirements:
         - `seller`, `token`, `amount`, `resource`, `chainId`, `vault`.
      2. Compare client-provided PaymentIntent to expected:
         - All fields must match; otherwise, reject.
      3. Verify EIP-712 signature against the vault’s domain and PaymentIntent struct:
         - Recover signer address and ensure it equals `intent.buyer`.
      4. Check expiry and current time.
      5. Optional: query the vault contract to check `deposits[buyer]` is at least `intent.amount`.
      6. Off-chain nonce safety:
         - Track `(buyer, nonce)` in a local store or log.
         - Reject if it appears reused.
      7. If all checks pass:
         - Return success to the seller/buyer.
         - Append the signed intent to the **settlement queue** with `status: "pending"`.
- Settlement queue behavior is similar to the "exact" scheme, but the **on-chain enforcement** lives in the vault rather than the token directly.

**Test expectations**

- **Facilitator tests**
  - Valid intent:
    - Signature verification passes.
    - All fields match payment requirements.
    - Queue receives exactly one new `pending` record with correct metadata.
  - Invalid contexts:
    - Wrong vault address.
    - Wrong token or chainId.
    - Wrong seller or wrong amount.
    - Expired intent.
    - Reused nonce.
  - Each invalid scenario results in:
    - HTTP error response from facilitator.
    - No queue insertion.
- **Queue tests**
  - As in the "exact" scheme:
    - Correct status transitions.
    - Cleanup and duplicate prevention.

---

### Step 4 – Batch Settlement Worker & Queue Processing

**Design goals**

- Implement an off-chain **settlement worker** that:
  - Reads pending intents from the queue.
  - Groups them into a batch (or batches).
  - Calls `batchWithdraw` on the vault.
  - Analyzes on-chain events and updates the queue.
- Ensure robust error reporting:
  - Distinguish between:
    - Expired intents.
    - Nonce already used.
    - Insufficient vault balance.
    - Other on-chain errors.

**Design**

- Worker algorithm (high-level):
  1. Load all `pending` intents from the queue.
  2. Cleanup old settled/failed entries from the queue (retention window).
  3. Optionally:
     - Deduplicate by nonce (keep first, mark others as failed).
     - Check each pending intent’s nonce on-chain via `usedNonces[buyer][nonce]`:
       - If already used, mark as failed with reason `"nonce already used on-chain"`.
  4. Build a batch:
     - Collect remaining `pending` intents into an array.
     - Group by buyer and compute per-buyer total amount.
     - Query vault for each buyer’s `deposits[buyer]`; if any are too low, either:
       - Drop those intents as failed with `"insufficient vault balance"`, or
       - Fail the batch and require operator intervention (design choice).
  5. Call `batchWithdraw(intents, signatures)`:
     - Use the signed PaymentIntents and their signatures.
     - Wait for transaction confirmation.
  6. Parse events:
     - For each `IntentSettled` event, collect `(buyer, seller, amount, nonce)`.
  7. Derive:
     - `settledNonces` (from events).
     - `failedNonces` = nonces in the batch that did not appear in events.
  8. Update queue:
     - `markBatchSettled(settledNonces, txHash)`.
     - For each failed nonce, attempt on-chain diagnosis:
       - Expired? Check `expiry` vs current time.
       - `usedNonces[buyer][nonce] == true`? → "nonce already used".
       - `deposits[buyer] < intent.amount`? → "insufficient vault balance".
       - Otherwise mark `"unknown on-chain error"`.

**Test expectations**

- **Worker integration tests (against a test network or fork)**
  - Single intent:
    - After running the worker:
      - Vault’s `deposits[buyer]` decreased by `amount`.
      - Seller’s token balance increased by `amount`.
      - `usedNonces[buyer][nonce]` is true.
      - Queue marks the intent as `settled` with `txHash`.
  - Multiple intents (same buyer, one seller):
    - Check aggregated per-buyer solvency.
    - Ensure final deposits and seller balance are correct.
  - Failure cases:
    - Expired intent ⇒ marked failed with `"expired"`.
    - Already-used nonce ⇒ marked failed with `"nonce already used"`.
    - Insufficient deposit ⇒ marked failed with `"insufficient vault balance"`.
  - Event parsing:
    - Number of parsed `IntentSettled` events equals the number of settled intents recorded in the queue.

---

### Step 5 – End-to-End Escrow-Deferred Flow Tests

**Design goals**

- Validate the **full pipeline**:
  - HTTP negotiation.
  - Intent creation and signing.
  - Facilitator validation and queuing.
  - Vault-based batch settlement.
  - On-chain balance effects and nonce tracking.
- Ensure that the test focuses on the **escrow-deferred semantics** (instant content, delayed settlement).

**Design**

- Orchestrated E2E scenario:
  1. Start seller and facilitator services.
  2. Fund the buyer with the ERC-20 token and have them deposit into the vault.
  3. Buyer requests protected resource:
     - Receives 402 + payment requirements for `"x402-escrow-deferred"`.
  4. Buyer constructs and signs PaymentIntent, then retries the request with headers:
     - Gets 200 + content + payment receipt.
  5. Validate:
     - Content correctness.
     - Receipt structure and scheme `x402-escrow-deferred`.
  6. Run settlement worker:
     - Observe logs and events as it processes the queue and calls `batchWithdraw`.
  7. Assertions:
     - Buyer’s vault deposit decreased by the expected amount.
     - Seller’s token balance increased by the same amount.
     - The specific nonce from the test’s intent appears in on-chain events and is reported as settled.
     - Queue shows the intent as `settled` with `txHash`.
  8. Repeat with a second payment to:
     - Verify that previously settled nonces are recognized as already used.
     - Confirm that multiple payments accumulate correctly in the seller’s balance and deplete the buyer’s vault deposit.

**Test expectations**

- **Happy path test**
  - All steps from HTTP 402 negotiation to on-chain settlement succeed.
  - The buyer receives content before settlement occurs (deferred model).
  - On-chain balances and queue state match expectations exactly.
- **Robustness checks**
  - The system correctly handles:
    - Running the worker multiple times (idempotency).
    - Existing settled intents in the queue (no double settlement).
    - Mix of fresh and already-settled nonces.

---

This 5-step script defines a complete, pool-based **x402 escrow-deferred** design:

- It keeps HTTP semantics aligned with x402 examples.
- It uses a vault contract to separate deposits from settlement, enabling batching and improved privacy.
- It gives an LLM clear, test-driven milestones to reconstruct an implementation that is close in architecture and behavior to a mature V3-style system.
