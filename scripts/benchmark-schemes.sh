#!/bin/bash

# Benchmark script to compare x402-exact vs x402-escrow-deferred schemes
# Measures latency, throughput, and gas costs

set -e
source .env

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
CHAIN=${CHAIN:-base-sepolia}
ITERATIONS=${ITERATIONS:-5}
BENCHMARK_OUTPUT="benchmark-results-$(date +%Y%m%d-%H%M%S).json"

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║           x402 Scheme Benchmark: exact vs escrow-deferred       ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Configuration:"
echo "  Chain:      $CHAIN"
echo "  Iterations: $ITERATIONS per scheme"
echo ""

# Check if services are running
if ! curl -s http://localhost:4023/health > /dev/null; then
    echo -e "${RED}❌ Services not running. Please start with: npm run start${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Services are running${NC}"
echo ""

# Initialize results
EXACT_TOTAL=0
DEFERRED_TOTAL=0
EXACT_TIMES=()
DEFERRED_TIMES=()

echo "═══════════════════════════════════════════════════════════════════"
echo "Phase 1: Testing x402-exact scheme"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

for i in $(seq 1 $ITERATIONS); do
    echo -n "[$i/$ITERATIONS] Running exact payment... "
    
    START=$(date +%s%3N)
    RESULT=$(CHAIN=$CHAIN SCHEME=x402-exact npm run --silent buyer 2>&1)
    END=$(date +%s%3N)
    DURATION=$((END - START))
    
    if echo "$RESULT" | grep -q "SUCCESS"; then
        EXACT_TIMES+=($DURATION)
        EXACT_TOTAL=$((EXACT_TOTAL + DURATION))
        echo -e "${GREEN}✓ ${DURATION}ms${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    sleep 1 # Small delay between requests
done

echo ""
EXACT_AVG=$((EXACT_TOTAL / ITERATIONS))
echo "x402-exact average: ${EXACT_AVG}ms"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "Phase 2: Testing x402-escrow-deferred scheme"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

for i in $(seq 1 $ITERATIONS); do
    echo -n "[$i/$ITERATIONS] Running deferred payment... "
    
    START=$(date +%s%3N)
    RESULT=$(CHAIN=$CHAIN SCHEME=x402-escrow-deferred npm run --silent buyer 2>&1)
    END=$(date +%s%3N)
    DURATION=$((END - START))
    
    if echo "$RESULT" | grep -q "SUCCESS"; then
        DEFERRED_TIMES+=($DURATION)
        DEFERRED_TOTAL=$((DEFERRED_TOTAL + DURATION))
        echo -e "${GREEN}✓ ${DURATION}ms${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    sleep 1
done

echo ""
DEFERRED_AVG=$((DEFERRED_TOTAL / ITERATIONS))
echo "x402-escrow-deferred average: ${DEFERRED_AVG}ms"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "Phase 3: Batch Settlement (for deferred payments)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check queue before settlement
QUEUE_BEFORE=$(curl -s http://localhost:4023/queue | jq -r '.stats.pending')
echo "Pending intents: $QUEUE_BEFORE"
echo ""

if [ "$QUEUE_BEFORE" -gt 0 ]; then
    echo "Triggering batch settlement..."
    START=$(date +%s%3N)
    SETTLE_RESULT=$(curl -s -X POST http://localhost:4023/settle-batch)
    END=$(date +%s%3N)
    SETTLE_DURATION=$((END - START))
    
    SETTLED_COUNT=$(echo "$SETTLE_RESULT" | jq -r '.intentsSettled')
    echo ""
    echo "Settlement complete:"
    echo "  Intents settled: $SETTLED_COUNT"
    echo "  Time taken: ${SETTLE_DURATION}ms"
    echo "  Per-intent: $((SETTLE_DURATION / SETTLED_COUNT))ms"
    echo ""
else
    echo "No pending intents to settle"
    SETTLE_DURATION=0
    SETTLED_COUNT=0
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "Results Summary"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

SPEEDUP=$((100 * (EXACT_AVG - DEFERRED_AVG) / EXACT_AVG))

echo -e "${BLUE}Latency (end-user experience):${NC}"
echo "  x402-exact:          ${EXACT_AVG}ms"
echo "  x402-escrow-deferred: ${DEFERRED_AVG}ms"
echo "  Improvement:         ${SPEEDUP}% faster"
echo ""

if [ "$SETTLED_COUNT" -gt 0 ]; then
    AMORTIZED_DEFERRED=$(((DEFERRED_TOTAL + SETTLE_DURATION) / ITERATIONS))
    echo -e "${BLUE}Total Cost (including settlement):${NC}"
    echo "  x402-exact (per tx):           ${EXACT_AVG}ms"
    echo "  x402-escrow-deferred (amortized): ${AMORTIZED_DEFERRED}ms"
    echo "  Settlement overhead:           $((SETTLE_DURATION / SETTLED_COUNT))ms per tx"
    echo ""
fi

echo -e "${BLUE}Throughput:${NC}"
EXACT_TPS=$(awk "BEGIN {printf \"%.2f\", 1000 / $EXACT_AVG}")
DEFERRED_TPS=$(awk "BEGIN {printf \"%.2f\", 1000 / $DEFERRED_AVG}")
echo "  x402-exact:          ${EXACT_TPS} tx/sec"
echo "  x402-escrow-deferred: ${DEFERRED_TPS} tx/sec"
echo ""

# Save results to JSON
cat > "$BENCHMARK_OUTPUT" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "chain": "$CHAIN",
  "iterations": $ITERATIONS,
  "results": {
    "exact": {
      "avgLatencyMs": $EXACT_AVG,
      "totalMs": $EXACT_TOTAL,
      "throughputTps": $EXACT_TPS,
      "measurements": [$(IFS=,; echo "${EXACT_TIMES[*]}")]
    },
    "escrowDeferred": {
      "avgLatencyMs": $DEFERRED_AVG,
      "totalMs": $DEFERRED_TOTAL,
      "throughputTps": $DEFERRED_TPS,
      "measurements": [$(IFS=,; echo "${DEFERRED_TIMES[*]}")]
    },
    "batchSettlement": {
      "durationMs": $SETTLE_DURATION,
      "intentsSettled": $SETTLED_COUNT,
      "perIntentMs": $((SETTLE_DURATION / (SETTLED_COUNT > 0 ? SETTLED_COUNT : 1)))
    }
  },
  "analysis": {
    "latencyImprovementPercent": $SPEEDUP,
    "deferredFasterBy": "$((EXACT_AVG - DEFERRED_AVG))ms"
  }
}
EOF

echo "Results saved to: $BENCHMARK_OUTPUT"
echo ""
echo -e "${GREEN}✅ Benchmark complete!${NC}"

