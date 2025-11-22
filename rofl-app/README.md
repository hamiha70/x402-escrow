# x402 TEE ROFL App

Standalone Oasis ROFL application for x402-tee-facilitator payment scheme.

## Architecture

This is a **standalone service** that runs inside an Oasis ROFL Trusted Execution Environment:

```
Main Facilitator (facilitator/)     ROFL App (rofl-app/)
Port: 4023 (outside TEE)            Port: 8080 (inside TEE)
├─ /settle (exact)                  ├─ /settle (TEE settlement)
├─ /validate-intent (escrow)        ├─ /balance (TEE ledger query)
└─ /tee-settle → PROXY ───────────→ ├─ /activity (activity log)
                                     └─ /attestation (TEE measurement)
```

**Why standalone**:

- Security: TEE only contains code it needs
- Isolation: No mixing of TEE and non-TEE logic
- Testability: Can run/test independently
- Deployment: ROFL app deployed separately to Oasis infrastructure

## Local Development

### Prerequisites

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Run Locally (Non-TEE Testing)

```bash
# Set environment variables
export BASE_SEPOLIA_RPC="https://..."
export OMNIBUS_VAULT_BASE_SEPOLIA="0x..."
export TEE_FACILITATOR_PRIVATE_KEY_BASE="0x..."
export USDC_BASE_SEPOLIA="0x..."
export TEE_LEDGER_PATH="./data/tee-ledger.json"

# Create data directory
mkdir -p data

# Run app
npm run dev
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8080/health

# Balance query
curl http://localhost:8080/balance/0xBuyerAddress?chain=84532

# Activity log
curl http://localhost:8080/activity

# Attestation (returns placeholder locally)
curl http://localhost:8080/attestation
```

## ROFL Deployment

### 1. Build Docker Image

```bash
./scripts/build.sh
```

### 2. Set Secrets

```bash
./scripts/set-secrets.sh
```

This uploads encrypted secrets to ROFL KMS:

- RPC URLs for each chain
- TEE facilitator private keys (separate from main facilitator)
- Omnibus vault addresses
- USDC addresses

### 3. Deploy to ROFL

```bash
./scripts/deploy.sh
```

This:

- Builds ROFL bundle from `rofl.yaml`
- Deploys to Oasis ROFL marketplace
- Returns ROFL instance URL and attestation

### 4. Configure Main Facilitator

```bash
# In main facilitator .env
ROFL_INSTANCE_URL=https://abc123.rofl.oasis.io

# Restart main facilitator
cd ..
npm run facilitator
```

Now main facilitator will proxy `/tee-settle` requests to ROFL instance.

## File Structure

```
rofl-app/
├── src/
│   ├── index.ts              # Main Express server (TEE only)
│   ├── routes/
│   │   ├── settle.ts         # POST /settle (payment settlement)
│   │   ├── balance.ts        # GET /balance (ledger queries)
│   │   ├── activity.ts       # GET /activity (activity log)
│   │   └── attestation.ts    # GET /attestation (TEE measurement)
│   ├── services/
│   │   ├── TEELedgerManager.ts    # File-based accounting
│   │   └── OmnibusVaultManager.ts # Chain interaction
│   └── utils/
│       ├── logger.ts         # Simple logger
│       └── types.ts          # Type definitions
├── package.json              # Independent dependencies
├── tsconfig.json             # TypeScript config
├── Dockerfile                # Builds standalone app
├── rofl.yaml                 # ROFL configuration
├── .dockerignore
├── scripts/
│   ├── build.sh              # Build Docker image
│   ├── set-secrets.sh        # Upload secrets to ROFL KMS
│   └── deploy.sh             # Deploy to ROFL
└── README.md                 # This file
```

## TEE Storage

### Ledger File

**Path**: `/data/tee-ledger.json` (sealed by TEE)

**Structure**:

```json
{
  "buyers": {
    "0xBuyerAddress": {
      "chains": {
        "84532": {
          "balance": "1000000",
          "nonce": 5,
          "deposits": [...],
          "spends": [...]
        }
      }
    }
  },
  "activityLog": [
    {
      "timestamp": 1700000000,
      "type": "deposit",
      "buyer": "0x...",
      "chain": 84532,
      "amount": "1000000",
      "txHash": "0x...",
      "ledgerHash": "0x..."
    }
  ]
}
```

### Per-Chain Accounting

Each buyer has independent balances per chain:

- Deposit on Base → balance on chain 84532
- Deposit on Polygon → balance on chain 80002
- Cannot spend Polygon balance for Base payment

## Integration

### Seller Returns Requirements

```json
{
  "scheme": "x402-tee-facilitator",
  "facilitator": "http://localhost:4023/tee-settle", // Main facilitator proxy!
  "vault": "0xOmnibusVault...",
  "attestation": "https://<rofl-instance>/attestation" // Direct to ROFL
}
```

### Buyer Sends Payment

```typescript
// Buyer posts to main facilitator (which proxies to ROFL)
POST http://localhost:4023/tee-settle
{
  intentStruct: {
    buyer: "0x...",
    seller: "0x...",
    amount: "10000",
    token: "0x...",
    nonce: "0x...",
    expiry: 1700000000,
    resource: "/api/premium",
    chainId: 84532
  },
  signature: "0x..."
}
```

## Security Notes

- **Secrets**: Encrypted in ROFL KMS, injected as env vars
- **Ledger**: Sealed in TEE storage at `/data`
- **Private keys**: Never leave TEE
- **Attestation**: Buyers can verify TEE measurement before trusting

## Troubleshooting

**Issue**: `npm run build` fails  
**Solution**: Run `npm install` first

**Issue**: Docker build fails  
**Solution**: Check TypeScript compilation errors

**Issue**: ROFL deployment fails  
**Solution**: Verify `oasis` CLI installed and configured

**Issue**: Health check fails  
**Solution**: Check port 8080 is exposed and app is listening
