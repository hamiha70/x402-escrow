#!/bin/bash

##############################################################################
# x402 Protocol - Multi-Chain Demo Runner (EXACT SCHEME)
#
# Usage: ./scripts/run_demo_exact.sh [CHAIN] [OPTIONS]
#
# CHAIN options:
#   base-sepolia     (default)
#   arbitrum-sepolia
#   optimism-sepolia
#   polygon-amoy
#   arc
#   ethereum-sepolia
#
# OPTIONS:
#   --auto-stop      Stop servers after demo completes
#
# Examples:
#   ./scripts/run_demo_exact.sh
#   ./scripts/run_demo_exact.sh polygon-amoy
#   ./scripts/run_demo_exact.sh arc --auto-stop
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
AUTO_STOP=false

for arg in "$@"; do
    if [ "$arg" == "--auto-stop" ]; then
        AUTO_STOP=true
    fi
done

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

declare -A CHAIN_IDS=(
    ["base-sepolia"]="84532"
    ["arbitrum-sepolia"]="421614"
    ["optimism-sepolia"]="11155420"
    ["polygon-amoy"]="80002"
    ["arc"]="1243"
    ["ethereum-sepolia"]="11155111"
)

declare -A CHAIN_RPC_VARS=(
    ["base-sepolia"]="BASE_SEPOLIA_RPC"
    ["arbitrum-sepolia"]="ARBITRUM_SEPOLIA_RPC"
    ["optimism-sepolia"]="OPTIMISM_SEPOLIA_RPC"
    ["polygon-amoy"]="POLYGON_AMOY_RPC"
    ["arc"]="ARC_TESTNET_RPC"
    ["ethereum-sepolia"]="ETHEREUM_SEPOLIA_RPC"
)

declare -A CHAIN_USDC_VARS=(
    ["base-sepolia"]="USDC_BASE_SEPOLIA"
    ["arbitrum-sepolia"]="USDC_ARBITRUM_SEPOLIA"
    ["optimism-sepolia"]="USDC_OPTIMISM_SEPOLIA"
    ["polygon-amoy"]="USDC_POLYGON_AMOY"
    ["arc"]="USDC_ARC_TESTNET"
    ["ethereum-sepolia"]="USDC_ETHEREUM_SEPOLIA"
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
CHAIN_ID="${CHAIN_IDS[$CHAIN]}"

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   x402 PROTOCOL - MULTI-CHAIN DEMO${NC}"
echo -e "${BOLD}${CYAN}   SCHEME: x402-exact (Synchronous EIP-3009)${NC}"
echo -e "${BOLD}${MAGENTA}   CHAIN: ${CHAIN_NAME} (${CHAIN_ID})${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env from example.env and configure your wallets"
    exit 1
fi

# Load environment
source .env

# Validate chain configuration
RPC_VAR="${CHAIN_RPC_VARS[$CHAIN]}"
USDC_VAR="${CHAIN_USDC_VARS[$CHAIN]}"

if [ -z "${!RPC_VAR}" ]; then
    echo -e "${RED}Error: RPC endpoint not configured for ${CHAIN_NAME}${NC}"
    echo "Please set ${RPC_VAR} in your .env file"
    exit 1
fi

if [ -z "${!USDC_VAR}" ]; then
    echo -e "${RED}Error: USDC address not configured for ${CHAIN_NAME}${NC}"
    echo "Please set ${USDC_VAR} in your .env file"
    exit 1
fi

echo -e "${BLUE}Chain Configuration:${NC}"
echo -e "  Network:    ${CHAIN_NAME}"
echo -e "  Chain ID:   ${CHAIN_ID}"
echo -e "  RPC:        ${!RPC_VAR}"
echo -e "  USDC:       ${!USDC_VAR}"
echo ""

# Create temporary env override for this chain
TEMP_ENV=".env.chain-$CHAIN"
cp .env "$TEMP_ENV"

# Override chain-specific variables
echo "" >> "$TEMP_ENV"
echo "# Temporary chain override for $CHAIN_NAME" >> "$TEMP_ENV"
echo "CHAIN_ID=$CHAIN_ID" >> "$TEMP_ENV"
echo "RPC_URL=${!RPC_VAR}" >> "$TEMP_ENV"
echo "USDC_ADDRESS=${!USDC_VAR}" >> "$TEMP_ENV"

# Export for child processes
export CHAIN_ID
export RPC_URL="${!RPC_VAR}"
export USDC_ADDRESS="${!USDC_VAR}"

# Stop any existing servers
echo -e "${YELLOW}Stopping any existing servers...${NC}"
npm run stop > /dev/null 2>&1

# Start servers with chain-specific config
echo -e "${BLUE}Starting facilitator and seller servers for ${CHAIN_NAME}...${NC}"
npm run start

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start servers${NC}"
    rm -f "$TEMP_ENV"
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
echo -e "${BOLD}${GREEN}   SERVERS READY - RUNNING DEMO ON ${CHAIN_NAME}${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Run demo and capture output
DEMO_LOG="logs/demo-exact-${CHAIN}-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

echo -e "${CYAN}Running x402-exact payment demo on ${CHAIN_NAME}...${NC}"
echo -e "${CYAN}(Logging to: ${DEMO_LOG})${NC}"
echo ""

# Run demo with chain-specific env
DOTENV_CONFIG_PATH="$TEMP_ENV" npm run demo:exact 2>&1 | tee "$DEMO_LOG"
DEMO_EXIT_CODE=${PIPESTATUS[0]}

# Clean up temp env
rm -f "$TEMP_ENV"

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

# Handle auto-stop or prompt
if [ "$AUTO_STOP" = true ]; then
    echo -e "${YELLOW}Auto-stopping servers (--auto-stop flag)...${NC}"
    npm run stop
    echo ""
else
    echo -e "${YELLOW}Servers are still running.${NC}"
    echo -e "  • View logs: tail -f logs/*.log"
    echo -e "  • Stop servers: npm run stop"
    echo ""
fi

exit $DEMO_EXIT_CODE
