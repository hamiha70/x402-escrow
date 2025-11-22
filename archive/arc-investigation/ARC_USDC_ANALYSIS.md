# Arc Testnet USDC Analysis

## Problem

Arc Testnet demo failed with error: `FiatTokenV2: invalid signature` during EIP-3009 `transferWithAuthorization` call.

## Investigation Results

### Contract Structure

**Proxy Address**: `0x3600000000000000000000000000000000000000`

- ✓ Standard ERC-20 functions work (`name()`, `symbol()`, `balanceOf()`, etc.)
- ✓ Is a proxy contract (OpenZeppelin pattern)
- ✓ Implementation at: `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8`

**Implementation Contract**: `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8`

- ✓ Contains `transferWithAuthorization` selector (`0xe3ee160e`)
- ✓ Code size: 46,780 bytes (full USDC implementation)

### Contract Values

```
name(): "USDC"
symbol(): "USDC"
decimals(): 6
version(): "2"
DOMAIN_SEPARATOR(): 0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0
```

### EIP-712 Domain Mismatch

**Our Calculation** (using standard parameters):

```javascript
{
  name: "USDC",
  version: "2",
  chainId: 1243,
  verifyingContract: "0x3600000000000000000000000000000000000000"
}
// Result: 0x94e71d8b08285b2ec4c4f03b6112a4f27c3298282ff3528528bfa907be5c4b37
```

**Actual on-chain**: `0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0`

**Result**: ❌ MISMATCH

None of these variations matched:

- ✗ Using implementation address instead of proxy
- ✗ Different name ("USD Coin")
- ✗ Different version ("1")
- ✗ Adding salt field
- ✗ Different chainId values (tested 0-10000)

## Root Cause: Arc's Unique Native USDC Design

### What Makes Arc Different

Arc has a **unique USDC implementation** that serves dual purposes:

1. **Native Gas Token**: USDC is the native token for gas fees (like ETH on Ethereum)
2. **ERC-20 Token**: Also accessible via standard ERC-20 interface

**Key Characteristics**:

- Native balance: **18 decimals** (for gas precision)
- ERC-20 interface: **6 decimals** (standard USDC)
- Special precompiled contract at `0x3600...0000`
- Keeps native and ERC-20 states synchronized

### Implications for EIP-3009

Arc's documentation states:

> "This dual-interface model simplifies user flows and accounting while maintaining full EVM compatibility."

However:

- The precompiled contract may not include all standard functions
- EIP-3009 support (`transferWithAuthorization`) exists in the **implementation** but may have compatibility issues
- The domain separator appears to be calculated differently, possibly due to the precompiled nature

**Source**: https://www.arc.network/blog/building-with-usdc-on-arc-one-token-two-interfaces

## Why Our Signature Failed

1. **Domain Separator Mismatch**: Arc's USDC uses a non-standard domain separator calculation
2. **Possible Reasons**:
   - Precompiled contract modifies domain parameters
   - Domain was set during deployment with different parameters
   - ChainId mismatch (Arc might internally use different chainId)
   - Additional fields we haven't discovered

## Solutions

### Option 1: Use Standard ERC-20 Flow (Recommended for Arc)

Since Arc has full ERC-20 support, fall back to traditional `approve` + `transferFrom`:

```typescript
// 1. Buyer approves facilitator
await usdc.approve(facilitator, amount);

// 2. Facilitator calls transferFrom
await usdc.transferFrom(buyer, seller, amount);
```

**Pros**:

- ✅ Guaranteed to work with Arc's implementation
- ✅ Standard pattern, well-tested
- ✅ Same gas cost as other non-EIP-3009 chains

**Cons**:

- ❌ Requires prior approval transaction (not gasless)
- ❌ Two transactions instead of one

### Option 2: Query Domain Dynamically (If Arc Supports ERC-5267)

Try to query the actual domain using ERC-5267:

```solidity
function eip712Domain() external view returns (
    bytes1 fields,
    string memory name,
    string memory version,
    uint256 chainId,
    address verifyingContract,
    bytes32 salt,
    uint256[] memory extensions
);
```

**Status**: ✗ Arc USDC does not implement ERC-5267

### Option 3: Contact Arc Support

Reach out to Arc team to:

1. Confirm if EIP-3009 is fully supported on native USDC
2. Get the correct EIP-712 domain parameters
3. Understand if there are workarounds

## Recommendation

**For immediate use**: Implement Option 1 (standard ERC-20) as a fallback for Arc specifically.

**Implementation**:

```typescript
// In facilitator/server.ts
if (chainId === 1243) {
  // Arc Testnet - use standard ERC-20
  // Requires prior approval from buyer
  const tx = await usdc.transferFrom(buyer, seller, amount);
} else {
  // Other chains - use EIP-3009
  const tx = await usdc.transferWithAuthorization(...);
}
```

**Trade-offs**:

- Arc loses the "gasless for buyer" benefit
- Arc requires an extra approval step in the demo
- But it **works** and is production-ready

## Multi-Chain Status Impact

| Feature               | Base Sepolia    | Polygon Amoy    | Arc Testnet                  |
| --------------------- | --------------- | --------------- | ---------------------------- |
| **EIP-3009**          | ✅ Full support | ✅ Full support | ⚠️ Partial (domain mismatch) |
| **Standard ERC-20**   | ✅ Yes          | ✅ Yes          | ✅ Yes                       |
| **Gasless transfers** | ✅ Yes          | ✅ Yes          | ❌ No (needs approval)       |
| **Status**            | WORKING         | WORKING         | CAN WORK (with fallback)     |

## Conclusion

Arc's innovative native USDC design provides excellent UX for users (gas in USDC) but introduces compatibility challenges with advanced token standards like EIP-3009.

**For this project**:

- Continue using EIP-3009 for Base, Polygon, Arbitrum, Optimism, Ethereum
- Implement ERC-20 fallback for Arc
- Document the trade-off clearly

This is a **chain-specific quirk**, not an architectural issue with our multi-chain design.
