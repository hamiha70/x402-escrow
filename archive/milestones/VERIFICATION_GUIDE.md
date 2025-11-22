# Verification Guide for Multi-Chain Deployment

## Why Automated Verification > Manual

**Manual verification problems:**

- ❌ Must flatten contract (merge OpenZeppelin imports)
- ❌ Must match exact compiler settings (optimizer, runs, solc version)
- ❌ Must encode constructor args correctly
- ❌ Inheritance chains are error-prone
- ❌ Time-consuming and frustrating

**Automated verification (forge verify-contract):**

- ✅ Handles flattening automatically
- ✅ Reads compiler settings from foundry.toml
- ✅ Encodes constructor args correctly
- ✅ One command per chain
- ✅ Can retry if it fails

---

## 🎉 BREAKING NEWS: Etherscan API V2 (August 2024)

**You only need TWO API keys (not 5!)**

Etherscan introduced [API V2](https://docs.etherscan.io/resources/v2-migration) in August 2024, which allows **ONE API key to work for 60+ EVM chains** by specifying the `chainid` parameter.

### **Required API Keys**

#### 1. **ETHERSCAN_API_KEY** (covers 4 chains!)

```bash
# Get from: https://etherscan.io/myapikey
export ETHERSCAN_API_KEY="your_key_here"
```

**This ONE key works for:**

- ✅ Ethereum Sepolia
- ✅ Base Sepolia
- ✅ Arbitrum Sepolia
- ✅ Optimism Sepolia

**Free tier**: 5 calls/second, unlimited verifications

#### 2. **POLYGONSCAN_API_KEY** (separate family)

```bash
# Get from: https://polygonscan.com/myapikey
# Note: PolygonScan is NOT part of Etherscan family
export POLYGONSCAN_API_KEY="your_key_here"
```

**This key works for:**

- ✅ Polygon mainnet
- ✅ Polygon Amoy testnet

**Free tier**: 5 calls/second, unlimited verifications

#### 3. **Arc Testnet** (NOT Etherscan-compatible)

```bash
# Arc Testnet uses Blockscout, not Etherscan
# May require manual verification or different API system
```

**Status**: To be investigated (likely manual verification)

---

## Getting API Keys (10 minutes total)

### Step 1: Get Etherscan API Key (5 min)

1. Go to: [https://etherscan.io/register](https://etherscan.io/register)
2. Create account and verify email
3. Log in, navigate to "API-KEYs" section
4. Click "Add" to generate a new API key
5. Copy the key and add to your `.env`:
   ```bash
   ETHERSCAN_API_KEY=your_key_here
   ```

### Step 2: Get PolygonScan API Key (5 min)

1. Go to: [https://polygonscan.com/register](https://polygonscan.com/register)
2. Create account and verify email
3. Log in, navigate to "API-KEYs" section
4. Click "Add" to generate a new API key
5. Copy the key and add to your `.env`:
   ```bash
   POLYGONSCAN_API_KEY=your_key_here
   ```

**That's it!** You now have API keys for 5 testnets.

---

## Configure foundry.toml

Your `foundry.toml` should already be configured (check `[etherscan]` section):

```toml
[etherscan]
# Etherscan API V2 - single key for multiple chains
ethereum_sepolia = { key = "${ETHERSCAN_API_KEY}" }
base_sepolia = { key = "${ETHERSCAN_API_KEY}" }
arbitrum_sepolia = { key = "${ETHERSCAN_API_KEY}" }
optimism_sepolia = { key = "${ETHERSCAN_API_KEY}" }

# PolygonScan (separate from Etherscan family)
polygon_amoy = { key = "${POLYGONSCAN_API_KEY}" }

# Arc Testnet - manual verification likely needed
```

---

## Deployment Strategy

### Option A: Deploy + Verify Together (Recommended)

```bash
# Deploy and verify in one command
forge script script/DeployVault.s.sol \
  --rpc-url polygon_amoy \
  --broadcast \
  --verify
```

**Pros**:

- ✅ Verification happens automatically
- ✅ No need to remember constructor args later
- ✅ Immediate confirmation on explorer

**Cons**:

- ❌ Slower (waits for verification)
- ❌ Fails if API key is wrong/missing
- ❌ Can't test contract until verification completes

### Option B: Deploy First, Verify Later (Fallback)

```bash
# 1. Deploy only
forge script script/DeployVault.s.sol \
  --rpc-url polygon_amoy \
  --broadcast

# 2. Save the deployed address from logs

# 3. Verify later
forge verify-contract \
  --chain-id 80002 \
  $VAULT_ADDRESS \
  src/Vault.sol:Vault \
  --constructor-args $(cast abi-encode "constructor(address)" $USDC_POLYGON_AMOY) \
  --etherscan-api-key $POLYGONSCAN_API_KEY
```

**Pros**:

- ✅ Deploy works even without API keys
- ✅ Can test contract immediately
- ✅ Can retry verification separately

**Cons**:

- ❌ Must save constructor args for later
- ❌ Two-step process
- ❌ Easy to forget/lose deployment info

---

## Deployment Commands for Each Chain

### Polygon Amoy

```bash
# Deploy + verify
forge script script/DeployVault.s.sol \
  --rpc-url polygon_amoy \
  --broadcast \
  --verify

# Or verify separately:
forge verify-contract \
  --chain-id 80002 \
  $VAULT_POLYGON_AMOY \
  src/Vault.sol:Vault \
  --constructor-args $(cast abi-encode "constructor(address)" $USDC_POLYGON_AMOY) \
  --etherscan-api-key $POLYGONSCAN_API_KEY
```

**Explorer**: https://amoy.polygonscan.com/address/$VAULT_POLYGON_AMOY

### Arbitrum Sepolia

```bash
# Deploy + verify
forge script script/DeployVault.s.sol \
  --rpc-url arbitrum_sepolia \
  --broadcast \
  --verify

# Or verify separately:
forge verify-contract \
  --chain-id 421614 \
  $VAULT_ARBITRUM_SEPOLIA \
  src/Vault.sol:Vault \
  --constructor-args $(cast abi-encode "constructor(address)" $USDC_ARBITRUM_SEPOLIA) \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Explorer**: https://sepolia.arbiscan.io/address/$VAULT_ARBITRUM_SEPOLIA

### Optimism Sepolia

```bash
# Deploy + verify
forge script script/DeployVault.s.sol \
  --rpc-url optimism_sepolia \
  --broadcast \
  --verify

# Or verify separately:
forge verify-contract \
  --chain-id 11155420 \
  $VAULT_OPTIMISM_SEPOLIA \
  src/Vault.sol:Vault \
  --constructor-args $(cast abi-encode "constructor(address)" $USDC_OPTIMISM_SEPOLIA) \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Explorer**: https://sepolia-optimism.etherscan.io/address/$VAULT_OPTIMISM_SEPOLIA

### Ethereum Sepolia

```bash
# Deploy + verify
forge script script/DeployVault.s.sol \
  --rpc-url ethereum_sepolia \
  --broadcast \
  --verify

# Or verify separately:
forge verify-contract \
  --chain-id 11155111 \
  $VAULT_ETHEREUM_SEPOLIA \
  src/Vault.sol:Vault \
  --constructor-args $(cast abi-encode "constructor(address)" $USDC_ETHEREUM_SEPOLIA) \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Explorer**: https://sepolia.etherscan.io/address/$VAULT_ETHEREUM_SEPOLIA

### Arc Testnet (Manual - Blockscout)

```bash
# Try automated first (may work with Blockscout API):
forge verify-contract \
  --chain-id 1243 \
  $VAULT_ARC_TESTNET \
  src/Vault.sol:Vault \
  --constructor-args $(cast abi-encode "constructor(address)" $USDC_ARC_TESTNET) \
  --verifier blockscout \
  --verifier-url https://testnet.arcscan.net/api

# If that fails, use manual verification:
# 1. Go to: https://testnet.arcscan.net/verifyContract
# 2. Upload src/Vault.sol
# 3. Compiler: 0.8.20
# 4. Optimizer: Enabled (200 runs)
# 5. Constructor args: (encoded USDC address)
```

**Explorer**: https://testnet.arcscan.net/address/$VAULT_ARC_TESTNET

---

## Troubleshooting

### "Already verified"

- ✅ Contract is already verified, nothing to do!
- Check explorer to confirm

### "Invalid API key"

- Check `.env` file has correct key (no spaces)
- Verify key works on explorer website
- Make sure using correct key for chain:
  - Polygon → `POLYGONSCAN_API_KEY`
  - All others → `ETHERSCAN_API_KEY`

### "Unable to locate ContractCode"

- Contract not deployed yet
- Wrong address
- Wrong chain ID

### "Bytecode does not match"

- Compiler settings don't match
- Wrong solc version (should be 0.8.20)
- Wrong optimizer settings (should be enabled, 200 runs)
- Constructor args incorrect

### "Rate limit exceeded"

- Free tier: 5 calls/second
- Wait a few seconds and retry
- Or upgrade to paid tier (not needed for this project)

---

## Recommended Workflow

1. ✅ **Get Etherscan API key** (5 min) → Add to `.env`
2. ✅ **Get PolygonScan API key** (5 min) → Add to `.env`
3. ✅ **Verify `foundry.toml` is configured** (already done)
4. ✅ **Deploy + verify Polygon Amoy** (first testnet)
5. ✅ **Deploy + verify remaining chains** (Arbitrum, Optimism, Ethereum Sepolia)
6. ✅ **Update `deployed.env`** with all verified addresses
7. ✅ **Test Arc Testnet** (may need manual verification)

**Total time**: ~30 minutes for all chains (excluding Arc)

This avoids the manual verification nightmare! 🎉
