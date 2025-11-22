#!/bin/bash

##############################################################################
# x402 Protocol - Complete Demo Runner (EXACT SCHEME)
#
# Demonstrates x402-exact: Synchronous settlement with EIP-3009
#
# This script:
# 1. Starts facilitator and seller servers
# 2. Waits for them to be ready
# 3. Runs the demo script with full logging
# 4. Captures all output
# 5. Stops servers
# 6. Displays results
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   x402 PROTOCOL - AUTOMATED DEMO${NC}"
echo -e "${BOLD}${CYAN}   SCHEME: x402-exact (Synchronous EIP-3009)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env from example.env and configure your wallets"
    exit 1
fi

# Stop any existing servers
echo -e "${YELLOW}Stopping any existing servers...${NC}"
npm run stop > /dev/null 2>&1

# Start servers
echo -e "${BLUE}Starting facilitator and seller servers...${NC}"
npm run start

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start servers${NC}"
    exit 1
fi

# Wait for servers to be ready
echo ""
echo -e "${YELLOW}Waiting for servers to be ready...${NC}"
sleep 3

# Check if servers are responding
echo -e "${YELLOW}Checking facilitator health...${NC}"
if ! curl -s http://localhost:4023/health > /dev/null 2>&1; then
    echo -e "${YELLOW}Facilitator might not have a health endpoint, continuing anyway...${NC}"
fi

echo -e "${YELLOW}Checking seller health...${NC}"
if ! curl -s http://localhost:4022/health > /dev/null 2>&1; then
    echo -e "${YELLOW}Seller might not have a health endpoint, continuing anyway...${NC}"
fi

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}   SERVERS READY - RUNNING DEMO${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Run demo and capture output
DEMO_LOG="logs/demo-exact-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

echo -e "${CYAN}Running x402-exact payment demo...${NC}"
echo -e "${CYAN}(Logging to: ${DEMO_LOG})${NC}"
echo ""

npm run demo:exact 2>&1 | tee "$DEMO_LOG"
DEMO_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"

if [ $DEMO_EXIT_CODE -eq 0 ]; then
    echo -e "${BOLD}${GREEN}   ✓ DEMO COMPLETED SUCCESSFULLY${NC}"
else
    echo -e "${BOLD}${RED}   ✗ DEMO FAILED${NC}"
fi

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Show results file if it exists
if [ -f "demo-results-exact.json" ]; then
    echo -e "${CYAN}Demo results saved to: demo-results-exact.json${NC}"
    echo ""
    
    # Pretty print key results
    if command -v jq &> /dev/null; then
        echo -e "${BOLD}Key Metrics:${NC}"
        echo -e "  Total Duration: ${GREEN}$(jq -r '.totalDuration' demo-results-exact.json)ms${NC}"
        echo -e "  Success: $(jq -r '.success' demo-results-exact.json)"
        if [ "$(jq -r '.transaction.hash' demo-results-exact.json)" != "null" ]; then
            echo ""
            echo -e "${BOLD}Transaction:${NC}"
            echo -e "  Hash: ${CYAN}$(jq -r '.transaction.hash' demo-results-exact.json)${NC}"
            echo -e "  Explorer: ${BLUE}$(jq -r '.transaction.explorerUrl' demo-results-exact.json)${NC}"
        fi
        echo ""
    fi
fi

# Show where logs are
echo -e "${CYAN}Logs available:${NC}"
echo -e "  Demo:        ${DEMO_LOG}"
echo -e "  Facilitator: logs/facilitator.log"
echo -e "  Seller:      logs/seller.log"
echo ""

# Ask if user wants to stop servers
echo -e "${YELLOW}Servers are still running.${NC}"
echo -e "  • View logs: tail -f logs/*.log"
echo -e "  • Stop servers: npm run stop"
echo ""

if [ "$1" == "--auto-stop" ]; then
    echo -e "${YELLOW}Auto-stopping servers (--auto-stop flag)...${NC}"
    npm run stop
fi

exit $DEMO_EXIT_CODE

