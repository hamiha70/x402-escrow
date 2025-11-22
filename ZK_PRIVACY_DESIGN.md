# ZK Privacy Design for x402-private-escrow-deferred

## Vision: Anonymous Micropayments

Enable buyers to make payments without revealing:
- Their identity (address)
- Their payment history
- Their remaining balance

While still allowing:
- Sellers to receive public payments
- Facilitator to batch settle
- Secure enforcement of solvency

## Core Mechanism: Private Notes

### Note Structure (Off-Chain)
```typescript
interface PrivateNote {
  balance: bigint;      // Remaining escrow balance
  nonce: bigint;        // Monotonic counter (prevent replay)
  salt: bytes32;        // Random blinding factor
  owner: address;       // Buyer address (known to facilitator)
  vault: address;       // Vault contract
  chainId: number;      // Which chain
}
```

### On-Chain State (Public)
```solidity
contract PrivateVault {
  // Private note commitments (reveals nothing about buyer/balance)
  mapping(bytes32 => bool) public activeCommitments;
  
  // Spent commitments (prevent double-spend)
  mapping(bytes32 => bool) public nullifiers;
  
  // Public seller credits (OK to be public)
  mapping(address => uint256) public sellerCredits;
  
  // Verify ZK proof and update state
  function makePrivatePayment(
    bytes32 oldCommitment,
    bytes32 newCommitment,
    address seller,
    uint256 amount,
    bytes calldata zkProof
  ) external;
  
  // Batch settle (same as current)
  function batchWithdrawCredits(
    address[] sellers,
    uint256[] amounts
  ) external onlyFacilitator;
}
```

## ZK Circuit Logic

### Public Inputs (Visible On-Chain)
- `oldCommitment` - Note being spent
- `newCommitment` - Note being created
- `seller` - Payment recipient (OK to be public)
- `amount` - Payment amount (OK to be public)
- `vault` - Contract address
- `chainId` - Which blockchain

### Private Inputs (Known Only to Buyer)
- `oldNote` - Full note data being spent
- `newNote` - Full note data being created

### Circuit Constraints
```
1. Commitment Validity:
   hash(oldNote) == oldCommitment
   hash(newNote) == newCommitment

2. Balance Conservation:
   newNote.balance == oldNote.balance - amount
   
3. Solvency:
   newNote.balance >= 0

4. Nonce Increment:
   newNote.nonce == oldNote.nonce + 1
   
5. Ownership Continuity:
   newNote.owner == oldNote.owner
   newNote.vault == oldNote.vault
   newNote.chainId == oldNote.chainId

6. Salt Freshness:
   newNote.salt != oldNote.salt (prevents linkability)
```

## HTTP x402 Flow (Private Scheme)

### 1. Initial 402 Response
```json
{
  "scheme": "x402-private-escrow-deferred",
  "seller": "0xSeller",
  "amount": "0.01",
  "vault": "0xPrivateVault",
  "facilitator": "http://facilitator/validate-private-intent"
}
```

### 2. Buyer Creates Private Payment
```typescript
// Buyer has PrivateNote stored locally
const oldNote = await loadNoteFromStorage();

// Create new note with decreased balance
const newNote = {
  balance: oldNote.balance - paymentAmount,
  nonce: oldNote.nonce + 1n,
  salt: randomBytes(32),
  owner: oldNote.owner,
  vault: oldNote.vault,
  chainId: oldNote.chainId
};

// Generate ZK proof
const { proof, publicSignals } = await generateProof({
  oldNote,
  newNote,
  seller: sellerAddress,
  amount: paymentAmount
});

// Send to seller
const payload = {
  scheme: "x402-private-escrow-deferred",
  oldCommitment: hash(oldNote),
  newCommitment: hash(newNote),
  seller: sellerAddress,
  amount: paymentAmount,
  zkProof: proof,
  resource: requestedResource
};
```

### 3. Facilitator Validates & Queues
```typescript
// Verify proof off-chain first (fast)
const valid = await verifyZKProof(proof, publicSignals);

if (!valid) {
  return { status: "failed", error: "Invalid ZK proof" };
}

// Check on-chain state
const isActive = await vault.activeCommitments(oldCommitment);
const isSpent = await vault.nullifiers(oldCommitment);

if (!isActive || isSpent) {
  return { status: "failed", error: "Invalid commitment" };
}

// Store encrypted note for facilitator recovery
await noteStore.storeEncrypted(newCommitment, newNote, buyerPublicKey);

// Queue for batch settlement
await queue.add({
  scheme: "x402-private-escrow-deferred",
  oldCommitment,
  newCommitment,
  seller,
  amount,
  zkProof,
  resource
});

// Deliver content immediately!
return { status: "deferred", commitment: newCommitment };
```

### 4. Batch Settlement (On-Chain)
```typescript
// Facilitator collects pending private payments
const pending = queue.getPendingPrivate();

// Group by vault
for (const vault of vaults) {
  const payments = pending.filter(p => p.vault === vault);
  
  // Submit all to contract
  for (const payment of payments) {
    await vault.makePrivatePayment(
      payment.oldCommitment,
      payment.newCommitment,
      payment.seller,
      payment.amount,
      payment.zkProof
    );
  }
  
  // Then batch settle seller credits (same as current escrow)
  await vault.batchWithdrawCredits(sellers, amounts);
}
```

## Key Properties Achieved

### Privacy (What's Hidden)
✅ Buyer identity (no address in payment)
✅ Buyer balance (commitment reveals nothing)
✅ Payment linkage (can't correlate buyer's payments)
✅ Payment history (no on-chain trail per buyer)

### Transparency (What's Public)
✅ Seller receives payment (public credit increase)
✅ Total vault TVL (sum of all notes)
✅ Payment amounts (micropayments, OK to be public)
✅ Seller batch withdrawals (public, expected)

### Security Guarantees
✅ Double-spend prevention (nullifiers)
✅ Solvency enforcement (ZK proof checks balance ≥ 0)
✅ Atomic note updates (old nullified, new activated)
✅ Facilitator can't steal (ZK proof binds to seller)

## Implications for Current Architecture

### What's Already Compatible ✅
1. **PaymentContext** - Will carry ZK proof data
2. **Scheme-based routing** - Just add "x402-private-escrow-deferred"
3. **Queue abstraction** - QueueRecord already extensible
4. **Facilitator as validator** - Already validates before queueing
5. **Batch settlement** - Seller credit model maps perfectly

### What Needs Preparation 🔧
1. **Vault contract must support commitments** (not just balances)
2. **QueueRecord must support ZK fields** (proof, commitments)
3. **Facilitator needs note storage** (encrypted backup)
4. **Buyer needs note management** (local storage, rotation)
5. **PaymentPayload must be extensible** (optional ZK fields)

### Design Decisions NOW

#### 1. Make QueueRecord Extensible
```typescript
interface QueueRecord {
  scheme: PaymentScheme;
  // ... existing fields ...
  
  // Optional ZK fields (null for non-private schemes)
  zkData?: {
    oldCommitment: string;
    newCommitment: string;
    proof: string;
  };
}
```

#### 2. Make Vault Interface Generic
```solidity
// Don't hardcode balance mappings in interface
// Let implementations choose (balances vs commitments)
interface IVault {
  function deposit(uint256 amount) external;
  function batchSettle(...) external;
  // Implementation-specific internals
}
```

#### 3. Keep Buyer/Seller Addresses Optional
```typescript
interface PaymentContext {
  scheme: PaymentScheme;
  buyerAddress?: string;  // Optional for private schemes
  sellerAddress: string;   // Always present (public OK)
  // ... rest of fields
}
```

## Implementation Roadmap

### Phase 1: Current (Done)
- [x] x402-exact (synchronous)
- [x] Infrastructure for multi-scheme

### Phase 2: Next (In Progress)
- [ ] x402-escrow-deferred (public escrow + batching)
- [ ] Vault contract with public balances
- [ ] Extensible QueueRecord

### Phase 3: Future (ZK Privacy)
- [ ] PrivateVault contract with commitments
- [ ] ZK circuit for note updates
- [ ] Facilitator note storage
- [ ] x402-private-escrow-deferred strategy
- [ ] Buyer note management UI

## Key Architectural Decision: Two Separate Vaults

**Design Principle**: Do NOT mix public and private escrow in the same vault.

### Rationale
1. **Simplicity**: Each vault has single, focused logic
2. **Gas Optimization**: Public vault stays cheap (~50k gas), private vault accepts higher cost (~300k+ gas)
3. **User Choice**: Buyer explicitly chooses privacy vs cost tradeoff
4. **MVP Viability**: Easier to implement and test separately

### Server-Side Implications

#### Environment Configuration
```bash
# Two vault addresses per chain
PUBLIC_VAULT_BASE_SEPOLIA=0x...
PRIVATE_VAULT_BASE_SEPOLIA=0x...
PUBLIC_VAULT_POLYGON_AMOY=0x...
PRIVATE_VAULT_POLYGON_AMOY=0x...
```

#### Facilitator: Two Queues + Two Settlers
```typescript
const publicQueue = new SettlementQueue();    // escrow-deferred
const privateQueue = new SettlementQueue();   // private-escrow-deferred

const publicSettler = new BatchSettler(publicQueue, PUBLIC_VAULT);
const privateSettler = new BatchSettler(privateQueue, PRIVATE_VAULT);
```

#### Seller: Two Strategies
```typescript
registry.register(new EscrowDeferredStrategy(PUBLIC_VAULT));
registry.register(new PrivateEscrowDeferredStrategy(PRIVATE_VAULT));

// Buyer chooses via query param
GET /api/content?scheme=x402-escrow-deferred        → Public
GET /api/content?scheme=x402-private-escrow-deferred → Private
```

#### Buyer: Scheme Selection
```bash
SCHEME=x402-escrow-deferred npm run buyer       # Public vault (cheap)
SCHEME=x402-private-escrow-deferred npm run buyer # Private vault (anonymous)
```

### Implementation Phases

**Phase 2 (Current Sprint)**: Public Escrow
- Deploy `PublicVault.sol` with balance mappings
- Implement `x402-escrow-deferred` scheme
- Test batching with public balances

**Phase 3 (Future)**: Private Escrow
- Deploy `PrivateVault.sol` with commitment mappings
- Implement ZK circuit for note updates
- Implement `x402-private-escrow-deferred` scheme
- Buyer note management

**No mixing. Clean separation.**

## Open Questions

1. **ZK System Choice**: Circom? Noir? Halo2?
2. **Note Recovery**: How does buyer recover notes if they lose device?
3. **Facilitator Encryption**: What key management for note storage?
4. **Proof Size**: Can we fit ZK proof in HTTP header? Or need body?
5. **Vault TVL**: How to prove total deposits without revealing individual balances?

## References
- Tornado Cash (commitment/nullifier pattern)
- Aztec Connect (private DeFi)
- Zcash Sapling (note encryption)
- MACI (anti-collusion via coordinator)

