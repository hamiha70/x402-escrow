#!/bin/bash
# Set ROFL secrets from .env files

set -e

# Load environment variables
if [ ! -f "../.env" ]; then
  echo "❌ .env file not found"
  exit 1
fi

source ../.env
source ../deployed-tee.env

echo "🔐 Setting ROFL secrets..."

# RPC URLs
oasis rofl secret set BASE_SEPOLIA_RPC "${BASE_SEPOLIA_RPC}"
oasis rofl secret set POLYGON_AMOY_RPC "${POLYGON_AMOY_RPC}"
oasis rofl secret set ARBITRUM_SEPOLIA_RPC "${ARBITRUM_SEPOLIA_RPC}"
oasis rofl secret set OPTIMISM_SEPOLIA_RPC "${OPTIMISM_SEPOLIA_RPC}"
oasis rofl secret set ARC_TESTNET_RPC "${ARC_TESTNET_RPC}"

# Facilitator private keys
# NOTE: These should be different from your main facilitator keys
# Generate with: openssl rand -hex 32
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_BASE "${TEE_FACILITATOR_PRIVATE_KEY_BASE}"
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_POLYGON "${TEE_FACILITATOR_PRIVATE_KEY_POLYGON}"
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_ARBITRUM "${TEE_FACILITATOR_PRIVATE_KEY_ARBITRUM}"
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_OPTIMISM "${TEE_FACILITATOR_PRIVATE_KEY_OPTIMISM}"
oasis rofl secret set TEE_FACILITATOR_PRIVATE_KEY_ARC "${TEE_FACILITATOR_PRIVATE_KEY_ARC}"

# Omnibus vault addresses
oasis rofl secret set OMNIBUS_VAULT_BASE_SEPOLIA "${OMNIBUS_VAULT_BASE_SEPOLIA}"
oasis rofl secret set OMNIBUS_VAULT_POLYGON_AMOY "${OMNIBUS_VAULT_POLYGON_AMOY}"
oasis rofl secret set OMNIBUS_VAULT_ARBITRUM_SEPOLIA "${OMNIBUS_VAULT_ARBITRUM_SEPOLIA}"
oasis rofl secret set OMNIBUS_VAULT_OPTIMISM_SEPOLIA "${OMNIBUS_VAULT_OPTIMISM_SEPOLIA}"
oasis rofl secret set OMNIBUS_VAULT_ARC_TESTNET "${OMNIBUS_VAULT_ARC_TESTNET}"

# USDC addresses
oasis rofl secret set USDC_BASE_SEPOLIA "${USDC_BASE_SEPOLIA}"
oasis rofl secret set USDC_POLYGON_AMOY "${USDC_POLYGON_AMOY}"
oasis rofl secret set USDC_ARBITRUM_SEPOLIA "${USDC_ARBITRUM_SEPOLIA}"
oasis rofl secret set USDC_OPTIMISM_SEPOLIA "${USDC_OPTIMISM_SEPOLIA}"
oasis rofl secret set USDC_ARC_TESTNET "${USDC_ARC_TESTNET}"

# Seller address
oasis rofl secret set SELLER_WALLET_ADDRESS "${SELLER_WALLET_ADDRESS}"

echo "✅ Secrets set successfully"
echo ""
echo "Secrets are encrypted and stored in ROFL KMS"

