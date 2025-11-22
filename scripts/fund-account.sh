#!/bin/bash

# Interactive script to fund accounts across chains
# Supports native tokens and USDC transfers

set -e

source .env

# Add Foundry to PATH
export PATH="$HOME/.foundry/bin:$PATH"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Chain configurations
declare -A CHAIN_NAMES=(
    ["1"]="ethereum-sepolia"
    ["2"]="base-sepolia"
    ["3"]="arbitrum-sepolia"
    ["4"]="optimism-sepolia"
    ["5"]="polygon-amoy"
    ["6"]="arc-testnet"
)

declare -A CHAIN_IDS=(
    ["ethereum-sepolia"]="11155111"
    ["base-sepolia"]="84532"
    ["arbitrum-sepolia"]="421614"
    ["optimism-sepolia"]="11155420"
    ["polygon-amoy"]="80002"
    ["arc-testnet"]="1243"
)

declare -A NATIVE_SYMBOLS=(
    ["ethereum-sepolia"]="ETH"
    ["base-sepolia"]="ETH"
    ["arbitrum-sepolia"]="ETH"
    ["optimism-sepolia"]="ETH"
    ["polygon-amoy"]="POL"
    ["arc-testnet"]="ETH"
)

# Function to get balance
get_balance() {
    local ADDRESS=$1
    local TOKEN=$2
    local RPC=$3
    
    if [ "$TOKEN" = "native" ]; then
        cast balance "$ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo "0"
    else
        cast call "$TOKEN" "balanceOf(address)(uint256)" "$ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo "0"
    fi
}

# Function to format balance
format_balance() {
    local BALANCE=$1
    local DECIMALS=${2:-18}
    
    if [ "$BALANCE" = "0" ] || [ -z "$BALANCE" ]; then
        echo "0.00"
    else
        # Use bc for arbitrary precision arithmetic
        echo "scale=2; $BALANCE / (10^$DECIMALS)" | bc 2>/dev/null || echo "0.00"
    fi
}

# Function to display balances
display_balances() {
    local CHAIN=$1
    local CHAIN_UPPER=$(echo "$CHAIN" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
    local RPC_VAR="${CHAIN_UPPER}_RPC"
    local RPC="${!RPC_VAR}"
    local USDC_VAR="USDC_${CHAIN_UPPER}"
    local USDC="${!USDC_VAR}"
    local NATIVE="${NATIVE_SYMBOLS[$CHAIN]}"
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${CHAIN^^} - Chain ID: ${CHAIN_IDS[$CHAIN]}${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Funding Wallet
    echo -e "${GREEN}💰 FUNDING WALLET${NC}"
    echo "   Address: $FUNDING_WALLET_ADDRESS"
    local FUNDING_NATIVE=$(get_balance "$FUNDING_WALLET_ADDRESS" "native" "$RPC")
    local FUNDING_USDC=$(get_balance "$FUNDING_WALLET_ADDRESS" "$USDC" "$RPC")
    echo -e "   Native ($NATIVE):  $(format_balance $FUNDING_NATIVE 18)"
    echo -e "   USDC:             $(format_balance $FUNDING_USDC 6)"
    echo ""
    
    # Buyer Wallet
    echo -e "${GREEN}👤 BUYER WALLET${NC}"
    echo "   Address: $BUYER_WALLET_ADDRESS"
    local BUYER_NATIVE=$(get_balance "$BUYER_WALLET_ADDRESS" "native" "$RPC")
    local BUYER_USDC=$(get_balance "$BUYER_WALLET_ADDRESS" "$USDC" "$RPC")
    echo -e "   Native ($NATIVE):  $(format_balance $BUYER_NATIVE 18)"
    echo -e "   USDC:             $(format_balance $BUYER_USDC 6)"
    echo ""
    
    # Seller Wallet
    echo -e "${GREEN}🏪 SELLER WALLET${NC}"
    echo "   Address: $SELLER_WALLET_ADDRESS"
    local SELLER_NATIVE=$(get_balance "$SELLER_WALLET_ADDRESS" "native" "$RPC")
    local SELLER_USDC=$(get_balance "$SELLER_WALLET_ADDRESS" "$USDC" "$RPC")
    echo -e "   Native ($NATIVE):  $(format_balance $SELLER_NATIVE 18)"
    echo -e "   USDC:             $(format_balance $SELLER_USDC 6)"
    echo ""
    
    # Facilitator Wallet
    echo -e "${GREEN}🔐 FACILITATOR WALLET${NC}"
    echo "   Address: $FACILITATOR_WALLET_ADDRESS"
    local FACILITATOR_NATIVE=$(get_balance "$FACILITATOR_WALLET_ADDRESS" "native" "$RPC")
    local FACILITATOR_USDC=$(get_balance "$FACILITATOR_WALLET_ADDRESS" "$USDC" "$RPC")
    echo -e "   Native ($NATIVE):  $(format_balance $FACILITATOR_NATIVE 18)"
    echo -e "   USDC:             $(format_balance $FACILITATOR_USDC 6)"
    echo ""
}

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║           Interactive Account Funding Tool                      ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Select Chain
echo -e "${YELLOW}Step 1: Select Chain${NC}"
echo ""
echo "1) Ethereum Sepolia"
echo "2) Base Sepolia"
echo "3) Arbitrum Sepolia"
echo "4) Optimism Sepolia"
echo "5) Polygon Amoy"
echo "6) Arc Testnet"
echo ""
read -p "Enter chain number [1-6]: " CHAIN_NUM

SELECTED_CHAIN="${CHAIN_NAMES[$CHAIN_NUM]}"
if [ -z "$SELECTED_CHAIN" ]; then
    echo -e "${RED}Invalid chain selection${NC}"
    exit 1
fi

CHAIN_UPPER=$(echo "$SELECTED_CHAIN" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
RPC_VAR="${CHAIN_UPPER}_RPC"
RPC="${!RPC_VAR}"
USDC_VAR="USDC_${CHAIN_UPPER}"
USDC="${!USDC_VAR}"
NATIVE="${NATIVE_SYMBOLS[$SELECTED_CHAIN]}"

# Display balances for selected chain
display_balances "$SELECTED_CHAIN"

# Step 2: Select Source Account
echo -e "${YELLOW}Step 2: Select Source Account (who will send funds)${NC}"
echo ""
echo "1) Funding Wallet (default)"
echo "2) Buyer Wallet"
echo "3) Seller Wallet"
echo "4) Facilitator Wallet"
echo ""
read -p "Enter source account [1-4, default: 1]: " SOURCE_NUM
SOURCE_NUM=${SOURCE_NUM:-1}

case $SOURCE_NUM in
    1)
        SOURCE_ADDRESS="$FUNDING_WALLET_ADDRESS"
        SOURCE_KEY="$FUNDING_WALLET_PRIVATE_KEY"
        SOURCE_NAME="Funding"
        ;;
    2)
        SOURCE_ADDRESS="$BUYER_WALLET_ADDRESS"
        SOURCE_KEY="$BUYER_PRIVATE_KEY"
        SOURCE_NAME="Buyer"
        ;;
    3)
        SOURCE_ADDRESS="$SELLER_WALLET_ADDRESS"
        SOURCE_KEY="$SELLER_PRIVATE_KEY"
        SOURCE_NAME="Seller"
        ;;
    4)
        SOURCE_ADDRESS="$FACILITATOR_WALLET_ADDRESS"
        SOURCE_KEY="$FACILITATOR_PRIVATE_KEY"
        SOURCE_NAME="Facilitator"
        ;;
    *)
        echo -e "${RED}Invalid source account${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✓ Source: $SOURCE_NAME ($SOURCE_ADDRESS)${NC}"
echo ""

# Step 3: Select Destination Account
echo -e "${YELLOW}Step 3: Select Destination Account (who will receive funds)${NC}"
echo ""
echo "1) Buyer Wallet"
echo "2) Seller Wallet"
echo "3) Facilitator Wallet"
echo "4) Funding Wallet"
echo ""
read -p "Enter destination account [1-4]: " DEST_NUM

case $DEST_NUM in
    1)
        DEST_ADDRESS="$BUYER_WALLET_ADDRESS"
        DEST_NAME="Buyer"
        ;;
    2)
        DEST_ADDRESS="$SELLER_WALLET_ADDRESS"
        DEST_NAME="Seller"
        ;;
    3)
        DEST_ADDRESS="$FACILITATOR_WALLET_ADDRESS"
        DEST_NAME="Facilitator"
        ;;
    4)
        DEST_ADDRESS="$FUNDING_WALLET_ADDRESS"
        DEST_NAME="Funding"
        ;;
    *)
        echo -e "${RED}Invalid destination account${NC}"
        exit 1
        ;;
esac

if [ "$SOURCE_ADDRESS" = "$DEST_ADDRESS" ]; then
    echo -e "${RED}Error: Source and destination cannot be the same${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Destination: $DEST_NAME ($DEST_ADDRESS)${NC}"
echo ""

# Step 4: Select Token
echo -e "${YELLOW}Step 4: Select Token to Transfer${NC}"
echo ""
echo "1) Native Token ($NATIVE)"
echo "2) USDC"
echo ""
read -p "Enter token [1-2]: " TOKEN_NUM

case $TOKEN_NUM in
    1)
        TOKEN_TYPE="native"
        TOKEN_NAME="$NATIVE"
        DECIMALS=18
        ;;
    2)
        TOKEN_TYPE="usdc"
        TOKEN_NAME="USDC"
        DECIMALS=6
        ;;
    *)
        echo -e "${RED}Invalid token selection${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✓ Token: $TOKEN_NAME${NC}"
echo ""

# Step 5: Enter Amount
echo -e "${YELLOW}Step 5: Enter Amount to Transfer${NC}"
echo ""
read -p "Amount (in $TOKEN_NAME): " AMOUNT

if [ -z "$AMOUNT" ]; then
    echo -e "${RED}Amount cannot be empty${NC}"
    exit 1
fi

# Validate amount is a number
if ! [[ "$AMOUNT" =~ ^[0-9]*\.?[0-9]+$|^[0-9]+$ ]]; then
    echo -e "${RED}Invalid amount format${NC}"
    exit 1
fi

# Convert to wei/smallest unit
AMOUNT_WEI=$(awk "BEGIN {printf \"%.0f\", $AMOUNT * 10^$DECIMALS}")

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Transfer Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Chain:       $SELECTED_CHAIN"
echo "  From:        $SOURCE_NAME ($SOURCE_ADDRESS)"
echo "  To:          $DEST_NAME ($DEST_ADDRESS)"
echo "  Token:       $TOKEN_NAME"
echo "  Amount:      $AMOUNT $TOKEN_NAME"
echo ""
read -p "Proceed with transfer? [y/N]: " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Transfer cancelled"
    exit 0
fi

echo ""
echo -e "${GREEN}Executing transfer...${NC}"
echo ""

# Execute transfer
if [ "$TOKEN_TYPE" = "native" ]; then
    # Native token transfer
    TX_HASH=$(cast send --value "${AMOUNT}ether" "$DEST_ADDRESS" \
        --private-key "$SOURCE_KEY" \
        --rpc-url "$RPC" \
        2>&1)
    
    if echo "$TX_HASH" | grep -q "transactionHash"; then
        HASH=$(echo "$TX_HASH" | grep "transactionHash" | awk '{print $2}')
        echo -e "${GREEN}✅ Transfer successful!${NC}"
        echo ""
        echo "Transaction Hash: $HASH"
        
        # Show explorer link based on chain
        case $SELECTED_CHAIN in
            "ethereum-sepolia")
                echo "Explorer: ${ETHEREUM_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "base-sepolia")
                echo "Explorer: ${BASE_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "arbitrum-sepolia")
                echo "Explorer: ${ARBITRUM_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "optimism-sepolia")
                echo "Explorer: ${OPTIMISM_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "polygon-amoy")
                echo "Explorer: ${POLYGON_AMOY_EXPLORER}/${HASH}"
                ;;
            "arc-testnet")
                echo "Explorer: ${ARC_TESTNET_EXPLORER}/${HASH}"
                ;;
        esac
    else
        echo -e "${RED}Transfer failed:${NC}"
        echo "$TX_HASH"
        exit 1
    fi
else
    # USDC transfer
    echo "Calling USDC contract at $USDC..."
    TX_HASH=$(cast send "$USDC" "transfer(address,uint256)" "$DEST_ADDRESS" "$AMOUNT_WEI" \
        --private-key "$SOURCE_KEY" \
        --rpc-url "$RPC" \
        2>&1)
    
    echo ""  # Newline after transaction output
    
    if echo "$TX_HASH" | grep -q "transactionHash"; then
        HASH=$(echo "$TX_HASH" | grep "transactionHash" | awk '{print $2}')
        echo -e "${GREEN}✅ Transfer successful!${NC}"
        echo ""
        echo "Transaction Hash: $HASH"
        
        # Show explorer link based on chain
        case $SELECTED_CHAIN in
            "ethereum-sepolia")
                echo "Explorer: ${ETHEREUM_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "base-sepolia")
                echo "Explorer: ${BASE_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "arbitrum-sepolia")
                echo "Explorer: ${ARBITRUM_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "optimism-sepolia")
                echo "Explorer: ${OPTIMISM_SEPOLIA_EXPLORER}/${HASH}"
                ;;
            "polygon-amoy")
                echo "Explorer: ${POLYGON_AMOY_EXPLORER}/${HASH}"
                ;;
            "arc-testnet")
                echo "Explorer: ${ARC_TESTNET_EXPLORER}/${HASH}"
                ;;
        esac
        
        # Always show updated balances after successful transfer
        echo ""
        echo "Waiting 2 seconds for transaction to be indexed..."
        sleep 2
        display_balances "$SELECTED_CHAIN"
    else
        echo -e "${RED}Transfer failed:${NC}"
        echo "$TX_HASH"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Done!${NC}"

