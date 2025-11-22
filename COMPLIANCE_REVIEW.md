# x402 Standard Compliance Review

**Date:** November 22, 2025  
**Purpose:** Systematic comparison of our implementation against the x402 standard  
**Outcome:** Document differences and decide: keep with justification OR change

---

## Review Methodology

For each aspect of the protocol:

1. ✅ **COMPLIANT** - Matches standard, no action needed
2. ⚠️ **DIFFERENT** - Deviates from standard, needs decision
3. ❌ **NON-COMPLIANT** - Violates standard, must fix

**Decision Criteria:**

- **Keep difference**: Only if we have a clear technical or design reason
- **Change to standard**: Default action for any difference without strong justification

---

## 1. HTTP Status Codes

### Standard Requirement

- Use `402 Payment Required` for resources requiring payment

### Our Implementation

```typescript
// seller/server.ts line 127
return res.status(402).json({
  error: "Payment required",
  PaymentRequirements: [requirements],
});
```

**Status:** ✅ **COMPLIANT**

---

## 2. HTTP Header Names

### Standard Requirement

- Payment header: `x-payment` (lowercase)
- Optional response header: Not standardized

### Our Implementation

**Buyer (buyer/agent.ts line 141):**

```typescript
headers: {
  "X-PAYMENT": JSON.stringify(payload),
}
```

**Seller (seller/server.ts line 119):**

```typescript
const paymentHeader = req.headers["x-payment"];
```

**Demo (scripts/demo-exact.ts line 337):**

```typescript
"X-Payment": JSON.stringify(payload),
```

**Status:** ⚠️ **INCONSISTENT - MUST FIX**

**Problem:**

- Mixed case: `X-PAYMENT`, `x-payment`, `X-Payment`
- HTTP headers are case-insensitive but convention is lowercase
- x402 standard uses lowercase

**Decision:** ❌ **CHANGE TO STANDARD**

- Use lowercase `x-payment` everywhere
- Reason: Follow HTTP convention and x402 standard

**Action Items:**

1. Update buyer/agent.ts: `X-PAYMENT` → `x-payment`
2. Update demo-exact.ts: `X-Payment` → `x-payment`
3. Update all documentation
4. Keep seller as-is (already correct)

---

## 3. Payment Requirements Format (402 Response)

### Standard Format

```json
{
  "error": "Payment required",
  "PaymentRequirements": [
    {
      "seller": "0x...",
      "amount": "0.01",
      "token": "USDC",
      "tokenAddress": "0x...",
      "chainId": 84532,
      "resource": "/api/content"
    }
  ]
}
```

### Our Implementation

```json
{
  "error": "Payment required",
  "PaymentRequirements": [
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
  ]
}
```

**Differences:**

1. ✅ Extra fields: `network`, `decimals`, `facilitator`, `schemes`, `expiresAt`
2. ✅ Array wrapper: `PaymentRequirements: [...]`

**Status:** ✅ **COMPLIANT WITH EXTENSIONS**

**Decision:** ✅ **KEEP**

- Reason: Standard says these are optional/recommended fields
- Our extra fields provide useful information
- Array format allows multiple payment options (future extension)
- No breaking changes to standard format

---

## 4. Payment Header Format (x-payment)

### Standard Format (Conceptual)

```json
{
  "scheme": "intent",
  "data": {
    "intent": { ... },
    "signature": "0x..."
  }
}
```

### Our Implementation

```json
{
  "scheme": "intent",
  "data": {
    "intent": {
      "seller": "0x...",
      "buyer": "0x...",
      "amount": "10000",
      "token": "0x...",
      "nonce": "0x...",
      "expiry": 1700000180,
      "resource": "/api/content/premium",
      "chainId": 84532
    },
    "signature": "0x..."
  },
  "metadata": {
    "network": "base-sepolia",
    "token": "USDC"
  }
}
```

**Differences:**

1. ⚠️ Extra `metadata` wrapper
2. ✅ All standard fields present

**Status:** ⚠️ **NON-STANDARD WRAPPER**

**Analysis:**

- `metadata` is not part of standard
- Contains redundant information (network/token already in intent)
- Adds complexity without clear benefit

**Decision:** ❌ **CHANGE - REMOVE METADATA**

- Reason: Unnecessary, not in standard, adds bloat
- All needed info already in `intent` structure

**Action Items:**

1. Remove `metadata` from buyer payload generation
2. Update seller to not expect `metadata`
3. Update demo script
4. Update documentation

---

## 5. Payment Intent Structure

### Standard Requirements

- Must include: seller, buyer, amount, token, nonce, expiry, resource, chainId
- Amount should be in smallest token units (wei-equivalent)

### Our Implementation

```typescript
{
  seller: "0x...",
  buyer: "0x...",
  amount: "10000",      // ✅ Raw units (0.01 USDC * 10^6)
  token: "0x...",       // ✅ Token address
  nonce: "0x...",       // ✅ Unique nonce
  expiry: 1700000180,   // ✅ Unix timestamp
  resource: "/api/content/premium",  // ✅ Resource path
  chainId: 84532        // ✅ Chain ID
}
```

**Status:** ✅ **COMPLIANT**

---

## 6. Signature Format

### Standard Requirement

- EIP-712 typed data signing
- Signature must cover all payment parameters including resource

### Our Implementation

**Currently:** We sign EIP-3009 TransferWithAuthorization format:

```typescript
{
  from: "0x...",
  to: "0x...",
  value: "10000",
  validAfter: 0,
  validBefore: 1700000180,
  nonce: "0x..."
  // ❌ NO RESOURCE FIELD
}
```

**Signature Domain:** USDC token contract

```typescript
{
  name: "USDC",
  version: "2",
  chainId: 84532,
  verifyingContract: "0x036CbD..." // USDC address
}
```

**Status:** ⚠️ **PARTIALLY COMPLIANT**

**Problems:**

1. ❌ Resource field NOT in signed message (EIP-3009 limitation)
2. ⚠️ Using USDC domain instead of x402 domain for HTTP authorization

**Analysis:**

- x402 standard requires resource binding in signature
- EIP-3009 is for settlement layer, not HTTP authorization layer
- Should have TWO signatures:
  - x402 signature (HTTP auth with resource)
  - EIP-3009 signature (blockchain settlement)

**Decision:** ⚠️ **REQUIRES DISCUSSION**

**Options:**

**Option A: Keep Current (Single Signature)**

- Pro: Simpler implementation
- Pro: Direct EIP-3009 signature is trustless on-chain
- Con: Resource binding only validated off-chain (facilitator)
- Con: Not fully x402 compliant (no cryptographic resource binding)

**Option B: Add x402 Signature (Two Signatures)**

- Pro: Full x402 compliance
- Pro: Cryptographic resource binding
- Pro: Matches Polygon reference implementation
- Con: More complex (buyer signs twice)
- Con: Settlement signature separate from auth signature

**Recommendation:** 🤔 **NEEDS USER DECISION**

This is the BIGGEST difference. The question is:

- Do we need cryptographic resource binding at the HTTP layer?
- Or is off-chain validation by facilitator sufficient?
- Is the added complexity of two signatures worth it?

---

## 7. Nonce Format

### Standard Requirement

- 32 bytes (256 bits)
- Cryptographically random
- Unique per payment

### Our Implementation

```typescript
export function generateNonce(): string {
  const timestamp = Date.now();
  const random = ethers.hexlify(ethers.randomBytes(24));
  const combined = ethers.concat([ethers.toBeHex(timestamp, 8), random]);
  return ethers.keccak256(combined);
}
```

**Status:** ✅ **COMPLIANT WITH ENHANCEMENT**

**Decision:** ✅ **KEEP**

- Reason: Still 32 bytes, cryptographically secure
- Added benefit: Embedded timestamp aids debugging
- No impact on security or compliance

---

## 8. Nonce Tracking

### Standard Requirement

- Track used nonces to prevent replay attacks
- Can be off-chain (facilitator) and/or on-chain (contract)

### Our Implementation

**Off-chain (facilitator/server.ts line 56):**

```typescript
const usedNonces = new Set<string>();
```

**On-chain (via USDC EIP-3009):**

```typescript
const isUsed = await usdcContract.authorizationState(
  intent.buyer,
  intent.nonce
);
```

**Status:** ✅ **COMPLIANT**

**Decision:** ✅ **KEEP**

- Dual-layer protection (off-chain + on-chain)
- Exceeds standard requirements

---

## 9. Expiry Validation

### Standard Requirement

- Payment intents should have expiry timestamps
- Typical: 3-5 minutes

### Our Implementation

```typescript
// buyer/agent.ts line 80
const expiry = Math.floor(Date.now() / 1000) + 180; // 3 minutes

// facilitator/server.ts line 69
if (intent.expiry < Math.floor(Date.now() / 1000)) {
  return { valid: false, error: "Payment intent expired" };
}
```

**Status:** ✅ **COMPLIANT**

**Decision:** ✅ **KEEP**

- 3 minutes is within recommended range

---

## 10. Settlement Timing

### Standard Options

- **Asynchronous (deferred):** Validate intent → deliver content → settle later
- **Synchronous (immediate):** Validate intent → settle on-chain → deliver content

### Our Implementation

```
x402-exact scheme: SYNCHRONOUS
- Facilitator waits for blockchain confirmation
- Content delivered after settlement
- ~7-9 seconds latency
```

**Status:** ✅ **COMPLIANT** (Valid Design Choice)

**Decision:** ✅ **KEEP**

- Reason: Both approaches are valid per x402 standard
- Synchronous provides stronger guarantee for sellers
- We're building BOTH schemes (exact + escrow-deferred)
- Documented clearly as a design choice

---

## 11. Response Header

### Standard

- No standardized response header

### Our Implementation

```typescript
// seller/server.ts line 195
.header("X-PAYMENT-RESPONSE", JSON.stringify(paymentResponse))
```

**Status:** ✅ **EXTENSION** (Not in standard but not prohibited)

**Decision:** ⚠️ **REVIEW CASE CONSISTENCY**

**Current:** `X-PAYMENT-RESPONSE` (uppercase)

**Options:**

- A: Keep uppercase (matches our current X-PAYMENT)
- B: Change to lowercase `x-payment-response` (HTTP convention)
- C: Remove entirely (not in standard)

**Recommendation:** Change to lowercase `x-payment-response` if we fix x-payment to lowercase

---

## 12. Error Responses

### Standard Requirements

- 400 for invalid payment
- 503 for service unavailable

### Our Implementation

```typescript
// 400 for validation failures
res.status(400).json({ error: "..." });

// 402 for settlement failures
res.status(402).json({ error: "Payment settlement failed" });

// No 503 implemented
```

**Status:** ⚠️ **PARTIALLY COMPLIANT**

**Issues:**

1. ✅ 400 for invalid payment - correct
2. ⚠️ 402 for settlement failure - should be 503 or 500
3. ❌ No 503 for facilitator unavailable

**Decision:** ❌ **CHANGE**

**Action Items:**

1. Settlement failures → 500 (server error) or 503 (service unavailable)
2. Add 503 handling when facilitator unreachable
3. Reserve 402 ONLY for "payment required" (first request)

---

## 13. HTTPS Requirement

### Standard

- x402 SHOULD only be used over HTTPS

### Our Implementation

- ⚠️ HTTP in development (localhost)
- ⚠️ No HTTPS enforcement

**Status:** ⚠️ **DEV MODE**

**Decision:** ✅ **ACCEPTABLE FOR DEV**

- Add documentation warning about HTTPS for production
- No code changes needed now
- Add HTTPS check/warning in production mode

---

## Summary of Required Changes

### 🔴 MUST FIX (Breaking Standard)

1. **Header Name Consistency**

   - Change all `X-PAYMENT` / `X-Payment` to `x-payment`
   - Change `X-PAYMENT-RESPONSE` to `x-payment-response`
   - Files: buyer/agent.ts, demo-exact.ts, all docs

2. **Remove Metadata Wrapper**

   - Remove `metadata` from x-payment payload
   - Files: buyer/agent.ts, demo-exact.ts, seller/server.ts

3. **Fix Error Status Codes**
   - Settlement failures: 402 → 500/503
   - Add 503 for facilitator unavailable
   - File: seller/server.ts, facilitator/server.ts

### 🟡 SHOULD DISCUSS (Design Decision)

4. **Two-Signature Pattern**
   - Current: Single EIP-3009 signature
   - Standard suggests: x402 signature + settlement signature
   - Question: Is cryptographic resource binding needed?
   - Impact: Significant implementation change

### 🟢 KEEP AS-IS (Justified Differences)

5. **Extended PaymentRequirements**

   - Our extra fields are useful and optional
   - No breaking change to standard

6. **Enhanced Nonce Generation**

   - Still compliant, adds debugging value

7. **Synchronous Settlement**
   - Valid design choice per standard
   - Clearly documented

---

## Next Steps

1. **Implement Must-Fix Changes** (header names, metadata, errors)
2. **Decide on Two-Signature Pattern** (User decision required)
3. **Update Documentation** (reflect all changes)
4. **Re-run Tests** (ensure nothing breaks)
5. **Update Demo** (show compliance)

---

## Decision Required From User

**CRITICAL DECISION: Two-Signature Pattern**

Should we implement the two-signature pattern like Polygon's reference?

**Current State:**

- Single EIP-3009 signature
- Resource binding validated off-chain only

**Proposed State:**

- x402 signature (HTTP auth with resource)
- EIP-3009 signature (blockchain settlement)
- Resource binding validated cryptographically

**Trade-offs:**

- ✅ Pro: Full x402 compliance, trustless resource binding
- ❌ Con: More complex, buyer signs twice, larger payload

**User Input Needed:** Keep single signature OR implement two-signature pattern?

---

**Document Version:** 1.0  
**Status:** Awaiting decisions on yellow items  
**Next Review:** After implementing must-fix changes
