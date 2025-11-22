#!/bin/bash

##############################################################################
# Stop All x402 Servers
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Stopping x402-escrow services...${NC}"
echo ""

# Stop by PID files
if [ -f .pids/facilitator.pid ]; then
    PID=$(cat .pids/facilitator.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID
        echo "✓ Stopped Facilitator (PID: $PID)"
    fi
    rm .pids/facilitator.pid
fi

if [ -f .pids/seller.pid ]; then
    PID=$(cat .pids/seller.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID
        echo "✓ Stopped Seller (PID: $PID)"
    fi
    rm .pids/seller.pid
fi

# Fallback: kill by process name
pkill -f "tsx facilitator/server.ts" 2>/dev/null && echo "✓ Killed any remaining facilitator processes"
pkill -f "tsx seller/server.ts" 2>/dev/null && echo "✓ Killed any remaining seller processes"

# Clean up PID directory if empty
rmdir .pids 2>/dev/null

echo ""
echo -e "${GREEN}All services stopped${NC}"

