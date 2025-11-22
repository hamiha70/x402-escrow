#!/bin/bash

##############################################################################
# x402 Protocol - Multi-Chain Demo Runner (EXACT SCHEME)
#
# Usage: ./scripts/run_demo_exact.sh [CHAIN]
#
# CHAIN options:
#   base-sepolia     (default)
#   arbitrum-sepolia
#   optimism-sepolia
#   polygon-amoy
#   arc
#   ethereum-sepolia
#
# Examples:
#   ./scripts/run_demo_exact.sh
#   ./scripts/run_demo_exact.sh polygon-amoy
#   ./scripts/run_demo_exact.sh arc
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

# Parse arguments
CHAIN="${1:-base-sepolia}"

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$PROJECT_ROOT"

# Chain configuration
declare -A CHAIN_NAMES=(
    ["base-sepolia"]="Base Sepolia"
    ["arbitrum-sepolia"]="Arbitrum Sepolia"
    ["optimism-sepolia"]="Optimism Sepolia"
    ["polygon-amoy"]="Polygon Amoy"
    ["arc"]="Arc Testnet"
    ["ethereum-sepolia"]="Ethereum Sepolia"
)

# Validate chain
if [ -z "${CHAIN_NAMES[$CHAIN]}" ]; then
    echo -e "${RED}Error: Unknown chain '$CHAIN'${NC}"
    echo ""
    echo "Available chains:"
    for chain in "${!CHAIN_NAMES[@]}"; do
        echo "  • $chain"
    done
    exit 1
fi

CHAIN_NAME="${CHAIN_NAMES[$CHAIN]}"

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   x402 PROTOCOL - MULTI-CHAIN DEMO${NC}"
echo -e "${BOLD}${CYAN}   SCHEME: x402-exact (Synchronous EIP-3009)${NC}"
echo -e "${BOLD}${MAGENTA}   CHAIN: ${CHAIN_NAME}${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env from example.env and configure your wallets"
    exit 1
fi

# Ensure servers are running
if ! pgrep -f "facilitator/server.ts" > /dev/null || ! pgrep -f "seller/server.ts" > /dev/null; then
    echo -e "${YELLOW}Starting servers...${NC}"
    npm run start
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to start servers${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Waiting for servers to be ready...${NC}"
    sleep 3
    echo ""
fi

echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}   RUNNING DEMO ON ${CHAIN_NAME}${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Run demo with CHAIN environment variable
DEMO_LOG="logs/demo-exact-${CHAIN}-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

echo -e "${CYAN}Running x402-exact payment demo on ${CHAIN_NAME}...${NC}"
echo -e "${CYAN}(Logging to: ${DEMO_LOG})${NC}"
echo ""

# Export CHAIN and run demo
export CHAIN="$CHAIN"
npm run demo:exact 2>&1 | tee "$DEMO_LOG"
DEMO_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"

if [ $DEMO_EXIT_CODE -eq 0 ]; then
    echo -e "${BOLD}${GREEN}   ✓ DEMO COMPLETED SUCCESSFULLY ON ${CHAIN_NAME}${NC}"
else
    echo -e "${BOLD}${RED}   ✗ DEMO FAILED ON ${CHAIN_NAME}${NC}"
fi

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Show results file if it exists
if [ -f "demo-results-exact.json" ]; then
    # Rename to chain-specific file
    RESULTS_FILE="demo-results-exact-${CHAIN}.json"
    mv demo-results-exact.json "$RESULTS_FILE"
    
    echo -e "${CYAN}Demo results saved to: ${RESULTS_FILE}${NC}"
    echo ""
    
    # Pretty print key results
    if command -v jq &> /dev/null; then
        echo -e "${BOLD}Key Metrics:${NC}"
        echo -e "  Chain:          ${MAGENTA}${CHAIN_NAME}${NC}"
        echo -e "  Total Duration: ${GREEN}$(jq -r '.totalDuration' "$RESULTS_FILE")ms${NC}"
        echo -e "  Success:        $(jq -r '.success' "$RESULTS_FILE")"
        if [ "$(jq -r '.transaction.hash' "$RESULTS_FILE")" != "null" ]; then
            echo ""
            echo -e "${BOLD}Transaction:${NC}"
            echo -e "  Hash:     ${CYAN}$(jq -r '.transaction.hash' "$RESULTS_FILE")${NC}"
            echo -e "  Explorer: ${BLUE}$(jq -r '.transaction.explorerUrl' "$RESULTS_FILE")${NC}"
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

echo -e "${YELLOW}Servers are still running (multi-chain capable).${NC}"
echo -e "  • Run another chain: ./scripts/run_demo_exact.sh polygon-amoy"
echo -e "  • View logs: tail -f logs/*.log"
echo -e "  • Stop servers: npm run stop"
echo ""

exit $DEMO_EXIT_CODE
