# Escrow-Deferred Spec Summary

## Key Interfaces Extracted from Spec

### PaymentIntent (for Escrow-Deferred)

Same structure as exact scheme, but signed with **vault's EIP-712 domain** instead of x402 domain:

```typescript
interface PaymentIntent {
  buyer: string;
  seller: string;
  amount: string;      // uint256 in token units
  token: string;       // address
  nonce: string;       // bytes32
  expiry: number;      // uint256 unix timestamp
  resource: string;    // string (canonical resource path)
  chainId: number;     // uint256
}
```

### Vault Contract Interface

```solidity
contract Vault {
  IERC20 public token;
  mapping(address => uint256) public deposits;
  mapping(address => mapping(bytes32 => bool)) public usedNonces;
  
  function deposit(uint256 amount) external;
  function batchWithdraw(
    PaymentIntent[] calldata intents,
    bytes[] calldata signatures
  ) external;
  
  event IntentSettled(
    address indexed buyer,
    address indexed seller,
    uint256 amount,
    bytes32 nonce,
    string resource,
    uint256 indexed txBatchId
  );
}
```

### PaymentRequirements (402 Response)

For escrow-deferred, includes additional fields:

```typescript
interface PaymentRequirements {
  scheme: "x402-escrow-deferred";
  network: string;
  token: "USDC";
  tokenAddress: string;
  amount: string;
  decimals: number;
  seller: string;
  resource: string;
  facilitator: string;  // Points to /validate-intent
  chainId: number;
  vault: string;        // NEW: Vault contract address
  escrow: {             // NEW: Escrow metadata
    type: "vault-pool";
    mode: "deferred";
  };
  expiresAt?: number;
}
```

### PaymentResponse (x-payment-response header)

For escrow-deferred, status is "pending" not "settled":

```typescript
interface PaymentResponse {
  scheme: "x402-escrow-deferred";
  status: "pending" | "settled" | "failed";
  mode: "deferred";
  intentNonce: string;  // Instead of txHash for pending
  amount: string;
  seller: string;
  buyer: string;
  token: string;
  txHash?: string;      // Only present when settled
  error?: string;
}
```

## Facilitator Responsibilities

### POST /validate-intent (Escrow-Deferred)

**Input**:
- PaymentRequirements (from 402)
- PaymentIntent + signature (from buyer)

**Validation**:
1. Reconstruct expected PaymentIntent from requirements
2. Compare all fields match
3. Verify EIP-712 signature against vault domain
4. Check expiry
5. Query vault for `deposits[buyer] >= amount`
6. Check off-chain nonce tracking

**Output**:
- Success: Return receipt with `status: "pending"`, add to queue
- Failure: Return error

### Settlement Queue Structure

```typescript
interface QueueRecord {
  scheme: "x402-escrow-deferred";
  chainId: number;
  vault: string;
  buyer: string;
  seller: string;
  amount: string;
  nonce: string;
  resource: string;
  intent: PaymentIntent;
  signature: string;
  status: "pending" | "settled" | "failed";
  txHash?: string;
  error?: string;
  createdAt: number;
  settledAt?: number;
}
```

## MVP Simplifications

1. **No multi-option 402**: Each endpoint advertises exactly one scheme
2. **Simple queue storage**: In-memory or file-based for MVP (SQLite later)
3. **Manual worker trigger**: Settlement worker runs on-demand for demo
4. **Single vault per chain**: One vault deployment per chain

## Differences from Exact Scheme

| Aspect | Exact | Escrow-Deferred |
|--------|-------|-----------------|
| **Settlement** | Immediate (before 200) | Deferred (after 200) |
| **Domain** | x402-Payment-Intent | Vault contract |
| **Signatures** | x402 + EIP-3009 | Single vault-domain |
| **Facilitator** | `/settle` (sync) | `/validate-intent` (async) |
| **Response** | `status: "settled"` | `status: "pending"` |
| **On-chain** | Direct USDC transfer | Vault batchWithdraw |

