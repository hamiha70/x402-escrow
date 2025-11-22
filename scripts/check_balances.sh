#!/bin/bash

##############################################################################
# Balance Checker Script for x402-escrow
# Checks native token (ETH/POL) and USDC balances across all networks
##############################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    source "$SCRIPT_DIR/.env"
else
    echo -e "${RED}Error: .env file not found in $SCRIPT_DIR${NC}"
    exit 1
fi

# Function to convert hex to decimal and format USDC
format_usdc() {
    local hex_value=$1
    # Remove 0x prefix if present
    hex_value=${hex_value#0x}
    # Convert to decimal
    local dec_value=$(printf "%d" "0x$hex_value" 2>/dev/null || echo "0")
    # Convert to USDC (6 decimals)
    local usdc=$(echo "scale=2; $dec_value / 1000000" | bc -l 2>/dev/null || echo "0.00")
    echo "$usdc"
}

# Foundry cast binary location
CAST="${HOME}/.foundry/bin/cast"

# Function to check balance with error handling
check_native_balance() {
    local address=$1
    local rpc=$2
    local balance=$($CAST balance "$address" --rpc-url "$rpc" --ether 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "$balance"
    else
        echo "ERROR"
    fi
}

# Function to check USDC balance
check_usdc_balance() {
    local address=$1
    local usdc_address=$2
    local rpc=$3
    if [ -z "$usdc_address" ]; then
        echo "N/A"
        return
    fi
    # Get balance as decimal (cast returns decimal by default, e.g. "10000000 [1e7]")
    local result=$($CAST call "$usdc_address" "balanceOf(address)(uint256)" "$address" --rpc-url "$rpc" 2>/dev/null | awk '{print $1}')
    if [ $? -eq 0 ] && [ -n "$result" ]; then
        # Result is already decimal, just divide by 1e6
        local usdc=$(echo "scale=2; $result / 1000000" | bc -l 2>/dev/null || echo "0.00")
        echo "$usdc"
    else
        echo "ERROR"
    fi
}

# Function to display wallet balances
check_wallet() {
    local wallet_name=$1
    local wallet_address=$2
    
    if [ -z "$wallet_address" ] || [ "$wallet_address" = "your_wallet_address" ]; then
        return
    fi
    
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}$wallet_name${NC}"
    echo -e "${YELLOW}Address: $wallet_address${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Ethereum Sepolia
    echo -e "🔵 ETHEREUM SEPOLIA"
    if [ -n "$ETHEREUM_SEPOLIA_RPC" ]; then
        native=$(check_native_balance "$wallet_address" "$ETHEREUM_SEPOLIA_RPC")
        usdc=$(check_usdc_balance "$wallet_address" "$USDC_SEPOLIA" "$ETHEREUM_SEPOLIA_RPC")
        printf "   Native (ETH):  %s\n" "$native"
        printf "   USDC:          %s\n" "$usdc"
        echo "   Explorer: https://sepolia.etherscan.io/address/$wallet_address"
    else
        echo "   RPC not configured"
    fi
    echo ""
    
    # Base Sepolia
    echo -e "${BLUE}🔵 BASE SEPOLIA${NC}"
    if [ -n "$BASE_SEPOLIA_RPC" ]; then
        native=$(check_native_balance "$wallet_address" "$BASE_SEPOLIA_RPC")
        usdc=$(check_usdc_balance "$wallet_address" "$USDC_BASE_SEPOLIA" "$BASE_SEPOLIA_RPC")
        printf "   Native (ETH):  %s\n" "$native"
        printf "   USDC:          %s\n" "$usdc"
        echo "   Explorer: https://sepolia.basescan.org/address/$wallet_address"
    else
        echo "   RPC not configured"
    fi
    echo ""
    
    # Arbitrum Sepolia
    echo -e "🔴 ARBITRUM SEPOLIA"
    if [ -n "$ARBITRUM_SEPOLIA_RPC" ]; then
        native=$(check_native_balance "$wallet_address" "$ARBITRUM_SEPOLIA_RPC")
        usdc=$(check_usdc_balance "$wallet_address" "$USDC_ARBITRUM_SEPOLIA" "$ARBITRUM_SEPOLIA_RPC")
        printf "   Native (ETH):  %s\n" "$native"
        printf "   USDC:          %s\n" "$usdc"
        echo "   Explorer: https://sepolia.arbiscan.io/address/$wallet_address"
    else
        echo "   RPC not configured"
    fi
    echo ""
    
    # Optimism Sepolia
    echo -e "🔴 OPTIMISM SEPOLIA"
    if [ -n "$OPTIMISM_SEPOLIA_RPC" ]; then
        native=$(check_native_balance "$wallet_address" "$OPTIMISM_SEPOLIA_RPC")
        usdc=$(check_usdc_balance "$wallet_address" "$USDC_OPTIMISM_SEPOLIA" "$OPTIMISM_SEPOLIA_RPC")
        printf "   Native (ETH):  %s\n" "$native"
        printf "   USDC:          %s\n" "$usdc"
        echo "   Explorer: https://sepolia-optimism.etherscan.io/address/$wallet_address"
    else
        echo "   RPC not configured"
    fi
    echo ""
    
    # Polygon Amoy
    echo -e "${PURPLE}🟣 POLYGON AMOY${NC}"
    if [ -n "$POLYGON_AMOY_RPC" ]; then
        native=$(check_native_balance "$wallet_address" "$POLYGON_AMOY_RPC")
        usdc=$(check_usdc_balance "$wallet_address" "$USDC_POLYGON_AMOY" "$POLYGON_AMOY_RPC")
        printf "   Native (POL):  %s\n" "$native"
        printf "   USDC:          %s\n" "$usdc"
        echo "   Explorer: https://amoy.polygonscan.com/address/$wallet_address"
    else
        echo "   RPC not configured"
    fi
    echo ""
    
    # Arc Testnet
    echo -e "⚪ ARC TESTNET"
    if [ -n "$ARC_TESTNET_RPC" ]; then
        native=$(check_native_balance "$wallet_address" "$ARC_TESTNET_RPC")
        usdc=$(check_usdc_balance "$wallet_address" "$USDC_ARC_TESTNET" "$ARC_TESTNET_RPC")
        printf "   Native (ETH):  %s\n" "$native"
        printf "   USDC:          %s\n" "$usdc"
        echo "   Explorer: https://explorer.arc-testnet.circlechain.xyz/address/$wallet_address"
    else
        echo "   RPC not configured"
    fi
}

# Main execution
clear
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}       x402-ESCROW WALLET BALANCES - ALL NETWORKS${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Checking balances across 6 testnets..."
echo ""

# Check all wallets
check_wallet "💰 FUNDING WALLET" "$FUNDING_WALLET_ADDRESS"
check_wallet "👤 BUYER WALLET" "$BUYER_WALLET_ADDRESS"
check_wallet "🏪 SELLER WALLET" "$SELLER_WALLET_ADDRESS"
check_wallet "🔐 FACILITATOR WALLET" "$FACILITATOR_WALLET_ADDRESS"

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}              BALANCE CHECK COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "💡 For x402 testing you need:"
echo "  • BUYER: USDC balance + ETH for approval tx"
echo "  • SELLER: Just needs to receive USDC"
echo "  • FACILITATOR: ETH for executing transferFrom"
echo ""
echo "🔗 Get testnet tokens:"
echo "  • Run: npm run fund  (automated multi-chain funding)"
echo "  • Or use faucets manually (see README.md)"
echo ""

