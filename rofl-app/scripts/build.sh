#!/bin/bash
# Build ROFL app Docker image

set -e

cd "$(dirname "$0")/.."

echo "🏗️  Building x402-tee-rofl-app..."
echo "Building from: $(pwd)"

# Build Docker image
docker build -t x402-tee-rofl-app:latest .

echo "✅ Docker image built successfully"
echo ""
echo "Next steps:"
echo "  1. Test locally: docker run -p 8080:8080 x402-tee-rofl-app:latest"
echo "  2. Set secrets: ./scripts/set-secrets.sh"
echo "  3. Deploy to ROFL: ./scripts/deploy.sh"
