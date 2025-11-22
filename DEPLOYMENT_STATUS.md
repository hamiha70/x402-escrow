# Deployment Status

## ✅ Base Sepolia - DEPLOYED

### Vault Contract

| Property            | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| **Address**         | `0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833`                       |
| **Chain**           | Base Sepolia (84532)                                               |
| **Deployer**        | Facilitator (`0xB6A9eaE61290d3A891AB6D5efFEB3e98035BF064`)         |
| **USDC Token**      | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`                       |
| **Domain Separator**| `0x324eea0d38bb34f7b0b4ddae217cc90e4ea4847061cfc8c8fd5dd1ca3f1a3a2a` |
| **Deployed**        | 2024-11-22                                                         |
| **Gas Used**        | 1,239,308 gas (~0.0000018 ETH)                                     |
| **Explorer**        | https://sepolia.basescan.org/address/0x9ae3B8bba411C236d5aAC6c7548Ad6D389c3d833 |
| **Verification**    | ⏳ Pending (API key required)                                      |

### Manual Verification

If you have a Basescan API key, verify the contract:

```bash
source deployed.env

~/.foundry/bin/forge verify-contract \
  $VAULT_BASE_SEPOLIA \
  src/Vault.sol:Vault \
  --chain-id 84532 \
  --constructor-args $(~/.foundry/bin/cast abi-encode "constructor(address)" 0x036CbD53842c5426634e7929541eC2318f3dCF7e) \
  --etherscan-api-key $BASESCAN_API_KEY \
  --watch
```

Or use npm script:
```bash
npm run verify:vault:base-sepolia
```

---

## Next Steps

1. **Verify Contract** (if API key available)
2. **Fork Tests**
   ```bash
   forge test --fork-url $BASE_SEPOLIA_RPC -vvv
   ```
3. **Test Deposit Flow**
   ```bash
   # Approve USDC
   cast send $USDC_BASE_SEPOLIA "approve(address,uint256)" \
     $VAULT_BASE_SEPOLIA 10000000 \
     --private-key $BUYER_PRIVATE_KEY \
     --rpc-url $BASE_SEPOLIA_RPC

   # Deposit to Vault
   cast send $VAULT_BASE_SEPOLIA "deposit(uint256)" 10000000 \
     --private-key $BUYER_PRIVATE_KEY \
     --rpc-url $BASE_SEPOLIA_RPC

   # Check balance
   cast call $VAULT_BASE_SEPOLIA "deposits(address)" $BUYER_WALLET_ADDRESS \
     --rpc-url $BASE_SEPOLIA_RPC
   ```
4. **Update Services**
   - Facilitator auto-loads from `VAULT_BASE_SEPOLIA` env var
   - Seller auto-loads from `VAULT_BASE_SEPOLIA` env var
   - Merge `deployed.env` into `.env`: `cat deployed.env >> .env`
5. **Run E2E Demo**
   ```bash
   CHAIN=base-sepolia SCHEME=x402-escrow-deferred npm run buyer
   ```
6. **Deploy to Other Testnets**
   - Polygon Amoy
   - Arbitrum Sepolia
   - Optimism Sepolia
   - Arc Testnet (note: EIP-3009 issue documented)
   - Ethereum Sepolia

---

## Remaining Testnets

| Chain               | Chain ID | Vault Address | Status         |
| ------------------- | -------- | ------------- | -------------- |
| Polygon Amoy        | 80002    | TBD           | 🔜 Pending     |
| Arbitrum Sepolia    | 421614   | TBD           | 🔜 Pending     |
| Optimism Sepolia    | 11155420 | TBD           | 🔜 Pending     |
| Arc Testnet         | 1243     | TBD           | ⚠️ EIP-3009 Issue |
| Ethereum Sepolia    | 11155111 | TBD           | 🔜 Pending     |

---

## Deployment Architecture

**Ownership Model:**
- **Deployer:** Facilitator wallet (same for all chains)
- **Settlers:** Facilitator only (calls `batchWithdraw()`)
- **Depositors:** Any buyer (no restrictions)
- **Admin Functions:** None (immutable contract)

**Why Facilitator Deploys:**
- Facilitator is the only entity that calls `batchWithdraw()`
- Simplest trust model (no complex access control)
- Matches operational role

**Security:**
- Contract is immutable (no upgrades, no pausing)
- No owner or admin functions
- Deploy carefully - redeployment required for bugs
- Facilitator private key = batch settlement authority

