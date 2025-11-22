#!/bin/bash

##############################################################################
# Fund x402-escrow Wallets Script
# Transfers native tokens + USDC from funding wallet to all test wallets
# across all configured networks
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

# Check required variables
if [ -z "$FUNDING_WALLET_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: FUNDING_WALLET_PRIVATE_KEY not set in .env${NC}"
    exit 1
fi

if [ -z "$BUYER_WALLET_ADDRESS" ] || [ -z "$SELLER_WALLET_ADDRESS" ] || [ -z "$FACILITATOR_WALLET_ADDRESS" ]; then
    echo -e "${RED}Error: Wallet addresses not set in .env${NC}"
    exit 1
fi

# Foundry cast binary location
CAST="${HOME}/.foundry/bin/cast"

# Function to send native tokens
send_native() {
    local network_name=$1
    local rpc=$2
    local to_address=$3
    local amount=$4
    
    echo -e "${BLUE}Sending $amount to $to_address on $network_name...${NC}"
    
    tx_hash=$($CAST send "$to_address" \
        --rpc-url "$rpc" \
        --private-key "$FUNDING_WALLET_PRIVATE_KEY" \
        --value "$amount" \
        2>&1 | grep -i "transactionHash" | awk '{print $2}')
    
    if [ -n "$tx_hash" ]; then
        echo -e "${GREEN}✅ Sent $amount native tokens${NC}"
        echo "   TX: $tx_hash"
    else
        echo -e "${RED}❌ Failed to send native tokens${NC}"
    fi
}

# Function to send USDC
send_usdc() {
    local network_name=$1
    local rpc=$2
    local usdc_address=$3
    local to_address=$4
    local amount=$5  # in USDC (will be converted to 6 decimals)
    
    if [ -z "$usdc_address" ]; then
        echo -e "${YELLOW}⚠️  No USDC address configured for $network_name${NC}"
        return
    fi
    
    # Convert USDC to wei (6 decimals)
    local amount_wei=$(echo "$amount * 1000000" | bc)
    amount_wei=${amount_wei%.*}  # Remove decimal point
    
    echo -e "${BLUE}Sending $amount USDC to $to_address on $network_name...${NC}"
    
    tx_hash=$($CAST send "$usdc_address" "transfer(address,uint256)" "$to_address" "$amount_wei" \
        --rpc-url "$rpc" \
        --private-key "$FUNDING_WALLET_PRIVATE_KEY" \
        2>&1 | grep -i "transactionHash" | awk '{print $2}')
    
    if [ -n "$tx_hash" ]; then
        echo -e "${GREEN}✅ Sent $amount USDC${NC}"
        echo "   TX: $tx_hash"
    else
        echo -e "${RED}❌ Failed to send USDC${NC}"
    fi
}

# Function to fund a wallet on a specific network
fund_wallet_on_network() {
    local network_name=$1
    local rpc=$2
    local usdc_address=$3
    local wallet_name=$4
    local wallet_address=$5
    local native_amount=$6
    local usdc_amount=$7
    
    echo ""
    echo -e "${YELLOW}═══ Funding $wallet_name on $network_name ═══${NC}"
    
    # Send native tokens
    send_native "$network_name" "$rpc" "$wallet_address" "$native_amount"
    sleep 2
    
    # Send USDC
    if [ "$usdc_amount" != "0" ]; then
        send_usdc "$network_name" "$rpc" "$usdc_address" "$wallet_address" "$usdc_amount"
        sleep 2
    fi
}

# Function to fund all wallets on a network
fund_network() {
    local network_name=$1
    local rpc=$2
    local usdc_address=$3
    
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}          Funding $network_name${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════${NC}"
    
    # Fund Buyer (needs USDC for payments + ETH for approval)
    fund_wallet_on_network "$network_name" "$rpc" "$usdc_address" "BUYER" "$BUYER_WALLET_ADDRESS" "0.02ether" "10"
    
    # Fund Facilitator (needs ETH for transferFrom gas)
    fund_wallet_on_network "$network_name" "$rpc" "$usdc_address" "FACILITATOR" "$FACILITATOR_WALLET_ADDRESS" "0.02ether" "0"
    
    # Fund Seller (just needs small ETH, will receive USDC from payments)
    fund_wallet_on_network "$network_name" "$rpc" "$usdc_address" "SELLER" "$SELLER_WALLET_ADDRESS" "0.01ether" "0"
    
    echo -e "${GREEN}✅ $network_name funding complete${NC}"
}

# Main execution
clear
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         FUND ALL x402-ESCROW WALLETS${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "This script will fund buyer, seller, and facilitator wallets"
echo "across all configured networks from your funding wallet."
echo ""
echo "Funding Wallet: $FUNDING_WALLET_ADDRESS"
echo ""
echo "Target Wallets:"
echo "  • Buyer:       $BUYER_WALLET_ADDRESS"
echo "  • Seller:      $SELLER_WALLET_ADDRESS"
echo "  • Facilitator: $FACILITATOR_WALLET_ADDRESS"
echo ""
echo "Amounts per network:"
echo "  • Buyer:       0.02 ETH + 10 USDC"
echo "  • Facilitator: 0.02 ETH"
echo "  • Seller:      0.01 ETH"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

# Fund all networks
if [ -n "$BASE_SEPOLIA_RPC" ]; then
    fund_network "Base Sepolia" "$BASE_SEPOLIA_RPC" "$USDC_BASE_SEPOLIA"
fi

if [ -n "$ETHEREUM_SEPOLIA_RPC" ]; then
    fund_network "Ethereum Sepolia" "$ETHEREUM_SEPOLIA_RPC" "$USDC_SEPOLIA"
fi

if [ -n "$ARBITRUM_SEPOLIA_RPC" ]; then
    fund_network "Arbitrum Sepolia" "$ARBITRUM_SEPOLIA_RPC" "$USDC_ARBITRUM_SEPOLIA"
fi

if [ -n "$OPTIMISM_SEPOLIA_RPC" ]; then
    fund_network "Optimism Sepolia" "$OPTIMISM_SEPOLIA_RPC" "$USDC_OPTIMISM_SEPOLIA"
fi

if [ -n "$POLYGON_AMOY_RPC" ]; then
    fund_network "Polygon Amoy" "$POLYGON_AMOY_RPC" "$USDC_POLYGON_AMOY"
fi

if [ -n "$ARC_TESTNET_RPC" ]; then
    fund_network "Arc Testnet" "$ARC_TESTNET_RPC" "$USDC_ARC_TESTNET"
fi

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}              ALL NETWORKS FUNDED${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Run: npm run balances  (verify funds arrived)"
echo "  2. Run: npm run approve   (buyer approves facilitator)"
echo "  3. Start services and test payment flow"
echo ""

