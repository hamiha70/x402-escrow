#!/bin/bash
# Deploy x402-tee-facilitator to Oasis ROFL

set -e

cd "$(dirname "$0")/.."

echo "🚀 Deploying x402-tee-facilitator to Oasis ROFL..."

# Step 1: Build ROFL bundle
echo ""
echo "Step 1: Building ROFL bundle..."
oasis rofl build

# Step 2: Deploy to ROFL marketplace
echo ""
echo "Step 2: Deploying to ROFL..."
oasis rofl deploy --network testnet

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Get attestation: curl https://<rofl-instance>/attestation"
echo "  2. Test health: curl https://<rofl-instance>/health"
echo "  3. Query balance: curl https://<rofl-instance>/balance/0x..."
echo "  4. Update seller with TEE facilitator URL"

