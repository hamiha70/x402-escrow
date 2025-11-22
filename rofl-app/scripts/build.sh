#!/bin/bash
# Build ROFL app (TypeScript → JavaScript → Docker → ROFL bundle)

set -e

cd "$(dirname "$0")/.."

echo "🏗️  Building x402 TEE ROFL app..."

# Step 1: Build TypeScript
echo ""
echo "Step 1: Compiling TypeScript..."
npm run build

# Step 2: Build Docker image
echo ""
echo "Step 2: Building Docker image..."
docker build -t x402-tee-rofl:latest .

# Step 3: Build ROFL bundle
echo ""
echo "Step 3: Building ROFL bundle..."
oasis rofl build

echo ""
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "  1. Set secrets: ./scripts/set-secrets.sh"
echo "  2. Deploy to ROFL: ./scripts/deploy.sh"

