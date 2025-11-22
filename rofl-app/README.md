# x402 TEE ROFL App

Standalone Trusted Execution Environment application for x402-tee-facilitator scheme.

**Runs**: Inside Oasis ROFL (isolated from main facilitator)  
**Purpose**: Private buyer-seller accounting with sealed storage  
**Scheme**: x402-tee-facilitator only

---

## Architecture

This is a **standalone application** that runs independently from the main facilitator server (`facilitator/server.ts`).

```
Regular Facilitator (Outside TEE)
  ↓ proxies TEE requests
ROFL App (Inside TEE) ← You are here
  ↓ settles via
Omnibus Vaults (On-chain)
```

---

## Quick Start

### Prerequisites

1. Install dependencies:

   ```bash
   npm install
   ```

2. Deploy OmnibusVault contracts (see `../script/DeployOmnibusVault.s.sol`)

3. Install Oasis CLI:
   ```bash
   curl https://install.oasis.io | bash
   ```

### Build

```bash
# Compile TypeScript
npm run build

# Build Docker + ROFL bundle
./scripts/build.sh
```

### Deploy

```bash
# 1. Set secrets (RPC URLs, keys, addresses)
./scripts/set-secrets.sh

# 2. Deploy to ROFL
./scripts/deploy.sh
```

### Local Testing (Non-TEE)

```bash
# Run locally for testing
export LEDGER_PATH="./data/tee-ledger.json"
export BASE_SEPOLIA_RPC="https://..."
export TEE_FACILITATOR_PRIVATE_KEY_BASE="0x..."
export OMNIBUS_VAULT_BASE_SEPOLIA="0x..."
export USDC_BASE_SEPOLIA="0x..."

npm run dev
```

---

## API Endpoints

All endpoints run INSIDE the TEE:

- `POST /settle` - Process TEE payment
- `GET /balance/:address?chain=X` - Query buyer balance
- `GET /activity` - Get activity log (demo)
- `GET /activity/:address` - Buyer-specific activity
- `GET /attestation` - TEE measurement
- `GET /health` - Health check

---

## File Structure

```
rofl-app/
├── src/
│   ├── index.ts           # Main Express server
│   ├── routes/            # HTTP route handlers
│   ├── services/          # Business logic
│   └── utils/             # Helpers (logger, types, config)
├── dist/                  # Compiled JavaScript (gitignored)
├── package.json
├── tsconfig.json
├── Dockerfile             # Container image
├── rofl.yaml              # ROFL configuration
└── scripts/               # Build + deployment
```

---

## Secrets (ROFL KMS)

Managed via `oasis rofl secret set`:

**RPC URLs** (5 chains):

- `BASE_SEPOLIA_RPC`
- `POLYGON_AMOY_RPC`
- `ARBITRUM_SEPOLIA_RPC`
- `OPTIMISM_SEPOLIA_RPC`
- `ARC_TESTNET_RPC`

**Private Keys** (5 chains):

- `TEE_FACILITATOR_PRIVATE_KEY_BASE`
- `TEE_FACILITATOR_PRIVATE_KEY_POLYGON`
- (etc.)

**Contract Addresses** (5 chains):

- `OMNIBUS_VAULT_BASE_SEPOLIA`
- `USDC_BASE_SEPOLIA`
- (etc.)

All secrets are encrypted and sealed in TEE.

---

## Sealed Storage

**Location**: `/data/` (mounted by ROFL)

**Files**:

- `tee-ledger.json` - Per-chain buyer balances
- (Activity log embedded in ledger)

**Encryption**: Handled by ROFL/TEE automatically

---

## Testing

### Unit Tests

```bash
# TODO: Add unit tests for ledger operations
npm test
```

### E2E Test

```bash
# From parent directory
npm run test:e2e-tee
```

---

## Deployment Commands

```bash
# Full workflow
npm install           # Install deps
npm run build         # Compile TS → JS
./scripts/build.sh    # Build Docker + ROFL
./scripts/set-secrets.sh  # Upload secrets
./scripts/deploy.sh   # Deploy to ROFL
```

---

## Verification

### Attestation Check

```bash
curl https://<rofl-instance>/attestation
```

Returns TEE measurement for buyer verification.

### Health Check

```bash
curl https://<rofl-instance>/health
```

Returns ledger stats and uptime.

---

_This is a standalone ROFL application. It does NOT depend on the parent facilitator code._
