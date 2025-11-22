# Arc Testnet USDC: EIP-3009 Fails - Need Help

**Contract**: `0x3600000000000000000000000000000000000000` (Arc Testnet)  
**Issue**: `transferWithAuthorization` reverts with "FiatTokenV2: invalid signature"  
**Status**: Works on Base & Polygon, fails only on Arc

---

## Facts

✅ **Contract has the function**

- Implementation `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8` contains `transferWithAuthorization`
- Selector `0xe3ee160e` found in bytecode

✅ **Domain values from contract**

```
name():              "USDC"
version():           "2"
DOMAIN_SEPARATOR():  0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0
```

❌ **Calculated domain doesn't match**

```javascript
// Standard calculation with name="USDC", version="2", chainId=1243
Expected: 0x94e71d8b08285b2ec4c4f03b6112a4f27c3298282ff3528528bfa907be5c4b37;
Actual: 0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0;
```

❌ **Tested 10,000+ combinations - none matched**

- chainId: 0-10000
- verifyingContract: proxy, implementation
- name: "USDC", "USD Coin", "FiatTokenV2_2"
- version: "1", "2", ""
- With/without salt

---

## Questions for Circle

**1. What are the correct EIP-712 domain parameters for Arc USDC?**

- Current `DOMAIN_SEPARATOR()` returns: `0x36119...c6b0`
- Can't derive this from standard parameters

**2. Does Arc's native USDC precompile affect EIP-3009?**

- Arc uses USDC as gas token (18 decimals native, 6 decimals ERC-20)
- Does this change domain calculation?

**3. Does Arc support ERC-5267 `eip712Domain()`?**

- Would allow dynamic domain discovery
- Currently returns error when called

**4. Is EIP-3009 officially supported on Arc Testnet?**

- Function exists but signature verification fails
- Bug or intentional?

---

## Impact

**Works on other chains**:

```
Base Sepolia   ✅ (chainId 84532)
Polygon Amoy   ✅ (chainId 80002)
Arc Testnet    ❌ (chainId 1243) ← ONLY THIS FAILS
```

**Without fix**:

- No gasless transfers on Arc
- Must use `approve` + `transferFrom` (2 transactions)
- Breaks multi-chain parity

---

## Need

📋 Correct domain parameters for Arc USDC  
OR  
🔧 How to properly sign EIP-3009 for Arc

**Contact**: [Your details]  
**Test code**: Available if needed
