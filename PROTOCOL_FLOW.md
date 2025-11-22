# x402 Payment Protocol - Complete Flow Documentation

## Scheme: x402-exact (Synchronous Settlement)

This document describes the **x402-exact** scheme implementation.

## Overview

The x402-exact scheme implements HTTP 402 Payment Required with **synchronous on-chain settlement** using EIP-3009 `transferWithAuthorization`. Payment is settled on-chain **before** content is delivered, providing strong guarantees for sellers at the cost of higher latency (~7-9 seconds).

This document details every step of the protocol from initial request to content delivery.

### Alternative Schemes

- **x402-escrow-deferred** (not yet implemented): Optimistic delivery with vault-based batch settlement for sub-second latency

## Architecture

```
┌──────────┐         ┌──────────┐         ┌──────────────┐
│  Buyer   │◄───────►│  Seller  │◄───────►│ Facilitator  │
│ (Client) │         │ (Server) │         │   (Server)   │
└──────────┘         └──────────┘         └──────────────┘
     │                     │                       │
     │                     │                       │
     └─────────────────────┴───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ USDC Token  │
                    │ (EIP-3009)  │
                    └─────────────┘
```

## Complete Protocol Flow

### Phase 1: Initial Request (No Payment)

**Step 1.1: Buyer → Seller (HTTP GET)**

```http
GET /api/content/premium HTTP/1.1
Host: localhost:4022
```

**Step 1.2: Seller → Buyer (HTTP 402 Response)**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Payment-Required: true

{
  "network": "base-sepolia",
  "token": "USDC",
  "tokenAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "amount": "0.01",
  "decimals": 6,
  "seller": "0x301541177dE41fBEF4924a911F1959185647b7A5",
  "resource": "/api/content/premium",
  "facilitator": "http://localhost:4023/settle",
  "chainId": 84532,
  "schemes": ["intent"],
  "expiresAt": 1700000000
}
```

**Key Information Provided:**

- Payment amount (human-readable and decimals)
- Seller's address (payment recipient)
- Token address (USDC contract)
- Facilitator endpoint (for settlement)
- Chain ID and network name
- Expiry time for payment intent

---

### Phase 2: Payment Intent Creation (Buyer-Side)

**Step 2.1: Query USDC Contract for EIP-712 Domain**

```javascript
// Buyer queries USDC contract
const domain = await getCachedUSDCDomain(
  tokenAddress,  // "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  chainId,       // 84532
  provider
);

// Returns:
{
  name: "USDC",      // Retrieved from contract.name()
  version: "2",      // Retrieved from contract.version()
  chainId: 84532,
  verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

**Step 2.2: Create Payment Intent**

```javascript
const intent = {
  seller: "0x301541177dE41fBEF4924a911F1959185647b7A5",
  buyer: "0x0AE6EF742a4347c9C5a9f7aF18b7455A6b78821E",
  amount: "10000", // 0.01 * 10^6 (converted to raw units)
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  nonce: "0xf5f389f36eae508aca0bbcae636604aa55ac9707c664f1967aacbe90c7fd58d7",
  expiry: 1700000180, // Unix timestamp (3 minutes from now)
  resource: "/api/content/premium",
  chainId: 84532,
};
```

**Step 2.3: Convert to EIP-3009 TransferWithAuthorization Format**

```javascript
const transferAuth = {
  from: "0x0AE6EF742a4347c9C5a9f7aF18b7455A6b78821E", // buyer
  to: "0x301541177dE41fBEF4924a911F1959185647b7A5", // seller
  value: "10000", // raw USDC units
  validAfter: 0, // valid immediately
  validBefore: 1700000180, // expiry
  nonce: "0xf5f389f36eae508aca0bbcae636604aa55ac9707c664f1967aacbe90c7fd58d7",
};
```

**Step 2.4: Sign with EIP-712 (Using USDC's Domain)**

```javascript
const signature = await signer.signTypedData(
  domain, // USDC's EIP-712 domain
  {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  transferAuth
);

// Returns:
("0x1bde4237f9eb4af76c06496a5612872b2f4393176e362892b316e4b98353e36304c02184e5f008676b79da0b5bc3a13525e6234b712c3949782b3fd11e4826c4");
```

**Critical: Why EIP-3009 is Gasless for Buyers**

- Traditional ERC-20 requires buyer to call `approve()` first (costs gas)
- EIP-3009 allows buyer to sign off-chain (no gas cost)
- Facilitator submits the signed authorization on-chain (pays gas)
- USDC contract verifies signature and executes transfer

---

### Phase 3: Payment Submission with Signature

**Step 3.1: Buyer → Seller (HTTP GET with X-Payment Header)**

```http
GET /api/content/premium HTTP/1.1
Host: localhost:4022
Content-Type: application/json
X-Payment: {"scheme":"intent","data":{"intent":{...},"signature":"0x1bde..."}}

{
  "scheme": "intent",
  "data": {
    "intent": {
      "seller": "0x301541177dE41fBEF4924a911F1959185647b7A5",
      "buyer": "0x0AE6EF742a4347c9C5a9f7aF18b7455A6b78821E",
      "amount": "10000",
      "token": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "nonce": "0xf5f389f36eae508aca0bbcae636604aa55ac9707c664f1967aacbe90c7fd58d7",
      "expiry": 1700000180,
      "resource": "/api/content/premium",
      "chainId": 84532
    },
    "signature": "0x1bde4237f9eb4af76c06496a5612872b2f4393176e362892b316e4b98353e36304c02184e5f008676b79da0b5bc3a13525e6234b712c3949782b3fd11e4826c4"
  },
  "metadata": {
    "network": "base-sepolia",
    "token": "USDC"
  }
}
```

**Step 3.2: Seller validates basic fields**

- Resource matches requested endpoint
- Seller address matches
- Amount matches expected payment (10000 raw units = 0.01 USDC)

---

### Phase 4: Facilitator Settlement (Synchronous)

**Step 4.1: Seller → Facilitator (HTTP POST)**

```http
POST /settle HTTP/1.1
Host: localhost:4023
Content-Type: application/json

{
  "scheme": "intent",
  "data": {
    "intent": {...},
    "signature": "0x1bde..."
  },
  "metadata": {...}
}
```

**Step 4.2: Facilitator Off-Chain Validation**

```javascript
// 1. Check expiry
if (intent.expiry < Math.floor(Date.now() / 1000)) {
  return { valid: false, error: "Payment intent expired" };
}

// 2. Check chain ID
if (intent.chainId !== 84532) {
  return { valid: false, error: "Invalid chain ID" };
}

// 3. Check token address
if (intent.token !== USDC_BASE_SEPOLIA) {
  return { valid: false, error: "Invalid token address" };
}

// 4. Check nonce uniqueness (prevent replay attacks)
if (usedNonces.has(`${intent.buyer}-${intent.nonce}`)) {
  return { valid: false, error: "Nonce already used" };
}

// 5. Verify EIP-3009 signature
const domain = await getCachedUSDCDomain(USDC_BASE_SEPOLIA, 84532, provider);
const transferAuth = paymentIntentToTransferAuth(intent);
const recoveredAddress = verifyTransferAuthorization(
  transferAuth,
  signature,
  USDC_BASE_SEPOLIA,
  84532,
  provider
);

// 6. Verify recovered address matches buyer
if (recoveredAddress !== intent.buyer) {
  return { valid: false, error: "Signature mismatch" };
}
```

**Step 4.3: Facilitator On-Chain Settlement**

```javascript
// Check buyer's USDC balance
const balance = await usdcContract.balanceOf(intent.buyer);
if (balance < BigInt(intent.amount)) {
  return { success: false, error: "Insufficient balance" };
}

// Check if nonce already used on-chain (additional safety)
const isUsed = await usdcContract.authorizationState(
  intent.buyer,
  intent.nonce
);
if (isUsed) {
  return { success: false, error: "Authorization already used on-chain" };
}

// Split signature into v, r, s components
const sig = ethers.Signature.from(signature);

// Execute transferWithAuthorization on USDC contract
const tx = await usdcContract.transferWithAuthorization(
  intent.buyer, // from
  intent.seller, // to
  intent.amount, // value (raw units)
  0, // validAfter
  intent.expiry, // validBefore
  intent.nonce, // nonce
  sig.v, // v
  sig.r, // r
  sig.s // s
);

// Wait for transaction confirmation
const receipt = await tx.wait();
```

**Step 4.4: Facilitator → Seller (HTTP 200 Response)**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "scheme": "intent",
  "status": "settled",
  "txHash": "0x8d4c1301512088f74c96064b9aacfcb64dd9d1e213a90b561c5ce944ec67f4c8",
  "amount": "10000",
  "receipt": {
    "blockNumber": 18123456,
    "gasUsed": "52341",
    "effectiveGasPrice": "0.001 gwei",
    "status": 1
  }
}
```

---

### Phase 5: Content Delivery

**Step 5.1: Seller verifies settlement**

```javascript
if (paymentResponse.status !== "settled") {
  return res.status(402).json({ error: "Payment settlement failed" });
}

// Settlement confirmed - deliver content
```

**Step 5.2: Seller → Buyer (HTTP 200 Response with Content)**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "content": {
    "title": "Premium AI Model Output",
    "data": {
      "model": "gpt-4",
      "response": "This is premium content available only to paying users.",
      "timestamp": "2025-11-22T02:36:24.650Z"
    },
    "metadata": {
      "contentType": "ai-response",
      "version": "1.0"
    }
  },
  "payment": {
    "txHash": "0x8d4c1301512088f74c96064b9aacfcb64dd9d1e213a90b561c5ce944ec67f4c8",
    "amount": "10000"
  }
}
```

---

## Key Protocol Features

### 1. **Synchronous Settlement**

- Payment is settled **before** content is delivered
- Seller has guarantee of payment
- Buyer receives content only after blockchain confirmation

### 2. **Gasless for Buyers (EIP-3009)**

- Buyer signs off-chain (no gas cost)
- Facilitator pays gas for on-chain execution
- Signature serves as authorization for transfer

### 3. **Security Features**

**Replay Attack Prevention:**

- Unique nonce for each payment
- Nonce tracked off-chain (in-memory) by facilitator
- Nonce tracked on-chain by USDC contract

**Expiry Protection:**

- Payment intents expire after 3 minutes
- Prevents stale signatures from being used

**Signature Verification:**

- EIP-712 structured data signing
- Signature verified both off-chain and on-chain
- Must match buyer's address

### 4. **Cross-Chain Compatible**

- Automatic USDC domain detection per chain
- Works on: Base, Ethereum, Arbitrum, Optimism, Polygon, Arc
- Each chain may have different USDC EIP-712 domains

---

## Timing Breakdown

**Typical transaction timing on Base Sepolia:**

| Step                   | Duration  | Notes                                          |
| ---------------------- | --------- | ---------------------------------------------- |
| Initial request        | ~50ms     | HTTP roundtrip                                 |
| 402 response           | ~50ms     | Payment requirements                           |
| Domain query           | ~1.3s     | First time (cached after)                      |
| EIP-712 signing        | ~15ms     | Off-chain, instant                             |
| Payment submission     | ~50ms     | HTTP to seller                                 |
| Seller validation      | ~5ms      | Local checks                                   |
| Facilitator validation | ~1.5s     | Includes domain query + signature verification |
| On-chain settlement    | ~3-5s     | Blockchain confirmation (1-2 blocks)           |
| Content delivery       | ~50ms     | HTTP response                                  |
| **Total**              | **~7-9s** | **End-to-end payment + delivery**              |

**Performance optimizations:**

- Domain caching reduces subsequent requests to ~5-6s total
- Could use optimistic delivery (deliver before full confirmation) for ~2-3s total
- Batch processing could amortize facilitator overhead

---

## Error Handling

### Buyer-Side Errors

- **Insufficient balance**: Detected before signing
- **Network issues**: Retry with exponential backoff
- **Signature rejection**: User cancelled in wallet

### Seller-Side Errors

- **Amount mismatch**: Return 400 with clear error
- **Resource mismatch**: Return 400
- **Seller address mismatch**: Return 400

### Facilitator-Side Errors

- **Expired intent**: Return 400
- **Invalid signature**: Return 400
- **Nonce replay**: Return 400
- **On-chain failure**: Return 402 with details
- **Insufficient gas**: Retry with higher gas price

---

## Comparison with Traditional Payment Flows

### x402 (This Implementation)

```
Request → 402 → Sign (off-chain) → Settle (on-chain) → Deliver
Total: ~7-9 seconds
Buyer gas cost: $0 (gasless)
```

### Traditional ERC-20 (with approval)

```
Request → 402 → Approve (on-chain tx) → Wait → Sign → TransferFrom → Deliver
Total: ~15-20 seconds
Buyer gas cost: $0.50-$2.00 (approval tx)
```

### Polygon x402 (Reference)

```
Request → 402 → Sign (EIP-3009) → Settle → Deliver
Total: ~2-3 seconds (Polygon is faster)
Buyer gas cost: $0 (gasless)
```

---

## Future Enhancements

1. **Batch Settlement**: Aggregate multiple payments into one transaction
2. **Optimistic Delivery**: Deliver content before full confirmation
3. **Payment Channels**: Use state channels for instant micropayments
4. **Multi-token Support**: Support other EIP-3009 compatible tokens
5. **Facilitator Fees**: Take small percentage for settlement service
6. **Dispute Resolution**: Smart contract escrow for disputed payments

---

## References

- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [EIP-712: Typed Structured Data Hashing and Signing](https://eips.ethereum.org/EIPS/eip-712)
- [HTTP 402 Payment Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)
- [Polygon x402 Reference Implementation](https://github.com/hamiha70/x402_exploration)
- [Circle USDC Contract Addresses](https://developers.circle.com/stablecoins/usdc-on-testnet)
