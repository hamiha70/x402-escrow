# Deployment Guide

This guide explains how to deploy x402 contracts across multiple chains and manage deployment addresses.

## File Structure

```
.env                  # Runtime config (private keys, RPCs) - NOT in git
deployed.env          # Deployment addresses (public) - IN git
example.env           # Template for .env - IN git
```

## Deployment Workflow

### 1. Deploy Vault to a New Chain

```bash
# Set target chain
CHAIN=base_sepolia  # or polygon_amoy, arbitrum_sepolia, etc.

# Deploy (facilitator is deployer)
forge script script/DeployVault.s.sol:DeployVault \
  --rpc-url $CHAIN \
  --broadcast \
  --verify \
  -vvvv

# Extract deployed address from output
VAULT_ADDRESS=0x...  # From "Vault Address: ..." in logs
```

### 2. Update `deployed.env`

```bash
# Manually edit deployed.env to add the new address
# Example:
# VAULT_BASE_SEPOLIA=0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833
```

### 3. Load Deployed Addresses in Code

**Option A: Merge into main `.env` (for runtime)**
```bash
# In your shell or CI/CD
cat deployed.env >> .env
```

**Option B: Load separately in Node.js**
```typescript
import dotenv from "dotenv";

// Load runtime config
dotenv.config({ path: ".env" });

// Load deployment addresses
dotenv.config({ path: "deployed.env" });

// Now both are available in process.env
const vaultAddress = process.env.VAULT_BASE_SEPOLIA;
```

**Option C: Reference in Forge scripts**
```solidity
// In your Forge script
address vaultAddress = vm.envAddress("VAULT_BASE_SEPOLIA");
```

### 4. Verify Contract (if verification failed during deployment)

```bash
forge verify-contract \
  0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833 \
  src/Vault.sol:Vault \
  --chain-id 84532 \
  --constructor-args $(cast abi-encode "constructor(address)" 0x036CbD53842c5426634e7929541eC2318f3dCF7e) \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY
```

## Multi-Chain Deployment Script

To deploy to all chains at once (coming soon):

```bash
# Deploy Vault to all configured testnets
npm run deploy:vault:all

# Or deploy to specific chain
npm run deploy:vault:base-sepolia
```

## Deployment Checklist

After deploying a new Vault:

- [ ] Update `deployed.env` with contract address
- [ ] Update `LAST_DEPLOYMENT_*` metadata in `deployed.env`
- [ ] Verify contract on block explorer
- [ ] Add explorer URL comment in `deployed.env`
- [ ] Run fork tests: `forge test --fork-url $BASE_SEPOLIA_RPC`
- [ ] Test deposit: `cast send $VAULT_ADDRESS "deposit(uint256)" 10000000 --private-key $BUYER_PRIVATE_KEY`
- [ ] Update seller/facilitator to use new vault address (they auto-load from env)
- [ ] Run E2E demo: `CHAIN=base-sepolia SCHEME=x402-escrow-deferred npm run buyer`
- [ ] Commit `deployed.env` to git
- [ ] Fund facilitator wallet with gas on new chain (if needed)

## Contract Ownership

**Vault:**
- **Deployer:** Facilitator wallet (`FACILITATOR_PRIVATE_KEY`)
- **Settler:** Facilitator (calls `batchWithdraw()`)
- **Depositors:** Anyone (buyers)
- **No admin functions:** Immutable, no upgrades, no pausing

## Security Notes

1. **`deployed.env` is PUBLIC** - Only contains contract addresses (safe to commit)
2. **`.env` is PRIVATE** - Contains private keys (NEVER commit)
3. **Vault is immutable** - No owner, no upgrades. Deploy carefully.
4. **Facilitator private key** - Secure this. It controls batch settlement.

## Troubleshooting

### Verification Failed: "Too many invalid api key attempts"

**Cause:** Rate limiting or invalid API key.

**Solution:**
```bash
# Wait 5-10 minutes, then retry
forge verify-contract <address> <contract_path> \
  --chain-id <chain_id> \
  --constructor-args <args> \
  --etherscan-api-key $BASESCAN_API_KEY
```

### Wrong Constructor Args

The Vault constructor takes a single `address` (USDC token):

```bash
# Encode constructor args
cast abi-encode "constructor(address)" $USDC_ADDRESS
```

### Deployment Gas Issues

Check facilitator balance on target chain:
```bash
cast balance $FACILITATOR_ADDRESS --rpc-url $CHAIN_RPC
```

If low, fund from faucet or `FUNDING_WALLET`.

## Next Steps

- [ ] Deploy to remaining testnets (Polygon Amoy, Arbitrum Sepolia, etc.)
- [ ] Implement multi-chain deployment script
- [ ] Create `PrivateVault.sol` for private-escrow-deferred scheme
- [ ] Add deployment CI/CD pipeline

