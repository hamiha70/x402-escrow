#!/bin/bash
# Deploy x402 TEE ROFL app to Oasis

set -e

cd "$(dirname "$0")/.."

echo "🚀 Deploying x402 TEE ROFL app to Oasis..."

# Deploy to ROFL marketplace
oasis rofl deploy --network testnet

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Get ROFL instance URL from deployment output"
echo "  2. Test health: curl https://<rofl-instance>/health"
echo "  3. Get attestation: curl https://<rofl-instance>/attestation"
echo "  4. Update facilitator with ROFL_INSTANCE_URL in .env"
echo "  5. Run e2e test"

