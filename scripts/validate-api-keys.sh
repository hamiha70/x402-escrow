#!/bin/bash

# Validate Etherscan API Keys for Multi-Chain Deployment
# This script tests if your API keys work for each target chain

source .env

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║           Validating Block Explorer API Keys                    ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TOTAL=0
PASSED=0
FAILED=0

# Function to test API key
test_api_key() {
    local CHAIN_NAME=$1
    local API_KEY=$2
    local API_URL=$3
    local CHAIN_ID=$4
    
    TOTAL=$((TOTAL + 1))
    
    echo -n "Testing ${CHAIN_NAME}... "
    
    # Check if API key is set
    if [ -z "$API_KEY" ]; then
        echo -e "${RED}FAILED${NC} (API key not set)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Make a test API call (get contract ABI for a known verified contract)
    # Using a simple API call to check if key is valid
    RESPONSE=$(curl -s "${API_URL}?module=contract&action=getabi&address=0x0000000000000000000000000000000000000000&apikey=${API_KEY}")
    
    # First, check for explicit "Invalid API Key" error
    if echo "$RESPONSE" | grep -qi "Invalid API Key"; then
        echo -e "${RED}FAILED${NC} (Invalid API key)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Check if response contains "status" field (indicates API responded)
    if echo "$RESPONSE" | grep -q '"status"'; then
        STATUS=$(echo "$RESPONSE" | jq -r '.status' 2>/dev/null)
        RESULT=$(echo "$RESPONSE" | jq -r '.result' 2>/dev/null)
        
        # Check if result contains "deprecated" - this means the key is valid but using V1 API
        if echo "$RESULT" | grep -qi "deprecated"; then
            echo -e "${GREEN}PASSED${NC} (API key valid, V1 endpoint)"
            PASSED=$((PASSED + 1))
            return 0
        fi
        
        if [ "$STATUS" = "1" ]; then
            # Status 1 = OK
            echo -e "${GREEN}PASSED${NC} (API key valid)"
            PASSED=$((PASSED + 1))
            return 0
        elif [ "$STATUS" = "0" ]; then
            # Status 0 = NOTOK, check the result
            
            # "Contract source code not verified" means API key works, just no contract
            if echo "$RESULT" | grep -qi "not verified"; then
                echo -e "${GREEN}PASSED${NC} (API key valid)"
                PASSED=$((PASSED + 1))
                return 0
            else
                echo -e "${RED}FAILED${NC} (${RESULT})"
                FAILED=$((FAILED + 1))
                return 1
            fi
        else
            echo -e "${YELLOW}UNKNOWN${NC} (Unexpected status: $STATUS)"
            return 2
        fi
    else
        # No valid JSON response
        echo -e "${RED}FAILED${NC} (No valid response from API)"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════════"
echo "Testing Etherscan Family (should all use ETHERSCAN_API_KEY)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test Etherscan API key on multiple chains
test_api_key "Ethereum Sepolia" "$ETHERSCAN_API_KEY" "https://api-sepolia.etherscan.io/api" "11155111"
test_api_key "Base Sepolia" "$ETHERSCAN_API_KEY" "https://api-sepolia.basescan.org/api" "84532"
test_api_key "Arbitrum Sepolia" "$ETHERSCAN_API_KEY" "https://api-sepolia.arbiscan.io/api" "421614"
test_api_key "Optimism Sepolia" "$ETHERSCAN_API_KEY" "https://api-sepolia-optimistic.etherscan.io/api" "11155420"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Testing PolygonScan (separate family)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

test_api_key "Polygon Amoy" "$POLYGONSCAN_API_KEY" "https://api-amoy.polygonscan.com/api" "80002"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Results Summary"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Total chains tested: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All API keys are valid! Ready to deploy.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Deploy to Polygon Amoy:"
    echo "     forge script script/DeployVault.s.sol --rpc-url polygon_amoy --broadcast --verify"
    echo ""
    echo "  2. Deploy to remaining chains (Arbitrum, Optimism, Ethereum Sepolia)"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some API keys are invalid. Please check your .env file.${NC}"
    echo ""
    echo "To fix:"
    echo "  1. ETHERSCAN_API_KEY: Get from https://etherscan.io/myapikey"
    echo "  2. POLYGONSCAN_API_KEY: Get from https://polygonscan.com/myapikey"
    echo ""
    exit 1
fi

