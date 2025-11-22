#!/bin/bash

##############################################################################
# Start All x402 Servers
# Runs facilitator, seller in background with logging
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$PROJECT_ROOT"

# Create logs and pids directories
mkdir -p logs
mkdir -p .pids

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         Starting x402-escrow Services${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Stop any existing servers
bash scripts/stop_servers.sh 2>/dev/null

# Start Facilitator (port 4023)
echo -e "${BLUE}Starting Facilitator (port 4023)...${NC}"
npx tsx facilitator/server.ts > logs/facilitator.log 2>&1 &
FACILITATOR_PID=$!
echo $FACILITATOR_PID > .pids/facilitator.pid
echo "  PID: $FACILITATOR_PID"
echo "  Log: logs/facilitator.log"

# Wait for facilitator to start
sleep 2
if ! kill -0 $FACILITATOR_PID 2>/dev/null; then
    echo -e "${RED}❌ Facilitator failed to start${NC}"
    cat logs/facilitator.log
    exit 1
fi

# Start Seller (port 4022)
echo -e "${BLUE}Starting Seller (port 4022)...${NC}"
npx tsx seller/server.ts > logs/seller.log 2>&1 &
SELLER_PID=$!
echo $SELLER_PID > .pids/seller.pid
echo "  PID: $SELLER_PID"
echo "  Log: logs/seller.log"

# Wait for seller to start
sleep 2
if ! kill -0 $SELLER_PID 2>/dev/null; then
    echo -e "${RED}❌ Seller failed to start${NC}"
    cat logs/seller.log
    bash scripts/stop_servers.sh
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         All Services Running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Services:"
echo "  • Facilitator: http://localhost:4023 (PID: $FACILITATOR_PID)"
echo "  • Seller:      http://localhost:4022 (PID: $SELLER_PID)"
echo ""
echo "Logs:"
echo "  • tail -f logs/facilitator.log"
echo "  • tail -f logs/seller.log"
echo "  • tail -f logs/*.log  (all logs)"
echo ""
echo "Next steps:"
echo "  • Run buyer:  npm run buyer"
echo "  • Run E2E:    npm run test:e2e"
echo "  • Stop all:   npm run stop"
echo ""

