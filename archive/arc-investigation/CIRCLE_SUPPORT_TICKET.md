# Circle Arc Testnet Support Request

**Project**: x402 Payment Protocol (ETHGlobal Bangkok Hackathon)  
**Developer**: @hamiha70  
**Date**: November 22, 2024  
**Chain**: Arc Testnet (Chain ID: 1243)

---

## Executive Summary

We've successfully implemented multi-chain USDC payment protocol working on Base Sepolia, Polygon Amoy, Arbitrum Sepolia, and Optimism Sepolia. However, Arc Testnet has **two critical issues** preventing full integration:

1. ✅ **WORKING**: Standard `transfer()` and native token transfers
2. ❌ **BROKEN**: EIP-3009 `transferWithAuthorization()` - signature validation fails
3. ❌ **BLOCKED**: Contract deployment timing out

---

## Issue #1: EIP-3009 `transferWithAuthorization` Signature Validation Fails

### Problem

USDC contract at `0x3600000000000000000000000000000000000000` reverts with:

```
FiatTokenV2: invalid signature
```

### What We Know

**✅ Contract has the function:**

- Implementation: `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8`
- Contains `transferWithAuthorization` (selector: `0xe3ee160e`)
- Function exists in bytecode ✓

**✅ On-chain domain values:**

```javascript
name():             "USDC"
version():          "2"
decimals():         6
DOMAIN_SEPARATOR(): 0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0
```

**❌ Domain calculation mismatch:**

```javascript
// Our calculation (standard EIP-712)
{
  name: "USDC",
  version: "2",
  chainId: 1243,
  verifyingContract: "0x3600000000000000000000000000000000000000"
}
// Result: 0x94e71d8b08285b2ec4c4f03b6112a4f27c3298282ff3528528bfa907be5c4b37

// Actual on-chain: 0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0
// ❌ MISMATCH
```

### What We Tried

**Tested 10,000+ combinations:**

- ✗ chainId variations (0-10000)
- ✗ Different verifyingContract (proxy vs implementation)
- ✗ Different name values ("USD Coin", "FiatTokenV2_2")
- ✗ Different version values ("1", "")
- ✗ With/without salt field
- ✗ All combinations failed to match

**ERC-5267 check:**

- `eip712Domain()` call fails (not implemented)

### Why Arc is Different

Arc uses **dual-interface USDC** (native gas token + ERC-20):

- Native: 18 decimals (gas precision)
- ERC-20: 6 decimals (standard USDC)
- Special precompile at `0x3600...0000`

**Hypothesis**: The precompile may use non-standard EIP-712 domain parameters.

### Working Comparison

| Chain            | EIP-3009 Status | Notes                        |
| ---------------- | --------------- | ---------------------------- |
| Base Sepolia     | ✅ Working      | Standard USDC implementation |
| Polygon Amoy     | ✅ Working      | Standard USDC implementation |
| Arbitrum Sepolia | ✅ Working      | Standard USDC implementation |
| Optimism Sepolia | ✅ Working      | Standard USDC implementation |
| **Arc Testnet**  | ❌ **FAILS**    | Precompile, domain mismatch  |

### Error Details

**Demo failure log:**

```json
{
  "network": "arc",
  "error": "Request failed with status code 500",
  "phases": [
    { "phase": "Phase 1", "duration": 16, "status": "OK" },
    {
      "phase": "Phase 2",
      "duration": 2259,
      "status": "OK - signatures created"
    },
    { "phase": "Phase 3", "status": "FAILED - facilitator settlement rejected" }
  ]
}
```

**Server-side error** (from facilitator):

```
FiatTokenV2: invalid signature
```

### Code References

**Our EIP-3009 implementation:**

```typescript
// We follow Circle's standard pattern
const transferAuth = {
  from: buyer,
  to: seller,
  value: amount,
  validAfter: 0,
  validBefore: expiry,
  nonce: generateNonce(),
};

// Domain queried dynamically from USDC contract
const domain = {
  name: await usdcContract.name(), // "USDC"
  version: await usdcContract.version(), // "2"
  chainId: 1243,
  verifyingContract: "0x3600000000000000000000000000000000000000",
};

// Signature created with ethers.js Signer._signTypedData
const signature = await signer.signTypedData(domain, types, transferAuth);
```

**Facilitator settlement call:**

```typescript
const tx = await usdcContract.transferWithAuthorization(
  transferAuth.from,
  transferAuth.to,
  BigInt(transferAuth.value),
  transferAuth.validAfter,
  transferAuth.validBefore,
  nonce,
  sig.v,
  sig.r,
  sig.s
);
// Reverts with "FiatTokenV2: invalid signature"
```

### Questions for Circle

1. **What are the correct EIP-712 domain parameters for Arc USDC?**

   - Is there a different name/version/chainId being used internally?
   - Does the precompile modify domain calculation?

2. **Is EIP-3009 fully supported on Arc's native USDC precompile?**

   - Function exists, but does the precompile have quirks?
   - Is this a known limitation?

3. **How can we query the actual domain parameters?**

   - ERC-5267 `eip712Domain()` not implemented
   - Any other method to discover correct parameters?

4. **Is there Arc-specific documentation for EIP-3009?**
   - We've read: https://www.arc.network/blog/building-with-usdc-on-arc-one-token-two-interfaces
   - But no mention of EIP-3009 specifics

---

## Issue #2: Contract Deployment Timeouts

### Problem

Attempting to deploy smart contracts to Arc Testnet results in connection timeouts.

**Status:** Unable to deploy escrow vault contract needed for testing.

### RPC Endpoints Tried

**1. QuickNode (paid endpoint):**

```bash
export ARC_TESTNET_RPC="https://proud-xxx.arc-testnet.quiknode.pro/xxx/"
forge create --rpc-url $ARC_TESTNET_RPC ...
# Result: timeout after 30s
```

**2. Public Arc RPC:**

```bash
export ARC_TESTNET_RPC="https://rpc-testnet.arc.network"
forge create --rpc-url $ARC_TESTNET_RPC ...
# Result: timeout after 30s
```

### Deployed Contracts Status

| Chain            | Vault Contract                               | Status                 |
| ---------------- | -------------------------------------------- | ---------------------- |
| Base Sepolia     | `0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833` | ✅ Deployed & Verified |
| Polygon Amoy     | `0x75cfB44c60E54d3a79124F0B9a1aAa30780d5128` | ✅ Deployed & Verified |
| Arbitrum Sepolia | `0x73c997A291D0345f96e513d0Ce2ca34796fE426d` | ✅ Deployed & Verified |
| Optimism Sepolia | `0x73c997A291D0345f96e513d0Ce2ca34796fE426d` | ✅ Deployed & Verified |
| **Arc Testnet**  | -                                            | ❌ **Cannot Deploy**   |

### Questions for Circle

5. **Is Arc Testnet currently experiencing network issues?**

   - Both QuickNode and public RPCs timing out
   - Read operations work (balances, contract calls)
   - Write operations fail (deployment, transactions)

6. **Are there recommended RPC endpoints for Arc Testnet?**
   - Is QuickNode the recommended provider?
   - Any rate limiting or special requirements?

---

## ✅ What IS Working on Arc

To confirm we can work with Arc generally:

1. ✅ **Standard ERC-20 transfers work:**

```typescript
const tx = await usdc.transfer(recipient, amount);
await tx.wait(); // Success!
```

2. ✅ **Native token (USDC as gas) works:**

```typescript
const tx = await wallet.sendTransaction({ to: recipient, value: amount });
await tx.wait(); // Success!
```

3. ✅ **Read operations work:**

```typescript
await usdc.balanceOf(address); // Works
await usdc.name(); // "USDC"
await usdc.DOMAIN_SEPARATOR(); // 0x36119...
```

4. ✅ **We have sufficient test funds:**

```
Buyer:  10.02 USDC
Seller: 0.01 USDC
```

---

## Impact & Workaround

### Impact

Without EIP-3009 on Arc:

- ❌ No gasless transfers (must use approve + transferFrom)
- ❌ Requires 2 transactions instead of 1
- ❌ Breaks multi-chain feature parity
- ❌ Cannot showcase Arc in our demo

### Current Workaround

We can implement fallback to standard ERC-20 for Arc only:

```typescript
if (chainId === 1243) {
  // Arc: use standard ERC-20 (requires prior approval)
  await usdc.transferFrom(buyer, seller, amount);
} else {
  // Other chains: use EIP-3009 (gasless, single signature)
  await usdc.transferWithAuthorization(...);
}
```

**Trade-offs:**

- ✅ Works, production-ready
- ❌ Arc loses gasless benefit
- ❌ Extra approval step for Arc users

---

## Environment Details

**Tooling:**

- Foundry (Forge 0.8.20)
- ethers.js v6
- Node.js v20

**Test wallets:**

- Buyer: `0x7c43...3eB9`
- Seller: `0x21cD...3A6A`
- Facilitator: `0xB6A9...F064`

**USDC contract:**

- Proxy: `0x3600000000000000000000000000000000000000`
- Implementation: `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8`

**Block explorer:**

- https://explorer.arc-testnet.circlechain.xyz

---

## Reproducible Test Case

### Minimal EIP-3009 Test

```typescript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://rpc-testnet.arc.network");
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const usdcAddress = "0x3600000000000000000000000000000000000000";
const usdc = new ethers.Contract(usdcAddress, USDC_ABI, signer);

// Query domain from contract
const name = await usdc.name(); // "USDC"
const version = await usdc.version(); // "2"
const onChainDomain = await usdc.DOMAIN_SEPARATOR();

// Build EIP-712 domain
const domain = {
  name,
  version,
  chainId: 1243,
  verifyingContract: usdcAddress,
};

// Transfer authorization
const transferAuth = {
  from: signer.address,
  to: recipientAddress,
  value: ethers.parseUnits("1", 6),
  validAfter: 0,
  validBefore: Math.floor(Date.now() / 1000) + 3600,
  nonce: ethers.hexlify(ethers.randomBytes(32)),
};

// Sign with EIP-712
const signature = await signer.signTypedData(domain, TYPES, transferAuth);
const { v, r, s } = ethers.Signature.from(signature);

// Execute
const tx = await usdc.transferWithAuthorization(
  transferAuth.from,
  transferAuth.to,
  transferAuth.value,
  transferAuth.validAfter,
  transferAuth.validBefore,
  transferAuth.nonce,
  v,
  r,
  s
);

// ❌ Reverts: "FiatTokenV2: invalid signature"
```

### Expected vs Actual Domain

```javascript
// Calculated locally
console.log(ethers.TypedDataEncoder.hashDomain(domain));
// 0x94e71d8b08285b2ec4c4f03b6112a4f27c3298282ff3528528bfa907be5c4b37

// Queried from contract
console.log(await usdc.DOMAIN_SEPARATOR());
// 0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0

// ❌ MISMATCH - causes signature validation to fail
```

---

## Files Available

If helpful, I can provide:

- ✅ Full source code (GitHub: x402-escrow)
- ✅ Detailed analysis documents (`ARC_EIP3009_ISSUE.md`, `ARC_USDC_ANALYSIS.md`)
- ✅ Demo scripts with logging
- ✅ Test transactions on Arc explorer
- ✅ Comparison with working chains (Base, Polygon, etc.)

---

## What We Need

**Priority 1: EIP-3009 Fix**

1. Correct EIP-712 domain parameters for Arc USDC
2. Confirmation if EIP-3009 is supported on precompile
3. Documentation or guidance for Arc-specific quirks

**Priority 2: Deployment Help** 4. Confirmation if Arc Testnet RPC is operational 5. Recommended RPC endpoints and any special configuration

---

## Contact

- **Discord**: @hamiha70
- **Project**: ETHGlobal Bangkok 2024 Submission
- **Repo**: Available on request
- **Timeline**: Need resolution before submission deadline (Nov 24)

---

## Appendix: Successful EIP-3009 on Other Chains

For comparison, here's proof our implementation works elsewhere:

**Base Sepolia (working):**

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Domain Separator: `0x324eea0d38bb34f7b0b4ddae217cc90e4ea4847061cfc8c8fd5dd1ca3f1a3a2a`
- Explorer: https://sepolia.basescan.org/address/0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833

**Polygon Amoy (working):**

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Domain Separator: `0x39845c15dc8300785a648be59459ff45cbb345b86ed769a3847ac3c9a0799784`
- Explorer: https://amoy.polygonscan.com/address/0x75cfB44c60E54d3a79124F0B9a1aAa30780d5128

Both use identical signing code, only Arc fails.

---

**Thank you for your help! 🙏**
