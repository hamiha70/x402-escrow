# The x402 Standard - Complete Reference

**Official Documentation Sources:**

- [x402.org](https://www.x402.org) - Official x402 Protocol Website
- [Polygon Agentic Docs](https://agentic-docs.polygon.technology/general/x402/intro/) - Polygon's x402 Documentation
- [Coinbase CDP x402](https://docs.cdp.coinbase.com/x402/) - Coinbase's x402 Implementation

**Last Updated:** November 22, 2025  
**Document Purpose:** Authoritative reference for x402 protocol implementation

---

## 1. Introduction

### What is x402?

The x402 protocol is an **open payment standard** that enables internet-native payments by utilizing the HTTP `402 Payment Required` status code. It allows users and autonomous agents to pay for web resources and API access without registration, OAuth flows, or complex authentication schemes.

### Key Innovation

x402 revives the long-dormant **HTTP 402 status code** (reserved since 1999 but never standardized) and defines a practical implementation for blockchain-based micropayments integrated directly into the HTTP request/response cycle.

### Core Principles

1. **HTTP-Native:** Payments are part of the HTTP protocol, not a separate payment flow
2. **Instant Authorization:** Resources are delivered immediately upon cryptographic payment authorization
3. **Blockchain Settlement:** Actual on-chain settlement can happen synchronously or asynchronously
4. **Chain-Agnostic:** Works with any EVM blockchain (and potentially non-EVM chains)
5. **Agent-Friendly:** Designed for autonomous agents making micropayments without human interaction

---

## 2. Protocol Overview

### High-Level Flow

```
1. Client → Server: GET /resource

2. Server → Client: 402 Payment Required
                     + Payment Instructions (amount, recipient, token, etc.)

3. Client signs payment authorization (off-chain)

4. Client → Server: GET /resource
                     + X-PAYMENT header (signed authorization)

5. Server validates payment signature

6. Server → Client: 200 OK
                     + Resource content

7. (Optional) Settlement to blockchain (immediate or deferred)
```

### Key Components

**Buyer:** The party requesting a paid resource (human or autonomous agent)

**Seller:** The service provider requiring payment for resources

**Facilitator:** Trusted third party that validates signatures and optionally handles settlement

---

## 3. HTTP 402 Status Code

### Definition

```
HTTP/1.1 402 Payment Required
```

**Purpose:** Indicates that payment is required before the requested resource can be accessed.

**Status:** Reserved by RFC 7231 but not standardized. The x402 protocol provides the first practical standardization.

### When to Return 402

A server SHOULD return `402 Payment Required` when:

- The requested resource requires payment
- No valid payment authorization is provided
- A provided payment authorization is invalid or expired

---

## 4. Payment Instructions Format

### HTTP 402 Response Body

When returning `402 Payment Required`, the server MUST include payment instructions in the response body.

**Standard Format:**

```json
{
  "error": "Payment required",
  "PaymentRequirements": [
    {
      "seller": "0x...", // Seller's blockchain address
      "amount": "0.01", // Human-readable amount
      "token": "USDC", // Token symbol
      "tokenAddress": "0x...", // Token contract address
      "decimals": 6, // Token decimals
      "chainId": 84532, // EVM chain ID
      "network": "base-sepolia", // Network name (human-readable)
      "resource": "/api/content", // Resource path
      "facilitator": "https://...", // Facilitator URL (optional)
      "schemes": ["intent"], // Supported payment schemes
      "expiresAt": 1700000000 // Unix timestamp (optional)
    }
  ]
}
```

**Required Fields:**

- `seller`: Recipient address
- `amount`: Payment amount (human-readable, e.g., "0.01")
- `token`: Token symbol or name
- `tokenAddress`: Token contract address
- `chainId`: Blockchain network ID
- `resource`: Resource being purchased

**Optional Fields:**

- `decimals`: Token decimals (default: infer from contract)
- `network`: Human-readable network name
- `facilitator`: Facilitator service URL
- `schemes`: Supported payment schemes (e.g., ["intent", "direct"])
- `expiresAt`: Payment requirement expiration timestamp

---

## 5. Payment Authorization Header

### X-PAYMENT Header

The buyer MUST include payment authorization in the `x-payment` HTTP header when retrying the request.

**Header Name:** `x-payment` (lowercase, following HTTP convention)

**Format:**

```http
GET /api/content HTTP/1.1
Host: seller.com
x-payment: <JSON payload>
```

### Payment Payload Structure

**Note:** The exact payload structure varies by implementation and payment scheme. The core requirement is that it MUST include:

1. **Payment Intent:** Details of what is being paid for
2. **Cryptographic Signature:** Proof of authorization from the buyer

**Common Format:**

```json
{
  "scheme": "intent",
  "data": {
    "intent": {
      "seller": "0x...",
      "buyer": "0x...",
      "amount": "10000", // Raw token units
      "token": "0x...",
      "nonce": "0xabc...",
      "expiry": 1700000180,
      "resource": "/api/content",
      "chainId": 84532
    },
    "signature": "0x..." // EIP-712 or equivalent signature
  }
}
```

---

## 6. Signature Requirements

### Cryptographic Authorization

The x402 protocol requires **cryptographic proof** that the buyer authorized the payment. This is typically done via:

**EIP-712 Typed Data Signing** (for EVM chains)

The signature MUST prove:

1. **Buyer identity:** Signature recovers to buyer's address
2. **Payment details:** Amount, recipient, token are signed
3. **Resource binding:** Specific resource path is included
4. **Replay protection:** Unique nonce prevents reuse
5. **Time-bound:** Expiry timestamp limits validity

### Signature Verification

The server or facilitator MUST verify:

1. Signature is cryptographically valid
2. Recovered address matches claimed buyer
3. Nonce has not been used before
4. Payment has not expired
5. Payment details match the request

---

## 7. Payment Schemes

### Supported Schemes

The x402 protocol supports multiple payment schemes:

#### 1. Intent-Based Payment (Recommended)

**Flow:**

1. Buyer signs payment intent off-chain
2. Server validates intent immediately
3. Content delivered instantly
4. Settlement happens asynchronously

**Benefits:**

- Low latency (~50ms)
- Gasless for buyer
- Batch settlement possible

#### 2. Direct On-Chain Payment

**Flow:**

1. Buyer submits blockchain transaction
2. Server waits for confirmation
3. Content delivered after confirmation

**Benefits:**

- Trustless (on-chain proof)
- No intermediaries needed

**Trade-offs:**

- High latency (2-10 seconds)
- Buyer pays gas fees

### Scheme Selection

Servers SHOULD indicate supported schemes in payment instructions:

```json
{
  "schemes": ["intent", "direct"]
}
```

Buyers SHOULD indicate which scheme they're using:

```json
{
  "scheme": "intent",
  "data": { ... }
}
```

---

## 8. Facilitators

### Purpose

A **facilitator** is an optional trusted third party that:

- Validates payment authorizations
- Handles on-chain settlement
- Maintains nonce tracking
- Provides signature verification services

### Why Use a Facilitator?

**For Sellers:**

- Offloads payment validation logic
- No need to track nonces
- Simplified integration

**For Buyers:**

- Single signature works across multiple sellers
- Potentially lower latency
- Batch settlement reduces costs

### Facilitator API

**Validation Endpoint:**

```http
POST /validate
Content-Type: application/json

{
  "payment": "<x-payment header content>",
  "resource": "/api/content",
  "seller": "0x...",
  "amount": "10000"
}
```

**Response:**

```json
{
  "valid": true,
  "buyer": "0x...",
  "nonce": "0xabc..."
}
```

### Settlement Endpoint

```http
POST /settle
Content-Type: application/json

{
  "scheme": "intent",
  "data": {
    "intent": { ... },
    "signature": "0x..."
  }
}
```

**Response:**

```json
{
  "status": "settled",
  "txHash": "0x...",
  "amount": "10000"
}
```

---

## 9. Replay Protection

### Nonce Requirements

Every payment authorization MUST include a **unique nonce** to prevent replay attacks.

**Properties:**

- 32 bytes (256 bits)
- Cryptographically random
- Never reused for same buyer

**Generation:**

```typescript
const nonce = ethers.keccak256(ethers.randomBytes(32));
```

### Nonce Tracking

**Off-Chain (Facilitator):**

- Maintains in-memory or database store of used nonces
- Rejects payment if nonce already seen

**On-Chain (Smart Contract):**

- USDC EIP-3009: Contract tracks nonces per address
- Custom contracts: Implement nonce mapping

**Best Practice:** Track nonces both off-chain (fast rejection) and on-chain (ultimate security)

---

## 10. Security Considerations

### Signature Verification

**MUST verify:**

- Signature is cryptographically valid (recovers correct address)
- Signer matches claimed buyer address
- All payment parameters are signed (not just some)

**MUST NOT:**

- Trust client-provided buyer address without signature verification
- Accept expired payments
- Accept replayed nonces

### Resource Binding

**Critical:** The payment authorization MUST be bound to the specific resource being purchased.

**Why:** Without resource binding, a seller could use a buyer's signature to access different (more expensive) resources.

**Implementation:** Include resource path in signed message

### Expiry Enforcement

Payments SHOULD have short expiry times (e.g., 3-5 minutes) to:

- Limit exposure from signature leaks
- Prevent stale price quotes
- Reduce nonce tracking requirements

### HTTPS Required

The x402 protocol SHOULD only be used over HTTPS to prevent:

- Man-in-the-middle attacks
- Payment authorization interception
- Replay attacks via network sniffing

---

## 11. Error Handling

### 402 Payment Required

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "Payment required",
  "PaymentRequirements": [{ ... }]
}
```

### 400 Bad Request

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid payment authorization",
  "details": "Signature verification failed"
}
```

**When to use:**

- Malformed payment header
- Invalid signature
- Expired payment
- Nonce replay detected

### 503 Service Unavailable

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": "Payment processing unavailable",
  "details": "Facilitator unreachable"
}
```

**When to use:**

- Facilitator down
- Blockchain RPC error
- Temporary service disruption

---

## 12. Chain Support

### EVM Chains

The x402 protocol is designed to work with any EVM-compatible blockchain:

**Supported Networks:**

- Ethereum (Mainnet, Sepolia)
- Base (Mainnet, Sepolia)
- Polygon (PoS, Amoy)
- Arbitrum (One, Sepolia)
- Optimism (Mainnet, Sepolia)
- And any other EVM chain

**Chain Identification:**

- Use standard EIP-155 chain IDs
- Include chain ID in payment instructions and authorization

### Non-EVM Chains

While the protocol is EVM-focused, the core concepts can be adapted to:

- Solana (using different signature schemes)
- Bitcoin Lightning Network
- Other L1/L2 solutions

---

## 13. Token Support

### Primary Token: USDC

Most x402 implementations use **USDC** (USD Coin) because:

- Stable value (pegged to USD)
- Wide availability across chains
- Native EIP-3009 support (gasless transfers)
- High liquidity

### Other Tokens

The protocol supports any ERC-20 token:

- Native chain tokens (ETH, MATIC, etc.)
- Stablecoins (USDT, DAI, etc.)
- Governance tokens
- Custom project tokens

**Requirements:**

- Token MUST be deployable on the same chain as the seller
- Buyer and seller MUST agree on token
- Amount calculations MUST account for token decimals

---

## 14. Use Cases

### API Monetization

**Example:** Pay-per-call APIs

```typescript
// Traditional: Free/subscription only
GET /api/data → 200 OK (or 401 if not subscribed)

// x402: Pay per use
GET /api/data → 402 Payment Required
GET /api/data + payment → 200 OK
```

**Benefits:**

- No subscription management
- Usage-based pricing
- Immediate revenue

### Content Paywalls

**Example:** Premium articles

```typescript
GET /article/premium → 402 Payment Required (0.10 USDC)
GET /article/premium + payment → 200 OK + full article
```

### Agent-to-Agent Payments

**Example:** AI agents buying services from other agents

```typescript
// Weather Agent buying data from API
weatherAgent.request("/forecast", {
  payment: signPayment(0.01, weatherAPI),
});
```

### Micropayments

**Example:** Pay-per-query LLM access

```
Query: "Summarize this article"
Cost: $0.001 (0.001 USDC)
Payment: Signed authorization
Response: AI summary
```

---

## 15. Implementation Guidelines

### For Sellers (Service Providers)

**Minimum Implementation:**

1. Return `402 Payment Required` for protected resources
2. Include payment instructions in response body
3. Accept payment in `x-payment` header
4. Validate signature
5. Deliver content if payment valid

**Recommended:**

- Use a facilitator for validation
- Implement nonce tracking
- Set appropriate expiry times (3-5 minutes)
- Support multiple chains/tokens

### For Buyers (Clients/Agents)

**Minimum Implementation:**

1. Detect `402` status code
2. Parse payment instructions
3. Sign payment authorization
4. Retry request with `x-payment` header
5. Handle errors gracefully

**Recommended:**

- Cache payment authorizations for same resource
- Implement retry logic with exponential backoff
- Track spending for autonomous agents
- Support multiple payment schemes

### For Facilitators

**Core Responsibilities:**

1. Validate payment signatures
2. Track nonces to prevent replay
3. Optionally handle settlement
4. Provide high availability
5. Support multiple chains

---

## 16. Reference Implementations

### Official Implementations

- **Polygon Facilitator:** https://x402.polygon.technology
- **Coinbase CDP x402:** https://docs.cdp.coinbase.com/x402/

### Open Source Libraries

- **x402-express:** Express.js middleware
- **x402-axios:** Axios interceptor for buyers
- **x402facilitators:** NPM package for facilitator integration

### Example Code

**Seller (Express.js):**

```typescript
app.get("/api/content", async (req, res) => {
  const payment = req.headers["x-payment"];

  if (!payment) {
    return res.status(402).json({
      error: "Payment required",
      PaymentRequirements: [
        {
          seller: SELLER_ADDRESS,
          amount: "0.01",
          token: "USDC",
          tokenAddress: USDC_ADDRESS,
          chainId: 84532,
          resource: "/api/content",
        },
      ],
    });
  }

  const valid = await validatePayment(payment);
  if (!valid) {
    return res.status(400).json({ error: "Invalid payment" });
  }

  res.json({ content: "Premium content" });
});
```

**Buyer (Node.js):**

```typescript
async function buyContent(url: string) {
  // Try without payment
  let response = await fetch(url);

  if (response.status === 402) {
    // Get payment requirements
    const requirements = await response.json();

    // Sign payment
    const payment = await signPayment(requirements);

    // Retry with payment
    response = await fetch(url, {
      headers: { "x-payment": JSON.stringify(payment) },
    });
  }

  return response.json();
}
```

---

## 17. Comparison with Other Standards

### vs. OAuth 2.0

| Aspect         | x402               | OAuth 2.0             |
| -------------- | ------------------ | --------------------- |
| **Purpose**    | Payment            | Authorization         |
| **Setup**      | None (pay-per-use) | Registration required |
| **Tokens**     | None               | Access/refresh tokens |
| **Expiry**     | Per-payment        | Token lifetime        |
| **Revocation** | Automatic          | Manual                |

### vs. API Keys

| Aspect         | x402          | API Keys      |
| -------------- | ------------- | ------------- |
| **Payment**    | Per-use       | Subscription  |
| **Tracking**   | On-chain      | Database      |
| **Security**   | Cryptographic | Secret string |
| **Revocation** | Automatic     | Manual        |

### vs. Stripe/PayPal

| Aspect          | x402            | Stripe           |
| --------------- | --------------- | ---------------- |
| **Integration** | HTTP native     | Separate flow    |
| **Settlement**  | On-chain        | Centralized      |
| **Fees**        | Blockchain fees | 2.9% + $0.30     |
| **Speed**       | Instant auth    | 2-3 seconds      |
| **Agents**      | Native support  | Requires account |

---

## 18. Future Extensions

### Planned Enhancements

1. **Refunds:** Protocol for seller-initiated refunds
2. **Disputes:** Escrow-based dispute resolution
3. **Subscriptions:** Time-based access passes
4. **Bundles:** Pay once for multiple resources
5. **Cross-chain:** Pay on one chain, deliver on another

### Community Proposals

The x402 protocol is open for community extensions. Proposals should:

- Maintain backward compatibility
- Preserve core principles (HTTP-native, instant auth)
- Be implementable across chains
- Not require protocol changes for basic use cases

---

## 19. Testing and Development

### Testnet Support

All major implementations support testnets:

- **Ethereum Sepolia**
- **Base Sepolia**
- **Polygon Amoy**
- **Arbitrum Sepolia**
- **Optimism Sepolia**

### Faucets for Testing

- USDC test tokens available from Circle faucets
- Native tokens (ETH, MATIC) from network faucets

### Example Test Flow

```bash
# 1. Fund test wallet
npm run fund

# 2. Start test servers
npm run start

# 3. Run test buyer
npm run demo:exact

# 4. Verify on testnet explorer
```

---

## 20. Compliance and Legal

### Regulatory Considerations

**Payment Processing:**

- x402 facilitators may be subject to money transmission laws
- Sellers should comply with tax reporting requirements
- Cross-border payments may require additional compliance

**Know Your Customer (KYC):**

- x402 protocol itself is permissionless
- Individual implementations may add KYC requirements
- Facilitators may enforce allowlists/denylists

**Best Practices:**

- Consult legal counsel for your jurisdiction
- Implement appropriate AML/KYC for high-value transactions
- Maintain transaction records for auditing

---

## 21. Performance Benchmarks

### Latency by Scheme

**Intent-Based (Asynchronous Settlement):**

- Authorization: ~50ms
- Settlement: 2-10 seconds (background)

**Direct (Synchronous Settlement):**

- Authorization + Settlement: 2-10 seconds
- Block confirmation dependent

### Throughput

**Theoretical:**

- Limited by blockchain block time and gas limits
- Practical: 1000+ payments/second (async, batched)

**Measured (Base Sepolia):**

- Synchronous: ~10 seconds per payment
- Asynchronous: ~50ms per authorization

---

## 22. Resources and Links

### Official Documentation

- **x402.org:** https://www.x402.org
- **Polygon Agentic Docs:** https://agentic-docs.polygon.technology/general/x402/intro/
- **Coinbase CDP:** https://docs.cdp.coinbase.com/x402/

### Community

- **GitHub:** Search "x402" for implementations
- **Discord:** Various x402 developer communities
- **Twitter/X:** #x402 hashtag

### This Implementation

- **Repository:** `/home/hamiha70/Projects/ETHGlobal/x402-escrow`
- **Scheme:** x402-exact (synchronous settlement with EIP-3009)
- **Status:** Base Sepolia testnet deployed and tested

---

## 23. Glossary

**402 Payment Required:** HTTP status code indicating payment is needed

**Buyer:** Party requesting and paying for a resource

**Chain ID:** Unique identifier for blockchain networks (EIP-155)

**EIP-712:** Ethereum standard for typed data signing

**EIP-3009:** USDC standard for gasless token transfers

**Facilitator:** Optional third party handling payment validation and settlement

**Intent:** Off-chain payment authorization signed by buyer

**Nonce:** Unique value preventing signature replay attacks

**Seller:** Service provider requiring payment for resources

**Settlement:** On-chain transfer of tokens

**x-payment:** HTTP header containing payment authorization

---

## Appendix: Header Reference

### Request Headers

| Header      | Required          | Description                |
| ----------- | ----------------- | -------------------------- |
| `x-payment` | For paid requests | JSON payment authorization |

### Response Headers

| Header               | Required | Description                         |
| -------------------- | -------- | ----------------------------------- |
| `x-payment-response` | Optional | Payment confirmation (txHash, etc.) |

### Standard HTTP Headers

Standard HTTP headers (Content-Type, Authorization, etc.) continue to work alongside x402.

---

**Document Version:** 1.0  
**Protocol Version:** x402 (current)  
**Maintained By:** Open x402 Community  
**License:** This documentation is provided for reference purposes. The x402 protocol is open and permissionless.
