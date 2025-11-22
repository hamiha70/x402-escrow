# ROFL Deployment for TEE Facilitator

This directory contains configuration for deploying the x402 facilitator inside an Oasis ROFL (Runtime Off-chain Logic) Trusted Execution Environment.

## Prerequisites

1. Install Oasis CLI:
   ```bash
   curl https://install.oasis.io | bash
   ```

2. Configure Oasis account:
   ```bash
   oasis wallet create
   oasis wallet fund  # Get testnet tokens
   ```

3. Deploy OmnibusVault contracts first (on Base, Polygon, etc.)

## Deployment Steps

### 1. Build Docker Image

```bash
./scripts/build.sh
```

This creates `x402-tee-facilitator:latest` Docker image.

### 2. Set Secrets

```bash
./scripts/set-secrets.sh
```

This uploads encrypted secrets to ROFL KMS:
- RPC URLs for each chain
- Facilitator private keys
- Omnibus vault addresses
- USDC addresses

**Important**: Secrets are encrypted and never stored in plaintext.

### 3. Deploy to ROFL

```bash
./scripts/deploy.sh
```

This:
- Builds ROFL bundle from Docker image
- Deploys to Oasis ROFL marketplace
- Returns TEE instance URL and attestation

### 4. Verify Deployment

```bash
# Check health
curl https://<rofl-instance>/health

# Get attestation
curl https://<rofl-instance>/attestation

# Query balance
curl https://<rofl-instance>/balance/0xBuyerAddress
```

## Local Testing (Non-TEE)

Test facilitator locally before ROFL deployment:

```bash
# From project root
export TEE_LEDGER_PATH="./data/tee-ledger.json"
npm run facilitator
```

## File Structure

```
rofl/
├── Dockerfile              # Container image definition
├── app.yaml                # ROFL configuration
├── .dockerignore           # Files excluded from image
├── scripts/
│   ├── build.sh            # Build Docker image
│   ├── set-secrets.sh      # Upload secrets to ROFL KMS
│   └── deploy.sh           # Deploy to ROFL
└── README.md               # This file
```

## Security Notes

- Secrets are stored in ROFL KMS (encrypted)
- Ledger data is sealed in TEE storage (`/data`)
- Facilitator private keys never leave TEE
- Remote attestation proves code integrity

## Attestation Verification

Buyers should verify TEE measurement before trusting:

```typescript
const attestation = await fetch("https://<rofl-instance>/attestation");
const { measurement } = await attestation.json();

// Verify measurement matches published code
const expectedMeasurement = "0x..."; // From GitHub
if (measurement !== expectedMeasurement) {
  throw new Error("TEE compromise detected");
}
```

## Troubleshooting

**Issue**: `oasis: command not found`  
**Solution**: Install Oasis CLI or add to PATH

**Issue**: Secrets upload fails  
**Solution**: Check Oasis account has testnet tokens

**Issue**: Docker build fails  
**Solution**: Ensure `npm ci --production` works in project root

**Issue**: TEE health check fails  
**Solution**: Check logs via `oasis rofl logs`

