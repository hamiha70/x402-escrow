# x402 Privacy Architecture Design Space (Practitioner Edition)

This whitepaper-style note maps the privacy patterns that can sit on top of the `x402-escrow`
rails. It is written for builders, partners, and practitioners evaluating how to mix compliance,
cost, and privacy. Rather than naming vendors or one-off constraints, we categorize architectural
approaches that many ecosystems (including ours) can implement with different toolchains.

HTTP-layer privacy is intentionally out of scope; the focus is on on-chain observability, trust,
and operational trade-offs. We emphasize that **there is no universal “best” model**—different
use cases gravitate toward different points in this design space. Our facilitator stack is
structured so these schemes can coexist or evolve over time.

---

## Trade-Off Dimensions

We compare schemes along five recurring axes:

1. **Implementation Effort vs. Escrow Baseline** – incremental engineering relative to the deployed escrow / deferred flow.
2. **Trust Limitations** – which actors or substrates must be trusted and what their failure implies.
3. **Anonymity Level** – what observers, sellers, or facilitators can infer on-chain.
4. **Gas & Latency Profile** – incremental settlement cost or time-to-content.
5. **Compliance Hooks** – how we prove KYB, auditability, or forensic access when required.

---

## Snapshot Matrix

| Attribute / Scheme        | Facilitator-Trusted                                   | Transparent Escrow                          | Exact Scheme                                   | Note-Based Pool                                                     | Confidential Vault                                 | TEE Facilitator                                    |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Privacy Goal**          | Hide buyers on-chain via facilitator omnibus payouts  | None (full transparency)                    | Synchronous intent settlement; minimal privacy | Break buyer↔seller linkage with ZK notes                            | Keep balances & logic inside confidential contract | Hide facilitator state without touching contracts  |
| **Implementation Effort** | ⭐ Minimal (ledger + batching)                        | ⭐⭐ Already built                          | ⭐⭐ Already built                             | ⭐⭐⭐⭐ High (circuits, verifier, note DB)                         | ⭐⭐⭐ Medium-high (bridge + confidential runtime) | ⭐⭐ Moderate (ROFLize container + attestation)    |
| **Trust Limitations**     | Facilitator honesty + solvency                        | Public chain only; facilitator sees intents | Same as transparent escrow                     | Soundness of proof system + facilitator confidentiality             | Confidential chain validators + bridge correctness | Hardware vendor + operator; single enclave in MVP  |
| **Gas Profile**           | Same or lower than baseline                           | Lowest possible                             | Same as transparent (single tx per payment)    | +250k–400k gas per proof (batching recommended)                     | Extra steps for bridging; contract exec cheap      | Same as baseline                                   |
| **Latency Expectations**  | Depends on facilitator batch schedule                 | Immediate                                   | Immediate                                      | Immediate once proof generated                                      | Depends on bridge finality; can pre-signal intent  | Immediate                                          |
| **Compliance Hooks**      | Off-chain ledger exports, KYB enforced before payouts | Existing seller allowlist + USDC settlement | Same as transparent                            | Seller allowlist enforced as public input; nullifier log aids audit | Confidential logs decryptable via attested API     | Attested API can expose queue stats; KYB unchanged |

---

## Facilitator-Trusted Scheme (“Convenience Privacy”)

**Goal**  
Provide a quick-to-ship privacy flavor by letting the facilitator maintain an off-chain ledger of buyer deposits and settle sellers in aggregated batches. Sellers only see the facilitator’s on-chain address.

**User Story**

1. Buyer deposits USDC into facilitator omnibus account (or existing vault).
2. Buyer sends payment intent to facilitator.
3. Facilitator records debit in ledger and periodically pays sellers from its own wallet.
4. Buyer receives receipt referencing facilitator settlement batch.

**Implementation Effort vs Baseline**

- Modify facilitator to hold funds, maintain double-entry ledger, and expose “receipt” API.
- Optional contract tweak to emit hashes of ledger snapshots for audit.
- No Noir, no TEE, no new bridges.

**Compliance Hooks**

- Ledger exports for regulators / auditors.
- KYB enforcement identical to today (facilitator only pays allowlisted sellers).
- Possible requirement: daily proof-of-solvency or on-chain commitment to ledger hash.

**Privacy & Data Surface**

- On-chain: sellers see facilitator address only; buyers invisible on-chain.
- Off-chain: facilitator knows everything; sellers learn nothing about buyers.
- Anonymity limited to facilitator discretion (can reveal ledger under subpoena).

**Trade-Off Summary**

- Implementation Effort: **Very Low**
- Trust Limitation: Facilitator must be trusted not to misreport or go insolvent.
- Anonymity: weak but better than public escrow (observers only see facilitator).
- Gas: minimal (equal or cheaper than escrow).
- Latency: depends on facilitator batching frequency (can mirror deferred-escrow).

**Why Do It**

- Gives us a “facilitator-trusted” SKU that mirrors how x402 folks describe simple deployments.
- Useful baseline for demos when we need an “easy privacy variant.”

---

## Transparent Escrow (Current Baseline)

**Goal**  
Maintain today’s exact/escrow-deferred model with minimal cost and high clarity.

**Key Characteristics**

- Buyer signs EIP-712 intent; facilitator executes transferWithAuthorization directly.
- Vault batch-settles escrowed funds to sellers (escrow-deferred scheme).
- All operations published on-chain → perfect transparency.

**Advantages**

- **Low Gas**: only transferWithAuthorization + simple Vault calls.
- **Simple Compliance**: seller allowlist + USDC settlement already in place.
- **Deterministic Operations**: no prover/bridge dependencies.

**Limitations**

- Zero on-chain privacy; every buyer↔seller link is public.
- Facilitator still sees all intents (same as trusted variant).

We keep this as the canonical “x402 baseline” for comparison.

---

## Exact Scheme (Synchronous Settlements)

**Goal**  
Provide immediate delivery with direct transferWithAuthorization, but leave room for higher privacy add-ons later.

**Characteristics**

- Buyer signs EIP-3009 authorization, facilitator submits it immediately.
- Derived from our shipped “exact” test chain script; no batching or escrow.
- Gas footprint remains minimal; privacy equivalent to public ERC-20 transfer.
- Works best when compliance or UX requires instant settlement.

**Trade-Offs**

- Implementation Effort: **Already built**.
- Trust Limitation: Facilitator only needs signing permission.
- Anonymity: none, but minimal latency.
- Can coexist with other schemes inside facilitator.

---

## Note-Based Pool (ZK Notes / Noir)

**Goal**  
Hide buyer↔seller linkage on-chain via zk-SNARK proofs (Noir) while retaining deferred escrow semantics.

**MVP Adjustments Requested**

- **No per-note fee calculation**: facilitator deducts fees off-chain; proof only enforces amount ≥ payment.
- Deposits + spends create/change single notes (simplify initial scheme).
- Focus on stateless notes with Merkle root + nullifier set.

**User Story**

1. Buyer deposits into Vault and submits `commitment = H(secret, sellerBinding, facilitatorBinding, amount)`.
2. Buyer sends facilitator an encrypted HTTP payload containing note secret and desired payment.
3. Facilitator checks there are enough unlocked funds, computes proof in Noir, and submits `redeem(proof, publicInputs)` to Vault.
4. Vault verifies proof, burns nullifier, releases funds to seller, and (optionally) emits new note commitment for change.
5. Buyer receives change note off-chain (facilitator returns secret or encrypted blob).

**Public vs Private Inputs**

- **Public**: Merkle root, nullifier, seller address/resource hash, facilitator ID, payment amount, change commitment, expiry.
- **Private**: note secret, Merkle path, buyer signature data if embedded, change randomness.

**Compliance Hook**

- Seller address remains a public input → enforce allowlist in-circuit.
- Facilitator ID also public, so we can audit which facilitator spent which note.
- Can emit proof metadata for regulators (e.g., hashed payment intent).

**Trade-Offs**

- Implementation Effort: **High** (circuits, prover infra, new contract).
- Trust Limitation: must trust proof system soundness + facilitator keeping HTTP payload confidential.
- Anonymity: strong on-chain unlinkability proportional to pool size.
- Gas: verifying proofs adds ~250k–400k gas per spend; batching multiple proofs advisable.
- Latency: same block once proof generated; proving adds seconds.

**Next Steps**

- 2–3 hour spike to confirm Noir circuit skeleton (deposit, spend). Drop if infeasible.
- If viable, write detailed spec + change-note format, then integrate into facilitator.

---

## Confidential Vault (Private On-Chain Contract)

**Goal**  
Reimplement Vault logic inside Oasis Sapphire’s confidential EVM so that all balances and intents are encrypted on-chain.

**Key Considerations**

- Requires a confidential execution environment (e.g., Sapphire, Secret Network, or rollups with TEEs).
- Bridging native liquidity is the main challenge; usually solved with trusted signers or attested RPC calls.
- Bridging latency must align with service delivery expectations; pre-confirmation signals may be needed.

**User Story**

1. Buyer deposits USDC on Base (or other chain) into a bridge contract controlled by facilitator’s ROFL stack.
2. Facilitator signs cross-chain RPC to mint wrapped funds inside Sapphire private vault.
3. Buyer interacts with Sapphire contract (or facilitator) to authorize payment; logic executes privately.
4. Sapphire contract notifies facilitator (via attested RPC) that payout is ready; facilitator starts service delivery immediately.
5. Later, Sapphire contract releases aggregated funds back to public chain via signed transactions.

**Implementation Effort vs Baseline**

- Medium-high: deploy Sapphire contract, build ROFL bridge signer, handle reconciliation between public vault and Sapphire vault.
- Requires new monitoring + emergency pause flows.

**Compliance Hook**

- Maintain allowlist logic inside Sapphire (encrypted state).
- Provide decryptable audit logs via attested API if regulators request.
- ROFL bridge must log cross-chain transfers for Circle compliance.

**Trade-Offs**

- Implementation Effort: **Medium-High**
- Trust Limitation: rely on Sapphire validators + bridge availability; if bridge halts, funds stuck.
- Anonymity: strong (state private by default).
- Gas: cheaper on Sapphire, but bridging + extra transactions add cost.
- Latency: acceptable only if facilitator can start service upon attested confirmation (bridging finality may still take minutes).

**Notes**

- If bridging cannot provide early confirmation, the model is unsuitable for low-latency APIs.
- Works best when privacy demands outweigh bridging complexity (e.g., regulated environments).

---

## TEE Facilitator

**Goal**  
Keep the existing on-chain contracts but run the facilitator inside a ROFLized TEE so intents, queue state, and RPC keys never leave the enclave.

**MVP Constraints**

- Single ROFLized Docker container (no redundancy initially).
- Same facilitator API as today; only internal deployment changes.
- Remote attestation evidence published so buyers can verify enclave measurement before sending secrets.

**User Story**

1. Buyer requests attestation report from facilitator endpoint.
2. After verifying measurement, buyer sends encrypted EIP-712 intents directly to enclave.
3. Enclave validates, manages escrow queue, and submits transactions via sealed RPC keys.
4. Seller sees same settlement flow as today, but on-chain observers only learn what baseline already exposes.
5. Audit logs (hashes) can be exposed through an attested API for compliance.

**Implementation Effort vs Baseline**

- Moderate: containerize facilitator with ROFL, wire remote attestation verification into buyer SDK, manage sealed storage.
- No smart-contract changes required.

**Compliance Hook**

- Facilitator still enforces seller allowlist and can expose read-only attested API to regulators.
- Easy to add “dual attestation” where regulators can query queue stats without accessing user data.

**Trade-Offs**

- Implementation Effort: **Moderate**
- Trust Limitation: rely on hardware vendor (TEE) and operator honesty (single enclave for MVP).
- Anonymity: hides facilitator’s internal data; on-chain remains transparent.
- Gas/Latency: identical to baseline.
- Bonus: natural stepping stone to cross-chain liquidity (enclave can safely hold bridge keys).

**Why Ship Regardless**

- Fast win that materially improves privacy vs. today.
- Keeps door open for cross-chain orchestration while Noir research proceeds.

---

## Why Multiple Schemes Coexist

- **Market diversity**: Regulated institutions may demand transparent flows, while agentic use cases need unlinkability.
- **Operational constraints**: Some teams can run TEEs, others prefer pure smart contracts.
- **User experience**: Instant settlement (exact) vs. deferred vs. private batching all serve different UX tolerances.
- **Facilitator flexibility**: Our facilitator already handles exact and escrow flows; it can route requests to the privacy scheme each integration chooses.

There is no single “best” privacy posture. Instead, we offer a menu so integrators can select the scheme that fits their jurisdiction, latency, and trust envelope.

---

## Immediate Next Steps

1. **Noir Note Spike** – Allocate ~3 hours to get deposit/spend circuits compiling. If we hit a hard blocker, we fall back to TEE-first plan.
2. **TEE Facilitator Track** – Considered mandatory; start ROFLization and attestation design so we can deploy a private facilitator regardless of Noir outcome.
3. **Confidential Vault Feasibility** – Continue discussions on bridging + attested RPC flows; proceed only if pre-confirmation path is viable.
4. **Facilitator-Trusted SKU** – Document ledger format and receipts so we can ship this “easy privacy” flavor quickly.
5. **Per-Scheme Technical Specs** – Produce implementation plans (starting with the Noir/ZKP path) covering architecture, user stories, compliance hooks, failure modes, and task breakdowns.

---

_This document remains a living overview. Technical plans with timelines and engineering subtasks are tracked separately per scheme._
