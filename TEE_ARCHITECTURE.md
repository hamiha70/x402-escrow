# TEE Facilitator Architecture

**Critical Design Decision**: Standalone ROFL app vs monolithic approach

---

## System Architecture

### Two Separate Applications

```
┌─────────────────────────────────────────────────┐
│  Facilitator (Outside TEE)                      │
│  ────────────────────────────────               │
│  Location: facilitator/server.ts                │
│  Port: 4023                                      │
│  Runs: On regular server (no TEE)               │
│                                                  │
│  Responsibilities:                               │
│  • Handle x402-exact scheme (EIP-3009)          │
│  • Handle x402-escrow-deferred (Vault.sol)      │
│  • PROXY x402-tee-facilitator to ROFL           │
│                                                  │
│  Routes:                                         │
│  POST /settle          → ExactSettlement        │
│  POST /validate-intent → EscrowDeferred         │
│  POST /tee-settle      → axios.post(ROFL/settle)│
│  GET  /balance/:addr   → axios.get(ROFL/balance)│
│  GET  /activity        → axios.get(ROFL/activity)│
└──────────────────────┬──────────────────────────┘
                       │
                       │ HTTPS (proxy)
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  ROFL App (Inside TEE)                          │
│  ──────────────────────                         │
│  Location: rofl-app/src/index.ts                │
│  Port: 8080                                      │
│  Runs: Inside Oasis ROFL TEE                    │
│                                                  │
│  Responsibilities:                               │
│  • Handle x402-tee-facilitator scheme ONLY      │
│  • Maintain private ledger in sealed storage    │
│  • Verify EIP-712 signatures                    │
│  • Settle via OmnibusVault                      │
│                                                  │
│  Routes:                                         │
│  POST /settle          → TEE settlement logic   │
│  GET  /balance/:address → Query sealed ledger   │
│  GET  /activity        → Activity log           │
│  GET  /attestation     → TEE measurement        │
│                                                  │
│  Data (Sealed in TEE):                           │
│  • /data/tee-ledger.json                        │
│  • /data/tee-activity-log.json                  │
└─────────────────────────────────────────────────┘
```

---

## Why Standalone ROFL App?

### Problem with Monolithic Approach

**If we packaged entire facilitator/**:

- ❌ TEE contains exact + escrow-deferred code (unnecessary attack surface)
- ❌ Large Docker image → harder to verify measurement
- ❌ TEE overhead for non-TEE schemes
- ❌ Mixing TEE and non-TEE logic confuses trust model

### Benefits of Standalone App

**Minimal TEE codebase**:

- ✅ Only TEE-scheme logic inside TEE
- ✅ Small Docker image → easy measurement verification
- ✅ Clear separation of concerns
- ✅ Follows ROFL best practices (seen in oasisprotocol/rofl-x402-service)

---

## Directory Structure

### rofl-app/ (Standalone, Runs in TEE)

```
rofl-app/
├── src/
│   ├── index.ts                   # Standalone Express server
│   ├── routes/
│   │   ├── settle.ts              # POST /settle
│   │   ├── balance.ts             # GET /balance/:address
│   │   ├── activity.ts            # GET /activity
│   │   └── attestation.ts         # GET /attestation
│   ├── services/
│   │   ├── TEELedgerManager.ts    # Per-chain accounting
│   │   └── OmnibusVaultManager.ts # Multi-chain vault manager
│   └── utils/
│       ├── logger.ts              # Simple console logger
│       ├── types.ts               # PaymentIntent, etc.
│       └── config.ts              # Chain configuration
├── package.json                   # express, ethers ONLY
├── tsconfig.json
├── Dockerfile                     # Builds rofl-app/
├── rofl.yaml                      # ROFL configuration
└── scripts/
    ├── build.sh                   # Build Docker + ROFL bundle
    ├── set-secrets.sh             # Upload to ROFL KMS
    └── deploy.sh                  # Deploy to ROFL
```

### facilitator/ (Existing, Runs Outside TEE)

```
facilitator/
├── server.ts                      # UPDATE: Add TEE proxy
├── routes/
│   ├── exact.ts                   # Existing
│   ├── escrowDeferred.ts          # Existing
│   └── teeProxy.ts                # NEW: Forward to ROFL
└── services/
    ├── ExactSettlement.ts         # Existing
    ├── EscrowDeferredValidation.ts # Existing
    ├── BatchSettler.ts            # Existing
    └── SettlementQueue.ts         # Existing
```

**Note**: TEELedgerManager and OmnibusVaultManager are MOVED to rofl-app/, not in facilitator/.

---

## Code Duplication Strategy

### What Gets Copied to rofl-app/

**Types** (`rofl-app/src/utils/types.ts`):

```typescript
// Copy PaymentIntent interface from shared/types.ts
export interface PaymentIntent {
  buyer: address;
  seller: address;
  amount: uint256;
  // ...
}
```

**Logger** (`rofl-app/src/utils/logger.ts`):

```typescript
// Simplified logger (no dependencies)
export function createLogger(name: string) {
  return {
    info: (msg: string) => console.log(`[${name}] INFO: ${msg}`),
    error: (msg: string) => console.error(`[${name}] ERROR: ${msg}`),
    // ...
  };
}
```

**Why copy instead of import**:

- ✅ ROFL app has zero dependencies on parent project
- ✅ Can be built/deployed independently
- ✅ Smaller Docker image (no unused code)
- ✅ Clear boundary between TEE and non-TEE code

---

## Communication Flow

### Buyer → Seller → Facilitator → ROFL

```
1. Buyer requests content
   GET /api/content?scheme=x402-tee-facilitator

2. Seller returns 402 with requirements
   {
     "facilitator": "http://localhost:4023/tee-settle",  // Facilitator URL
     "vault": "0xOmnibusVault...",
     "attestation": "http://localhost:4023/attestation"   // Proxied
   }

3. Buyer sends payment to Facilitator
   POST http://localhost:4023/tee-settle
   { intentStruct, signature }

4. Facilitator proxies to ROFL
   POST https://rofl-instance.oasis.io/settle
   { intentStruct, signature }

5. ROFL verifies, settles, updates ledger
   Returns: { success, txHash, newBalance }

6. Facilitator returns response to Buyer
   { success, txHash, newBalance }

7. Seller delivers content
```

**Key**: Sellers don't know about ROFL; they only talk to facilitator (unified API).

---

## Deployment Workflow

### 1. Deploy Contracts (Outside TEE)

```bash
# Deploy OmnibusVault to Base Sepolia
forge script script/DeployOmnibusVault.s.sol \
  --rpc-url base_sepolia \
  --broadcast

# Record address in deployed-tee.env
OMNIBUS_VAULT_BASE_SEPOLIA=0x...
```

### 2. Build ROFL App

```bash
cd rofl-app

# Install dependencies
npm install

# Build TypeScript → JavaScript
npm run build

# Build Docker image
docker build -t x402-tee-rofl:latest .

# Build ROFL bundle
oasis rofl build
```

### 3. Set Secrets

```bash
cd rofl-app

# Upload encrypted secrets to ROFL KMS
./scripts/set-secrets.sh
```

### 4. Deploy to ROFL

```bash
cd rofl-app

# Deploy to Oasis ROFL marketplace
oasis rofl deploy --network testnet

# Get ROFL instance URL
# Example: https://x402-tee.rofl.oasis.io
```

### 5. Configure Facilitator Proxy

```bash
# In facilitator .env
ROFL_INSTANCE_URL=https://x402-tee.rofl.oasis.io

# Restart facilitator
npm run stop
npm run start
```

### 6. Test End-to-End

```bash
# Buyer deposits to OmnibusVault
# Buyer requests content with scheme=x402-tee-facilitator
# Payment flows: Seller → Facilitator → ROFL → On-chain
# Verify privacy: No buyer-seller linkage
```

---

## Code That Runs WHERE

### Inside TEE (rofl-app/)

**Files**: Everything in `rofl-app/src/`

- ✅ index.ts (Express server)
- ✅ routes/ (settle, balance, activity, attestation)
- ✅ services/ (TEELedgerManager, OmnibusVaultManager)
- ✅ utils/ (logger, types, config)

**Data**: Sealed storage at `/data/`

- ✅ tee-ledger.json
- ✅ tee-activity-log.json

**Secrets**: ROFL KMS

- ✅ RPC URLs
- ✅ Private keys
- ✅ Vault addresses

### Outside TEE (facilitator/)

**Files**: Everything in `facilitator/`

- ✅ server.ts (proxy for TEE routes)
- ✅ routes/exact.ts, routes/escrowDeferred.ts
- ✅ services/ExactSettlement.ts, services/EscrowDeferredValidation.ts

**No overlap**: rofl-app/ and facilitator/ are completely independent.

---

## Updated File List

### NEW Files (rofl-app/)

1. `rofl-app/package.json` - Minimal dependencies
2. `rofl-app/tsconfig.json` - TypeScript config
3. `rofl-app/Dockerfile` - Builds rofl-app only
4. `rofl-app/rofl.yaml` - ROFL configuration
5. `rofl-app/src/index.ts` - Main TEE server
6. `rofl-app/src/routes/settle.ts` - Settlement logic
7. `rofl-app/src/routes/balance.ts` - Balance queries
8. `rofl-app/src/routes/activity.ts` - Activity log
9. `rofl-app/src/routes/attestation.ts` - TEE measurement
10. `rofl-app/src/services/TEELedgerManager.ts` - Moved from facilitator/
11. `rofl-app/src/services/OmnibusVaultManager.ts` - Moved from facilitator/
12. `rofl-app/src/utils/logger.ts` - Simple logger
13. `rofl-app/src/utils/types.ts` - Type definitions
14. `rofl-app/src/utils/config.ts` - Chain config

### UPDATED Files (facilitator/)

1. `facilitator/server.ts` - Add ROFL proxy routes
2. `facilitator/routes/teeProxy.ts` - NEW: Proxy implementation

### REMOVED Files (facilitator/)

1. ~~`facilitator/services/TEELedgerManager.ts`~~ → Moved to rofl-app/
2. ~~`facilitator/services/OmnibusVaultManager.ts`~~ → Moved to rofl-app/
3. ~~`facilitator/routes/teeSettle.ts`~~ → Becomes proxy only
4. ~~`facilitator/routes/balance.ts`~~ → Becomes proxy only

---

_This architecture properly separates TEE code (rofl-app) from non-TEE code (facilitator) following ROFL best practices._
