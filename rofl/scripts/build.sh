#!/bin/bash
# Build ROFL Docker image

set -e

cd "$(dirname "$0")/.."

echo "🏗️  Building x402-tee-facilitator Docker image..."

docker build -t x402-tee-facilitator:latest .

echo "✅ Docker image built successfully"
echo ""
echo "Next steps:"
echo "  1. Test locally: docker run -p 4023:4023 x402-tee-facilitator:latest"
echo "  2. Build ROFL bundle: oasis rofl build"
echo "  3. Deploy to ROFL: ./scripts/deploy.sh"

