# Oasis ROFL: Addresses and Tokens Explained

**Date**: November 22, 2025  
**Context**: Understanding wallet funding and token requirements for ROFL TEE deployment

---

## The Right Mental Model

Think of Oasis ROFL deployment in **three distinct layers**, each with different address and token requirements:

```
Layer 1: ROFL Infrastructure (Oasis Network)
  ↓ Requires: Oasis TEST tokens for deployment
  ↓ Address: Your Oasis account address
  
Layer 2: TEE Application Runtime (Inside TEE)
  ↓ Has: TEE-specific wallet addresses (for signing txs)
  ↓ Requires: No tokens inside TEE itself
  
Layer 3: Target Blockchains (Base, Polygon, etc.)
  ↓ Requires: Native tokens (ETH) for gas fees
  ↓ Address: TEE facilitator addresses (one per chain)
```

---

## Layer 1: ROFL Infrastructure (Oasis Network)

### What You Need TEST Tokens For

**YES, you need tokens from faucet.testnet.oasis.io for:**

1. **App Registration** (Staking requirement)
   - **Cost**: 100 TEST tokens (reduced from 10,000 in March 2025)
   - **Purpose**: Register your ROFL app on Oasis Sapphire blockchain
   - **One-time**: Yes, this is a stake that you can recover later
   - **Command**: `oasis rofl create`

2. **Machine Rental** (Ongoing cost)
   - **Cost**: 10 TEST tokens per hour
   - **Purpose**: Rent TEE-capable machine from ROFL marketplace
   - **Ongoing**: Yes, continuous cost while your app runs
   - **Command**: `oasis rofl deploy`

3. **Transaction Fees** (Gas on Oasis network)
   - **Cost**: Variable (typically small)
   - **Purpose**: Update configurations, manage secrets, etc.
   - **Ongoing**: Yes, for any management operations

### Your Oasis Account Address

This is the address that holds TEST tokens and manages your ROFL app:

```bash
# Generate/import your Oasis account
oasis wallet create
# Returns: oasis1qp3r8hgsnphajmfzfuaa8fhjag7e0yt35cjxq0u4

# Fund it from faucet
# Go to: https://faucet.testnet.oasis.io/
# Enter your oasis1... address
# You'll receive TEST tokens
```

**Key Point**: This address is on the **Oasis Network**, not on Base/Polygon/etc.

---

## Layer 2: TEE Application Runtime

### Addresses Inside the TEE

Your ROFL app runs inside a TEE and has its **own wallet addresses** for each blockchain it interacts with:

```typescript
// Inside TEE (rofl-app/src/services/OmnibusVaultManager.ts)
const wallet = new ethers.Wallet(
  process.env.TEE_FACILITATOR_PRIVATE_KEY_BASE,  // Different from your personal key!
  baseSepoliaProvider
);

console.log(wallet.address);
// Example: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

**Important Distinctions**:

- ✅ These are **EVM addresses** (0x...), not Oasis addresses
- ✅ One address **per chain** (Base has one, Polygon has another, etc.)
- ✅ These keys are **generated/managed separately** from your personal wallet
- ✅ These keys are **stored in ROFL KMS** (encrypted, never leave TEE)
- ❌ These addresses **do NOT need Oasis TEST tokens**
- ❌ These are **not your personal wallet addresses**

### Do You Need Tokens Inside the TEE?

**NO**, the TEE itself doesn't need tokens. But the addresses it uses do (see Layer 3).

---

## Layer 3: Target Blockchains (Base, Polygon, etc.)

### TEE Facilitator Addresses Need Gas

Your TEE app will **sign and send transactions** on external blockchains. These operations require gas fees:

```
Chain              TEE Facilitator Address                    Needs Gas (ETH)
─────────────────  ─────────────────────────────────────────  ───────────────
Base Sepolia       0x742d35Cc6634C0532925a3b844Bc454e4438f44e  ✅ Base ETH
Polygon Amoy       0x8B3a8F8e9c0D6f5E7a1b2c3d4e5f6a7b8c9d0e1f  ✅ Polygon ETH
Arbitrum Sepolia   0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B  ✅ Arbitrum ETH
Optimism Sepolia   0x9F8E7D6C5B4A3928170615E4D3C2B1A0987654    ✅ Optimism ETH
```

**Why Gas is Needed**:

```typescript
// Inside TEE, when settling payment
const tx = await omnibusVault.withdrawToSeller(
  seller,
  amount,
  intentHash
);
// This transaction costs gas on Base Sepolia!
// The TEE facilitator address must have Base ETH
```

### How to Fund TEE Facilitator Addresses

**Option 1: Pre-fund before deployment**

```bash
# Generate TEE facilitator wallet locally
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"
# Returns: 0x1234567890abcdef...

# Note the address
node -e "console.log(new (require('ethers')).Wallet('0x1234567890abcdef...').address)"
# Returns: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e

# Fund it on Base Sepolia
# Use Base Sepolia faucet: https://www.alchemy.com/faucets/base-sepolia
# Send ~0.1 ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e

# Upload private key to ROFL KMS
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_BASE "0x1234567890abcdef..."
```

**Option 2: Derive from ROFL KMS**

```typescript
// Future: Use ROFL KMS for deterministic key derivation
const teeAddress = await roflKms.deriveAddress("base-facilitator");
// Then fund this address from faucets
```

### Funding Checklist

Before deploying, fund ALL TEE facilitator addresses:

```bash
# For each chain your TEE supports:
# 1. Generate/derive address
# 2. Get gas tokens from chain-specific faucet
# 3. Verify balance

# Base Sepolia
cast balance 0x742d35Cc6634C0532925a3b844Bc454e4438f44e --rpc-url $BASE_SEPOLIA_RPC
# Should show: 100000000000000000 (0.1 ETH)

# Polygon Amoy
cast balance 0x8B3a8F8e9c0D6f5E7a1b2c3d4e5f6a7b8c9d0e1f --rpc-url $POLYGON_AMOY_RPC
# Should show: 100000000000000000 (0.1 MATIC)
```

---

## Complete Token Summary

| What                          | Where                  | Token Type      | Amount Needed       | Purpose                     | Ongoing? |
|-------------------------------|------------------------|-----------------|---------------------|-----------------------------|----------|
| ROFL app registration         | Oasis Testnet          | TEST            | 100 TEST (stake)    | Register app on blockchain  | No       |
| TEE machine rental            | Oasis Testnet          | TEST            | 10 TEST/hour        | Run TEE instance            | Yes      |
| Oasis management operations   | Oasis Testnet          | TEST            | ~1-5 TEST           | Update config, secrets      | Rare     |
| TEE facilitator gas (Base)    | Base Sepolia           | ETH             | ~0.1 ETH            | Sign withdrawal txs         | Yes      |
| TEE facilitator gas (Polygon) | Polygon Amoy           | MATIC           | ~0.1 MATIC          | Sign withdrawal txs         | Yes      |
| TEE facilitator gas (Arbitrum)| Arbitrum Sepolia       | ETH             | ~0.1 ETH            | Sign withdrawal txs         | Yes      |
| Omnibus vault deposits        | Base/Polygon/etc.      | USDC (testnet)  | User funds          | Buyer deposits for payments | N/A      |

---

## Can You Run TEE Without Tokens?

**Short Answer**: NO

**Long Answer**:

1. ❌ **Cannot deploy ROFL app** without TEST tokens (100 TEST for registration)
2. ❌ **Cannot run TEE** without TEST tokens (10 TEST/hour for machine rental)
3. ❌ **TEE cannot send transactions** without gas (ETH/MATIC on target chains)
4. ✅ **TEE can verify signatures and maintain ledger** without tokens (pure computation)

**Mental Model**: The TEE is like a server that:
- **Costs money to rent** (Oasis TEST tokens for infrastructure)
- **Needs gas to operate** (ETH/MATIC for blockchain interactions)
- **But runs code for free** (computation inside TEE has no per-operation cost)

---

## Practical Workflow for Your x402 Project

### Step 1: Set Up Oasis Account

```bash
# Create Oasis wallet
oasis wallet create
# Save mnemonic/private key!

# Get Oasis address
oasis wallet show
# Example: oasis1qp3r8hgsnphajmfzfuaa8fhjag7e0yt35cjxq0u4

# Fund from faucet
# Visit: https://faucet.testnet.oasis.io/
# Request: 200 TEST (100 for stake, 100 for ~10 hours runtime)
```

### Step 2: Generate TEE Facilitator Wallets

```bash
# Generate separate wallets for TEE (NOT your personal wallet)
# These will sign transactions FROM the TEE

# Base Sepolia facilitator
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Private Key:', w.privateKey); console.log('Address:', w.address)"
# Save: Private Key: 0xabc...
#       Address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e

# Polygon Amoy facilitator
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Private Key:', w.privateKey); console.log('Address:', w.address)"
# Save: Private Key: 0xdef...
#       Address: 0x8B3a8F8e9c0D6f5E7a1b2c3d4e5f6a7b8c9d0e1f
```

### Step 3: Fund TEE Facilitator Addresses

```bash
# Get testnet ETH/MATIC for each chain

# Base Sepolia ETH
# Visit: https://www.alchemy.com/faucets/base-sepolia
# Send 0.1 ETH to: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e

# Polygon Amoy MATIC
# Visit: https://faucet.polygon.technology/
# Send 0.1 MATIC to: 0x8B3a8F8e9c0D6f5E7a1b2c3d4e5f6a7b8c9d0e1f
```

### Step 4: Deploy OmnibusVault Contracts

```bash
# Deploy on Base Sepolia (facilitator = TEE address)
cd /home/hamiha70/Projects/ETHGlobal/x402-escrow
forge create src/OmnibusVault.sol:OmnibusVault \
  --constructor-args 0x036CbD53842874d3C7507B6B0f8638A1c6F41568 0x742d35Cc6634C0532925a3b844Bc454e4438f44e \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $YOUR_DEPLOYER_PRIVATE_KEY
# Note: Constructor args are (USDC address, TEE facilitator address)

# Save deployed address: 0xOmnibusVault...
```

### Step 5: Configure ROFL Secrets

```bash
cd rofl-app

# Upload secrets to ROFL KMS (encrypted)
oasis rofl secret set BASE_SEPOLIA_RPC "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_BASE "0xabc..."
oasis rofl secret set OMNIBUS_VAULT_BASE_SEPOLIA "0xOmnibusVault..."
oasis rofl secret set USDC_BASE_SEPOLIA "0x036CbD53842874d3C7507B6B0f8638A1c6F41568"

# Repeat for Polygon Amoy, etc.
```

### Step 6: Deploy ROFL App

```bash
cd rofl-app

# Build ROFL bundle
oasis rofl build

# Deploy to ROFL marketplace (costs 10 TEST/hour)
oasis rofl deploy --network testnet

# Get ROFL instance URL
# Example: https://rofl-abc123.oasis.io
```

### Step 7: Configure Main Facilitator Proxy

```bash
# In main facilitator .env
echo "ROFL_INSTANCE_URL=https://rofl-abc123.oasis.io" >> /home/hamiha70/Projects/ETHGlobal/x402-escrow/facilitator/.env

# Start main facilitator (proxies TEE requests)
cd /home/hamiha70/Projects/ETHGlobal/x402-escrow
npm run facilitator
```

---

## Key Takeaways

### 1. Three Separate Token Requirements

- **Oasis TEST tokens**: For deploying and running ROFL app
- **Chain-specific ETH/MATIC**: For TEE facilitator to pay gas on Base/Polygon/etc.
- **USDC (testnet)**: For buyers to deposit and sellers to receive (not related to infrastructure)

### 2. Three Separate Address Types

- **Oasis account** (oasis1...): Your personal account on Oasis Network
- **TEE facilitator addresses** (0x...): Wallets controlled by TEE for signing txs
- **Buyer/seller addresses** (0x...): End-user wallets (your project's users)

### 3. Mental Model

```
You (Personal Wallet)
  ├─ Oasis Account: oasis1qp3r8... (holds TEST tokens)
  │   └─ Funds: ROFL app deployment (100 TEST stake + 10 TEST/hour)
  │
  └─ Deployer Wallet: 0x123abc... (your EOA for deploying contracts)
      └─ Funds: Deploy OmnibusVault on Base/Polygon

TEE (Autonomous System)
  ├─ Base Facilitator: 0x742d35... (controlled by TEE)
  │   └─ Funds: Base ETH for gas
  │   └─ Purpose: Sign OmnibusVault.withdrawToSeller() txs
  │
  └─ Polygon Facilitator: 0x8B3a8F... (controlled by TEE)
      └─ Funds: Polygon MATIC for gas
      └─ Purpose: Sign OmnibusVault.withdrawToSeller() txs

Buyers (End Users)
  └─ Buyer Wallet: 0xabc123... (their personal wallet)
      └─ Funds: USDC (deposits to OmnibusVault)
      └─ Purpose: Pay for content via x402
```

---

## Common Misconceptions

### ❌ "TEE doesn't need any tokens"
**Reality**: TEE infrastructure costs TEST tokens to run (10/hour). TEE facilitator addresses need gas (ETH/MATIC).

### ❌ "I can use my personal wallet as TEE facilitator"
**Reality**: TEE facilitator keys are **generated separately** and stored in ROFL KMS. Never expose your personal keys.

### ❌ "Oasis TEST tokens work on Base/Polygon"
**Reality**: TEST tokens are **only for Oasis Network**. You need separate ETH/MATIC from chain-specific faucets.

### ❌ "Once I stake 100 TEST, TEE runs forever"
**Reality**: Stake is **registration only**. You pay **10 TEST/hour** for machine rental (ongoing cost).

### ❌ "TEE can run without internet/RPC access"
**Reality**: TEE needs **outbound HTTPS** to call Base/Polygon RPCs for signing and sending transactions.

---

## FAQ

**Q: How long can I run TEE with 200 TEST tokens?**  
A: 100 TEST for stake (recoverable) + 100 TEST for rental = 10 hours runtime.

**Q: Can I recover the 100 TEST stake?**  
A: Yes, when you unregister your ROFL app: `oasis rofl remove`

**Q: What happens if TEE runs out of gas (ETH/MATIC)?**  
A: Transactions will fail. Monitor balances and refund as needed.

**Q: Can TEE derive addresses deterministically?**  
A: Check ROFL KMS docs. For MVP, generate keys locally and upload to KMS.

**Q: How much ETH/MATIC does TEE need per transaction?**  
A: ~0.001-0.01 ETH per `withdrawToSeller()` call. Depends on gas price and contract complexity.

**Q: Can I test locally without deploying to ROFL?**  
A: Yes! Run `cd rofl-app && npm run dev`. No TEST tokens needed for local testing.

**Q: How do I get more TEST tokens for extended testing?**  
A: Request from faucet multiple times, or ask Oasis team for larger testnet allocation.

---

## Resources

- **Oasis Testnet Faucet**: https://faucet.testnet.oasis.io/
- **Base Sepolia Faucet**: https://www.alchemy.com/faucets/base-sepolia
- **Polygon Amoy Faucet**: https://faucet.polygon.technology/
- **Oasis ROFL Docs**: https://docs.oasis.io/build/rofl/
- **Oasis ROFL Quickstart**: https://docs.oasis.io/build/rofl/quickstart/
- **Oasis ROFL GitHub**: https://github.com/oasisprotocol/oasis-core

---

_This document clarifies the complete token and address model for deploying x402 TEE facilitator to Oasis ROFL._

