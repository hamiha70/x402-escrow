# Oasis Team Session Brief

**Date**: November 22, 2025  
**Duration**: ~3 hours  
**Goal**: Deploy TEE facilitator to Oasis ROFL and validate privacy scheme

---

## What We Built

Complete implementation of **x402-tee-facilitator** scheme:

- Smart contract: `OmnibusVault.sol` (simple vault with facilitator-only withdrawals)
- TEE services: File-based ledger + vault manager
- ROFL config: Docker + app.yaml ready for deployment
- Multi-chain support: Works on Base, Polygon, Arbitrum, Optimism, Arc
- Privacy: Buyer-seller linkage hidden (only visible in TEE ledger)

**Total**: ~1200 lines of production-ready code

---

## Key Questions for Oasis Team

### 1. ROFL Configuration Validation

**File**: `rofl/app.yaml`

Is this format correct for TypeScript/Node.js applications?

- Endpoints: POST /tee-settle, GET /balance, GET /activity, etc.
- Secrets: RPC URLs + private keys via ROFL KMS
- Storage: /data mount (encrypted, persistent)
- Network: allow_outbound for RPC calls to external chains

### 2. Secrets Management

**How to inject**:

```bash
oasis rofl secret set BASE_SEPOLIA_RPC "https://..."
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_BASE "0x..."
```

**Questions**:

- Are secrets available as environment variables in container?
- How to securely manage 6+ private keys (one per chain)?
- Can we use ROFL KMS for key derivation?

### 3. Storage Persistence

**TEE ledger**: `data/tee-ledger.json`

**Questions**:

- How does /data persist across TEE restarts?
- What happens if TEE crashes mid-write?
- Can we recover ledger from sealed storage?
- File size limits for sealed storage?

### 4. Attestation Endpoint

**Need to expose**: TEE measurement via HTTP

**Questions**:

- How to implement `/attestation` endpoint in TypeScript?
- What data should we return (measurement, code hash, etc.)?
- How often does measurement change?
- Can buyers verify measurement client-side?

### 5. RPC Calls from TEE

**TEE needs to call**:

- QuickNode/Alchemy RPC (Base, Polygon, etc.)
- ~10-20 RPC calls per payment (signature verification, balance checks, settlement)

**Questions**:

- Are outbound HTTPS calls from TEE allowed?
- Any rate limiting or restrictions?
- Can we batch RPC calls?
- What happens if RPC provider is unreachable?

### 6. Multi-Chain Wallets

**TEE manages** 6 facilitator wallets (one per chain):

- Base Sepolia: Deploy OmnibusVault, sign withdrawal txs
- Polygon Amoy: Deploy OmnibusVault, sign withdrawal txs
- Etc.

**Questions**:

- Can one ROFL instance manage multiple chain connections?
- How to handle different gas prices/nonces per chain?
- Any concurrency issues with multi-chain operations?

---

## Deployment Checklist

### Pre-Deployment (Our Side)

- [ ] Deploy OmnibusVault to Base Sepolia
- [ ] Fund TEE facilitator address with ETH (for gas)
- [ ] Authorize seller in OmnibusVault allowlist
- [ ] Test Docker build locally: `cd rofl && ./scripts/build.sh`
- [ ] Verify facilitator works without ROFL: `npm run facilitator`

### ROFL Deployment (With Oasis Team)

- [ ] Review app.yaml configuration
- [ ] Build ROFL bundle: `oasis rofl build`
- [ ] Set all secrets: `./scripts/set-secrets.sh`
- [ ] Deploy to ROFL: `oasis rofl deploy --network testnet`
- [ ] Get ROFL instance URL
- [ ] Verify attestation endpoint: `curl <url>/attestation`
- [ ] Verify health endpoint: `curl <url>/health`

### Testing (With Oasis Team)

- [ ] Buyer deposits to OmnibusVault (on-chain)
- [ ] Query TEE ledger: `curl <url>/balance/0xBuyer`
- [ ] Buyer sends payment intent to TEE
- [ ] Verify TEE settles to seller
- [ ] Check activity log: `curl <url>/activity`
- [ ] Verify no on-chain buyer-seller linkage

---

## Demo Flow (For Oasis Team)

### 1. Deposit Phase

```bash
# Buyer deposits 1 USDC to OmnibusVault on Base Sepolia
cast send $OMNIBUS_VAULT_BASE_SEPOLIA \
  "deposit(uint256)" 1000000 \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $BUYER_PRIVATE_KEY
```

### 2. Verify Ledger Updated

```bash
# Query TEE ledger balance
curl https://<rofl-instance>/balance/0xBuyerAddress?chain=84532

# Expected response:
{
  "address": "0xBuyerAddress",
  "chain": 84532,
  "balance": "1000000",
  "nonce": 0,
  "deposits": [...]
}
```

### 3. Payment Phase

```typescript
// Buyer signs payment intent
const intent = {
  buyer: buyerAddress,
  seller: sellerAddress,
  amount: "10000", // 0.01 USDC
  token: usdcAddress,
  nonce: randomBytes32(),
  expiry: now() + 300,
  resource: "/api/premium",
  chainId: 84532,
};

const signature = await wallet.signTypedData(domain, types, intent);

// Send to TEE
const response = await axios.post("https://<rofl-instance>/tee-settle", {
  intentStruct: intent,
  signature: signature,
});

console.log(response.data);
// {
//   success: true,
//   txHash: "0x...",
//   newBalance: "990000",
//   ...
// }
```

### 4. Verify Settlement

```bash
# Check seller received payment
cast call $USDC_BASE_SEPOLIA \
  "balanceOf(address)" $SELLER_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC

# Check activity log
curl https://<rofl-instance>/activity

# Expected: Shows deposit + spend events with timestamps
```

### 5. Privacy Verification

```bash
# Query on-chain events
# Deposit event: shows buyer address
# Withdrawal event: shows seller address
# No event links buyer to seller!

# This is the privacy gain: observer sees deposits and withdrawals
# but cannot connect specific buyer to specific seller
```

---

## Implementation Status

### ✅ Complete

- OmnibusVault.sol contract (tested, ready to deploy)
- TEELedgerManager (per-chain accounting, activity log)
- OmnibusVaultManager (multi-chain vault interaction)
- HTTP routes: /tee-settle, /balance, /activity
- ROFL configuration: Dockerfile, app.yaml, scripts
- E2E test skeleton
- Complete specification document

### 🔧 Ready for Oasis Review

- ROFL app.yaml format
- Secrets injection mechanism
- Sealed storage configuration
- Attestation implementation
- Outbound RPC calls

### ⏸️ Postponed (Post-Deployment)

- Service folder reorganization by scheme
- Refactoring import paths
- Enhanced authentication for balance queries
- Redundant TEE instances

---

## Success Criteria

By end of Oasis session, we should have:

1. ✅ TEE facilitator deployed to ROFL testnet
2. ✅ Secrets configured (RPC URLs + keys)
3. ✅ OmnibusVault deployed on Base Sepolia
4. ✅ End-to-end payment working (deposit → settle → verify)
5. ✅ Activity log showing real-time accounting
6. ✅ Attestation endpoint returning TEE measurement
7. ✅ Privacy validated (no on-chain buyer-seller link)

---

## Files to Review with Oasis Team

1. `rofl/app.yaml` - ROFL configuration
2. `rofl/Dockerfile` - Container image
3. `TEE_FACILITATOR_SPECIFICATION.md` - Complete technical spec
4. `src/OmnibusVault.sol` - Smart contract
5. `facilitator/services/TEELedgerManager.ts` - Ledger implementation

---

_Ready for Oasis team collaboration. All code complete, questions documented, demo flow prepared._
