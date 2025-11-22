#!/bin/bash
# Deploy x402-tee-rofl-app to Oasis ROFL

set -e

cd "$(dirname "$0")/.."

echo "🚀 Deploying x402-tee-rofl-app to Oasis ROFL..."

# Step 1: Build ROFL bundle
echo ""
echo "Step 1: Building ROFL bundle from rofl.yaml..."
oasis rofl build

# Step 2: Deploy to ROFL
echo ""
echo "Step 2: Deploying to ROFL testnet..."
oasis rofl deploy --network testnet

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Get ROFL instance URL from deployment output"
echo "  2. Set ROFL_INSTANCE_URL in main facilitator .env"
echo "  3. Test: curl https://<rofl-instance>/health"
echo "  4. Test: curl https://<rofl-instance>/attestation"
