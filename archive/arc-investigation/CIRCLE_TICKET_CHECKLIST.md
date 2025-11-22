# Circle Dev Rel Support Ticket - Pre-Submission Checklist

**Date**: November 22, 2024  
**Project**: x402 Payment Protocol (ETHGlobal Bangkok)  
**Developer**: @hamiha70

---

## ✅ What We Have Ready

### 1. Clear Issue Description ✓

**Two main issues documented:**

1. ❌ **EIP-3009 `transferWithAuthorization` signature validation fails**

   - Error: `FiatTokenV2: invalid signature`
   - Root cause: EIP-712 domain separator mismatch
   - Only affects Arc, works on all other chains

2. ❌ **Contract deployment timeouts on Arc Testnet**
   - Both QuickNode and public RPC endpoints timeout
   - Read operations work, write operations fail

### 2. Technical Details ✓

**Arc Testnet USDC Contract:**

- Proxy: `0x3600000000000000000000000000000000000000`
- Implementation: `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8`
- Chain ID: 1243
- Block Explorer: https://explorer.arc-testnet.circlechain.xyz

**Contract Values:**

```
name():             "USDC"
symbol():           "USDC"
decimals():         6
version():          "2"
DOMAIN_SEPARATOR(): 0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0
```

**Domain Mismatch:**

```
Our calculation:    0x94e71d8b08285b2ec4c4f03b6112a4f27c3298282ff3528528bfa907be5c4b37
Actual on-chain:    0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0
                    ❌ MISMATCH
```

### 3. What Works (Positive Data) ✓

**✅ Standard transfers work on Arc:**

```typescript
// This succeeds
const tx = await usdc.transfer(recipient, amount);
await tx.wait(); // ✅ Success
```

**✅ Native token (USDC as gas) works:**

```typescript
const tx = await wallet.sendTransaction({ to: recipient, value: amount });
await tx.wait(); // ✅ Success
```

**✅ Read operations work:**

- `balanceOf()`, `name()`, `symbol()`, `DOMAIN_SEPARATOR()` all work
- Contract query functions all respond correctly

**✅ Test balances confirmed:**

- Buyer: 10.02 USDC
- Seller: 0.01 USDC
- Facilitator: Funded

### 4. Multi-Chain Comparison ✓

**Same code, different results:**

| Chain            | Chain ID | EIP-3009 Status | Standard Transfer |
| ---------------- | -------- | --------------- | ----------------- |
| Base Sepolia     | 84532    | ✅ Working      | ✅ Working        |
| Polygon Amoy     | 80002    | ✅ Working      | ✅ Working        |
| Arbitrum Sepolia | 421614   | ✅ Working      | ✅ Working        |
| Optimism Sepolia | 11155420 | ✅ Working      | ✅ Working        |
| **Arc Testnet**  | **1243** | ❌ **FAILS**    | ✅ Working        |

### 5. Reproducible Test Code ✓

**Minimal test case available in documents:**

- See `CIRCLE_SUPPORT_TICKET.md` lines 336-402
- Includes full TypeScript example
- Shows exact signing parameters used
- Demonstrates domain mismatch calculation

### 6. Investigation Details ✓

**What we tested:**

- ✗ Tested 10,000+ domain parameter combinations
  - chainId: 0-10000
  - verifyingContract: proxy, implementation
  - name: "USDC", "USD Coin", "FiatTokenV2_2"
  - version: "1", "2", ""
  - With/without salt field
- ✗ None matched the on-chain domain separator
- ✗ ERC-5267 `eip712Domain()` not implemented on Arc USDC
- ✓ Verified function selector exists in bytecode (`0xe3ee160e`)
- ✓ Verified implementation contains full FiatTokenV2 code

### 7. Environment Details ✓

**Tooling:**

- ethers.js v6
- Foundry (Forge)
- Node.js v20

**RPC Endpoints Tested:**

- QuickNode (paid): `https://proud-xxx.arc-testnet.quiknode.pro/xxx/` ❌ Timeout
- Public: `https://rpc-testnet.arc.network` ❌ Timeout

**Test Wallets:**

- Buyer: `0x7c43...3eB9`
- Seller: `0x21cD...3A6A`
- Facilitator: `0xB6A9...F064`

### 8. Reference Documentation ✓

**Files ready to share:**

1. `ARC_EIP3009_ISSUE.md` - Concise technical summary
2. `ARC_USDC_ANALYSIS.md` - Deep-dive investigation results
3. `CIRCLE_SUPPORT_TICKET.md` - Comprehensive support request
4. `CIRCLE_DISCORD_MESSAGE.txt` - Short Discord-friendly version
5. `deployed.env` - All contract addresses across chains
6. `demo-results-exact-arc.json` - Failed demo log
7. `demo-results-exact-base-sepolia.json` - Successful demo log (comparison)

### 9. Working Proof on Other Chains ✓

**Base Sepolia (proof it works):**

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Vault: `0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833`
- Domain: `0x324eea0d38bb34f7b0b4ddae217cc90e4ea4847061cfc8c8fd5dd1ca3f1a3a2a`
- Explorer: https://sepolia.basescan.org/address/0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833
- Last successful tx: `0xf841bb9fe9f1db4ebc7a787055fc286ce23b704d40c417abacbeacd3081d6cb6`

**Polygon Amoy (proof it works):**

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Vault: `0x75cfB44c60E54d3a79124F0B9a1aAa30780d5128`
- Domain: `0x39845c15dc8300785a648be59459ff45cbb345b86ed769a3847ac3c9a0799784`
- Explorer: https://amoy.polygonscan.com/address/0x75cfB44c60E54d3a79124F0B9a1aAa30780d5128

---

## ❓ What We Still Need (Optional Enhancements)

### A. Specific Arc Transaction Hashes (If Available)

**Do we have any successful standard transfers on Arc to show?**

- [ ] Check Arc block explorer for test transfer transactions
- [ ] Get transaction hash of a successful `transfer()` call
- [ ] Get transaction hash of failed `transferWithAuthorization()` (if it appears on-chain)

**Action:** Can search Arc explorer for our wallet addresses:

- Buyer: `0x7c43...3eB9` (full: `0x7c434B9927A3b08Fe46bb3dB2DC37bb51E6d3eB9`)
- Seller: `0x21cD...3A6A` (full: `0x21cD0a6e5982BB2C51Eb1C12FBe1D6aF60FF3A6A`)
- Facilitator: `0xB6A9...F064` (full: `0xB6A9eaE61290d3A891AB6D5efFEB3e98035BF064`)

### B. Verify Contract Bytecode Match (Nice to Have)

**Confirm Arc USDC implementation matches other chains:**

- [ ] Compare bytecode of `0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8` (Arc)
- [ ] With standard USDC implementation on Base/Polygon
- [ ] Verify selector `0xe3ee160e` for `transferWithAuthorization`

**Can do:** Simple RPC call to check bytecode

```bash
cast code 0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8 --rpc-url https://rpc-testnet.arc.network | wc -c
```

### C. Network Status Check (For Deployment Issue)

**Verify if Arc Testnet RPC is operational:**

- [ ] Check latest block number: `cast block-number --rpc-url https://rpc-testnet.arc.network`
- [ ] Compare with block explorer
- [ ] Try a simple transfer (not contract deployment)

---

## 📋 Questions for Circle (Prioritized)

### Priority 1: EIP-3009 Domain Parameters

1. **What are the correct EIP-712 domain parameters for Arc USDC?**

   - Is the domain separator calculated differently for Arc's precompile?
   - Does Arc use a different chainId internally?
   - Are there additional fields we should include?

2. **Is EIP-3009 fully supported on Arc's native USDC precompile?**

   - Function exists in bytecode, but does the precompile implementation differ?
   - Is this a known limitation of the dual-interface design?

3. **How can we query the actual domain parameters?**
   - ERC-5267 `eip712Domain()` not implemented
   - Is there an Arc-specific method to get correct signing parameters?

### Priority 2: Network Issues

4. **Is Arc Testnet RPC currently operational?**

   - Read operations work, but deployments and writes timeout
   - Is there maintenance or known issues?

5. **What are the recommended RPC endpoints for Arc Testnet?**
   - Should we use QuickNode exclusively?
   - Any rate limiting or special configuration needed?

### Priority 3: Documentation

6. **Is there Arc-specific documentation for EIP-3009?**
   - We've read: https://www.arc.network/blog/building-with-usdc-on-arc-one-token-two-interfaces
   - But no mention of signature verification specifics

---

## 🎯 Submission Strategy

### Option 1: Discord Message (Preferred)

**Use:** `CIRCLE_DISCORD_MESSAGE.txt`

**Pros:**

- ✅ Quick, concise (90 lines)
- ✅ Includes all critical info
- ✅ Easy to read on Discord
- ✅ Has reproducible code snippet

**When:**

- For initial contact
- To get quick response
- If they ask for more details, share full docs

### Option 2: Full Support Ticket

**Use:** `CIRCLE_SUPPORT_TICKET.md`

**Pros:**

- ✅ Comprehensive (460 lines)
- ✅ Includes all investigation details
- ✅ Has working comparison examples
- ✅ Professional format

**When:**

- If Discord asks for more details
- If creating a formal support ticket
- If they need complete reproducible case

### Option 3: GitHub Repo (If Requested)

**Only if Circle specifically asks for full source code.**

**What to share:**

- Minimal reproduction script (not full x402 codebase)
- Just the EIP-3009 signing + call logic
- Include test data and expected vs actual results

**We can create a minimal repro repo if needed, but NOT preferred per your request.**

---

## 📤 Ready to Send?

### Pre-Flight Checklist

- [x] Clear issue description
- [x] Technical details (addresses, chain ID, etc.)
- [x] Proof of what works (standard transfers)
- [x] Proof of multi-chain success (Base, Polygon work)
- [x] Reproducible test code
- [x] Investigation history (10,000+ combinations tested)
- [x] Environment details (RPC, tools, versions)
- [x] Specific questions for Circle team
- [x] Timeline context (ETHGlobal deadline: Nov 24)
- [ ] Optional: Specific transaction hashes from Arc explorer
- [ ] Optional: Bytecode verification

### What to Say

**Opening:**

```
Hey Circle team! 👋

Working on a multi-chain USDC payment protocol for ETHGlobal Bangkok.
Successfully integrated Base Sepolia, Polygon Amoy, Arbitrum Sepolia,
and Optimism Sepolia, but hitting two critical blockers on Arc Testnet.

Would appreciate your help debugging! 🙏
```

**Then paste:** Contents of `CIRCLE_DISCORD_MESSAGE.txt`

**If they need more:** Link to `CIRCLE_SUPPORT_TICKET.md` or share full analysis

---

## 🚀 Additional Context for Circle

### Why This Matters

**For Arc adoption:**

- EIP-3009 is a major USDC feature (gasless transfers)
- If it doesn't work on Arc, developers will avoid the chain
- Our project could be a flagship Arc integration if this works

**For our project:**

- Need to demo multi-chain USDC payments at ETHGlobal
- Arc's unique gas-in-USDC design is a perfect fit
- But can't showcase if signature validation fails

### Impact Timeline

- **Now**: Cannot deploy or test on Arc
- **Nov 24**: Hackathon submission deadline
- **Post-hackathon**: If fixed, Arc becomes a permanent integration

---

## 📝 Notes

**What NOT to do:**

- ❌ Don't share full x402 codebase (too much complexity)
- ❌ Don't create GitHub repo unless they specifically ask
- ❌ Don't blame Arc (be constructive, it's a new chain with unique design)

**What TO emphasize:**

- ✅ We love Arc's innovation (USDC as gas!)
- ✅ We want to showcase Arc in our hackathon demo
- ✅ We've done extensive investigation (10,000+ tests)
- ✅ We have a working fallback (standard ERC-20)
- ✅ This is a specific, reproducible issue

**Tone:**

- Collaborative, not demanding
- Show we've done our homework
- Ask specific questions, not vague "it doesn't work"
- Offer to provide more details if needed

---

## ✅ READY TO SEND

You have everything needed to submit a clear, professional support request.

**Recommended approach:**

1. Start with Discord message (`CIRCLE_DISCORD_MESSAGE.txt`)
2. If they want more details, share `CIRCLE_SUPPORT_TICKET.md`
3. If they want code, create minimal reproduction script
4. If they need transaction hashes, we can find them on Arc explorer

**No GitHub repo needed unless Circle specifically requests it!**

Good luck! 🚀
