# Circle Support Submission - Final Summary

**Date**: November 22, 2024  
**Developer**: @hamiha70  
**Project**: x402 Payment Protocol (ETHGlobal Bangkok)

---

## ✅ You're Ready to Submit!

You have **everything needed** to submit a clear, professional support request to Circle. Here's what we've prepared:

---

## 📄 Documents Ready

### 1. **CIRCLE_DISCORD_MESSAGE.txt** ⭐ START HERE

- **Length**: ~90 lines
- **Use for**: Initial Discord message
- **Why**: Concise, all critical info, easy to read
- **Content**:
  - Clear problem statement
  - Technical details (addresses, domain values)
  - What works vs what doesn't
  - Reproducible code snippet
  - Specific questions

### 2. **CIRCLE_SUPPORT_TICKET.md** 📋 IF THEY NEED MORE

- **Length**: ~460 lines
- **Use for**: Full detailed support ticket
- **Why**: Comprehensive, professional, all investigation details
- **Content**:
  - Executive summary
  - Issue #1: EIP-3009 signature validation (detailed)
  - Issue #2: Deployment timeouts
  - What works (positive confirmation)
  - Multi-chain comparison
  - Complete reproducible test case
  - Investigation history (10,000+ tests)
  - Environment details
  - Working proof from other chains

### 3. **CIRCLE_TICKET_CHECKLIST.md** ✅ YOUR ROADMAP

- **Length**: ~400 lines
- **Use for**: Review before submitting
- **Content**:
  - What we have ready (checklist)
  - What we still need (optional enhancements)
  - Questions for Circle (prioritized)
  - Submission strategy
  - Pre-flight checklist
  - What to say, tone guidance

### 4. **CIRCLE_QUICK_REFERENCE.txt** 🎯 CHEAT SHEET

- **Length**: ~200 lines
- **Use for**: Quick lookup during discussion
- **Content**:
  - Contract addresses
  - Domain values
  - Test wallets
  - Error messages
  - What works/doesn't work
  - All key facts at a glance

### 5. **Supporting Technical Docs**

- `ARC_EIP3009_ISSUE.md` - Technical deep-dive
- `ARC_USDC_ANALYSIS.md` - Investigation results
- `demo-results-exact-arc.json` - Failed demo log
- `demo-results-exact-base-sepolia.json` - Working demo log (proof)
- `deployed.env` - All contract addresses

---

## 🎯 Recommended Submission Flow

### Step 1: Initial Discord Message

**Copy and paste from**: `CIRCLE_DISCORD_MESSAGE.txt`

**Opening line**:

```
Hey Circle team! 👋

Working on a multi-chain USDC payment protocol for ETHGlobal Bangkok.
Successfully integrated Base Sepolia, Polygon Amoy, Arbitrum Sepolia,
and Optimism Sepolia, but hitting two critical blockers on Arc Testnet.

Would appreciate your help debugging! 🙏
```

**Then**: Paste the rest of the message from the file

**Why this works**:

- Gets attention immediately
- Shows we've done homework (works on 4 chains)
- Specific, reproducible issue
- Timeline context (hackathon)

### Step 2: If They Ask for More Details

**Share**: `CIRCLE_SUPPORT_TICKET.md`

**How to share**:

- Upload as file, or
- Post in a thread, or
- Link to a GitHub Gist

**Say**:

```
Here's the complete analysis with all investigation details and
reproducible test cases: [link to CIRCLE_SUPPORT_TICKET.md]
```

### Step 3: If They Want Source Code

**Create**: Minimal reproduction script (NOT full repo)

**What to include**:

- Just the EIP-3009 signing code
- Just the transferWithAuthorization call
- Sample domain calculation
- Expected vs actual domain separator

**Keep it simple**: ~50 lines max

---

## 📝 Key Messages to Emphasize

### 1. We've Done Our Homework ✓

- Tested on 4+ chains successfully
- Same code, same logic → only Arc fails
- Tested 10,000+ domain parameter combinations
- Verified function exists in bytecode
- Read full Arc documentation

### 2. Specific, Reproducible Issue ✓

- Exact error message: "FiatTokenV2: invalid signature"
- Exact domain mismatch values (with hex)
- Exact contract addresses
- Exact test code provided

### 3. We Have Working Examples ✓

- Base Sepolia: Working ✅ (with tx hash)
- Polygon Amoy: Working ✅ (with tx hash)
- Arc standard transfers: Working ✅
- Only Arc EIP-3009 fails

### 4. We're Not Demanding, Just Asking ✓

- "Would appreciate your help"
- "What are the correct parameters?"
- "Is this supported?"
- Collaborative, not blaming

### 5. Timeline Context ✓

- ETHGlobal Bangkok hackathon
- Deadline: November 24
- Want to showcase Arc in demo
- Have fallback if needed

---

## ❓ The 5 Questions to Ask

These are **prioritized and specific**:

### Priority 1: EIP-3009 Domain

**Q1**: What are the correct EIP-712 domain parameters for Arc USDC?

- Is the domain calculated differently for the precompile?
- Does Arc use a different chainId internally?

**Q2**: Is EIP-3009 fully supported on Arc's native USDC precompile?

- Function exists but signature verification fails
- Is this a known limitation?

**Q3**: How can we query the actual domain parameters?

- ERC-5267 `eip712Domain()` not implemented
- Any Arc-specific method?

### Priority 2: Network Issues

**Q4**: Is Arc Testnet RPC currently operational?

- Deployments timeout, read ops work
- Any known maintenance?

**Q5**: What are recommended RPC endpoints?

- QuickNode vs public
- Any special configuration?

---

## 🚫 What NOT to Do

### ❌ Don't Share Full Codebase

- Too much complexity
- Not relevant to the specific issue
- Circle doesn't need our entire x402 implementation

### ❌ Don't Create GitHub Repo (Unless Asked)

- You mentioned "not preferred" ✓
- Discord message + docs should be enough
- Only if Circle specifically requests it

### ❌ Don't Sound Demanding

- Not "fix this now"
- Instead "can you help us understand"
- Collaborative tone

### ❌ Don't Blame Arc

- It's a new chain with innovative design
- We want to showcase Arc
- Just need guidance on correct parameters

---

## ✅ What TO Do

### ✅ Be Specific

- Exact error messages
- Exact contract addresses
- Exact domain values (with hex)
- Exact test code

### ✅ Show You've Investigated

- 10,000+ combinations tested
- Verified bytecode
- Read documentation
- Tested on multiple chains

### ✅ Provide Working Examples

- Base Sepolia tx hash
- Polygon Amoy tx hash
- Show the comparison

### ✅ Mention What Works

- Standard transfers ✓
- Native token transfers ✓
- Read operations ✓
- This isolates the issue to EIP-3009 specifically

### ✅ Offer to Help

- "Can provide more details if needed"
- "Happy to test any suggestions"
- "Have test wallets ready"

---

## 🎤 Example Opening (Use This!)

```
Hey Circle team! 👋

Working on a multi-chain USDC payment protocol for ETHGlobal Bangkok.
Successfully integrated Base Sepolia, Polygon Amoy, Arbitrum Sepolia,
and Optimism Sepolia, but hitting two critical blockers on Arc Testnet:

1. ❌ EIP-3009 `transferWithAuthorization` fails with "FiatTokenV2: invalid signature"
2. ❌ Contract deployments timeout on both QuickNode and public RPCs

The signature validation issue seems to be an EIP-712 domain separator mismatch.
I've tested 10,000+ parameter combinations but can't match the on-chain value:

  Calculated: 0x94e71d8b08285b2ec4c4f03b6112a4f27c3298282ff3528528bfa907be5c4b37
  On-chain:   0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0

Same code works perfectly on Base, Polygon, Arbitrum, and Optimism using standard
EIP-712 domain calculation. Only Arc fails.

Standard USDC transfers work fine on Arc, so I know the basic connectivity is good.
Just can't get EIP-3009 signatures to validate.

Would really appreciate help debugging this! I'd love to showcase Arc in our demo
(the USDC-as-gas feature is perfect for our use case), but need this working by Nov 24.

Questions:
1. What are the correct EIP-712 domain parameters for Arc USDC?
2. Is EIP-3009 fully supported on Arc's native USDC precompile?
3. How can I query the actual domain (eip712Domain() not implemented)?
4. Any known issues with Arc Testnet RPC for deployments?

Full reproducible test case below 👇

[Paste rest of CIRCLE_DISCORD_MESSAGE.txt]
```

---

## 📊 What You Have (Checklist)

- [x] **Issue #1**: EIP-3009 signature validation fails

  - [x] Error message: "FiatTokenV2: invalid signature"
  - [x] Root cause: Domain separator mismatch
  - [x] Contract addresses (proxy + implementation)
  - [x] On-chain domain value
  - [x] Calculated domain value
  - [x] Reproducible test code

- [x] **Issue #2**: Contract deployment timeouts

  - [x] Tested QuickNode
  - [x] Tested public RPC
  - [x] Both timeout on writes

- [x] **What works** (positive confirmation)

  - [x] Standard transfers ✓
  - [x] Native USDC transfers ✓
  - [x] Read operations ✓
  - [x] Test balances confirmed

- [x] **Multi-chain proof**

  - [x] Base Sepolia working (with tx)
  - [x] Polygon Amoy working (with tx)
  - [x] Arbitrum Sepolia working
  - [x] Optimism Sepolia working
  - [x] Same code, only Arc fails

- [x] **Investigation history**

  - [x] 10,000+ combinations tested
  - [x] Bytecode verification
  - [x] ERC-5267 check
  - [x] Documentation review

- [x] **Environment details**

  - [x] Chain ID: 1243
  - [x] RPC endpoints
  - [x] Test wallet addresses
  - [x] Tools: ethers.js v6, Foundry
  - [x] Explorer link

- [x] **Timeline context**

  - [x] ETHGlobal Bangkok
  - [x] Deadline: November 24
  - [x] Want to showcase Arc

- [x] **Fallback plan**
  - [x] Can use standard ERC-20 flow
  - [x] Loses gasless benefit
  - [x] But works

---

## 🎉 You're All Set!

You have:

- ✅ Clear, concise Discord message ready
- ✅ Comprehensive support ticket if needed
- ✅ Checklist and strategy guide
- ✅ Quick reference card
- ✅ All technical details documented
- ✅ Reproducible test cases
- ✅ Working proof from other chains
- ✅ Specific questions prioritized
- ✅ Professional, collaborative tone

**Next step**: Post `CIRCLE_DISCORD_MESSAGE.txt` to Circle Discord!

---

## 🔍 Optional Enhancements (Before Submitting)

These are **nice-to-haves**, not required:

### 1. Check Arc Explorer for Transaction Hashes

**Wallets to search**:

- Buyer: `0x7c434B9927A3b08Fe46bb3dB2DC37bb51E6d3eB9`
- Seller: `0x21cD0a6e5982BB2C51Eb1C12FBe1D6aF60FF3A6A`
- Facilitator: `0xB6A9eaE61290d3A891AB6D5efFEB3e98035BF064`

**Where**: https://explorer.arc-testnet.circlechain.xyz

**Look for**:

- Any successful standard `transfer()` calls
- Any failed `transferWithAuthorization()` attempts
- Would add concrete tx hashes to the report

**If found**: Add to Discord message like:

```
Example successful standard transfer: 0xabc...123
Example failed transferWithAuthorization: 0xdef...456
```

### 2. Verify USDC Implementation Bytecode

**Check if Arc USDC matches standard implementation**:

```bash
# Get Arc implementation bytecode
cast code 0x3910B7cbb3341f1F4bF4cEB66e4A2C8f204FE2b8 \
  --rpc-url https://rpc-testnet.arc.network

# Compare size with Base Sepolia USDC
cast code <base_usdc_implementation> \
  --rpc-url https://sepolia.base.org
```

**If they match**: Confirms function exists
**If they differ**: Might explain domain issue

### 3. Test Latest Block Number

**Verify RPC is responding**:

```bash
cast block-number --rpc-url https://rpc-testnet.arc.network
```

**If responds**: RPC is online, deployment issue is something else
**If times out**: Confirms RPC issue

---

## 🚀 Ready When You Are!

**Recommended**: Just submit with what you have now. The optional enhancements are nice but not necessary. Your documentation is already excellent.

**To submit**:

1. Open Circle Discord
2. Find appropriate channel (likely #dev-support or #arc-testnet)
3. Copy contents of `CIRCLE_DISCORD_MESSAGE.txt`
4. Paste and send
5. Wait for response
6. If asked for more, share `CIRCLE_SUPPORT_TICKET.md`

**Good luck!** 🎉

Your submission is professional, thorough, and clearly demonstrates you've done extensive investigation. Circle should be impressed and helpful.

---

## 📞 If You Need Help During Discussion

Use `CIRCLE_QUICK_REFERENCE.txt` for quick lookups:

- Contract addresses
- Domain values
- Error messages
- What works/doesn't work
- Test wallet addresses

Everything you need is there in an easy-to-scan format.

---

**You've got this!** 💪
