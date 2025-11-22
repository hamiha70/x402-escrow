#!/bin/bash
#
# Queue Multiple Payment Intents
# 
# Usage: ./scripts/queue-multiple-intents.sh [count] [chain]
#
# Examples:
#   ./scripts/queue-multiple-intents.sh 5 base-sepolia
#   INTENT_COUNT=10 ./scripts/queue-multiple-intents.sh

set -e

# Configuration
INTENT_COUNT=${1:-${INTENT_COUNT:-5}}
CHAIN=${2:-${CHAIN:-base-sepolia}}

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║           Queueing Multiple Payment Intents                     ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Configuration:"
echo "  Chain:  $CHAIN"
echo "  Count:  $INTENT_COUNT"
echo ""

# Check services are running
if ! curl -s http://localhost:4023/health > /dev/null; then
    echo "❌ Facilitator not running on port 4023"
    echo "Start services: npm run start"
    exit 1
fi

if ! curl -s http://localhost:4022/health > /dev/null; then
    echo "❌ Seller not running on port 4022"
    echo "Start services: npm run start"
    exit 1
fi

echo "✓ Services are running"
echo ""

# Check initial queue status
echo "Initial queue status:"
curl -s http://localhost:4023/queue | jq '.stats'
echo ""

# Queue intents
echo "Queueing $INTENT_COUNT payment intents..."
echo ""

for i in $(seq 1 $INTENT_COUNT); do
    echo -n "[$i/$INTENT_COUNT] "
    
    # Run buyer agent with escrow-deferred scheme
    CHAIN=$CHAIN SCHEME=x402-escrow-deferred npm run --silent buyer > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✓ Intent queued"
    else
        echo "✗ Failed"
    fi
    
    # Small delay to avoid overwhelming the servers
    sleep 0.2
done

echo ""
echo "Final queue status:"
curl -s http://localhost:4023/queue | jq '.stats'
echo ""

echo "View pending intents:"
echo "  curl http://localhost:4023/queue | jq '.pending'"
echo ""

echo "Trigger batch settlement:"
echo "  curl -X POST http://localhost:4023/settle-batch | jq"
echo ""

echo "✅ All intents queued!"

