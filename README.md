# x402 Escrow

A secure, multi-chain payment escrow system built for HTTP 402 Payment Required workflows. This project enables seamless payment verification and settlement across multiple EVM-compatible chains using USDC.

## 🌟 Features

- **Multi-Chain Support**: Works across Ethereum, Arbitrum, Optimism, Base, Polygon, and Arc testnet
- **HTTP 402 Integration**: Native support for payment-required HTTP workflows
- **Three-Party System**: Buyer, Seller, and Facilitator roles for secure transactions
- **USDC Settlements**: Stable payment processing using Circle's USDC stablecoin
- **Flexible RPC Support**: Compatible with QuickNode, Alchemy, Infura, and public endpoints

## 🏗️ Architecture

The system operates with three distinct wallets:

1. **Seller Wallet**: Receives payments for goods/services
2. **Buyer Wallet**: Makes payments for access to content/services
3. **Facilitator Wallet**: Manages payment verification and settlement
4. **Funding Wallet**: Bootstraps testnet deployments with ETH and USDC

## 📋 Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) for smart contract development
- Node.js (v16+) for backend services
- Access to RPC providers (QuickNode, Alchemy, or public endpoints)
- Testnet ETH and USDC for testing

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/x402-escrow.git
cd x402-escrow
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your values:

```bash
cp example.env .env
```

Edit `.env` with your:

- Wallet addresses and private keys
- RPC endpoint URLs
- Block explorer API keys

### 3. Generate New Wallets (Optional)

Generate fresh wallets using Foundry:

```bash
# Install Foundry if not already installed
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Generate 3 new wallets
for i in 1 2 3; do
  echo "=== Wallet $i ==="
  cast wallet new
  echo ""
done
```

⚠️ **Security Warning**: Never commit private keys to version control. The `.env` file is gitignored by default.

## 🔧 Configuration

### Supported Networks

| Network          | Chain ID | USDC Address                                 |
| ---------------- | -------- | -------------------------------------------- |
| Ethereum Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Arbitrum Sepolia | 421614   | `0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d` |
| Optimism Sepolia | 11155420 | `0x5fd84259d66cd46123540766be93dfe6d43130d7` |
| Base Sepolia     | 84532    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Polygon Amoy     | 80002    | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| Arc Testnet      | TBD      | `0x3600000000000000000000000000000000000000` |

### Infrastructure

Default server ports:

- **Buyer Service**: Port 4021
- **Seller Service**: Port 4022
- **Facilitator Service**: Port 4023

## 📖 Usage

### Basic Payment Flow

1. **Buyer** initiates payment request to access content
2. **Seller** returns HTTP 402 with payment details
3. **Buyer** submits USDC payment transaction
4. **Facilitator** verifies payment on-chain
5. **Seller** grants access to content

### Environment Variables

Key configuration options in `.env`:

```bash
# Wallet Configuration
SELLER_WALLET_ADDRESS=0x...
SELLER_PRIVATE_KEY=0x...
BUYER_WALLET_ADDRESS=0x...
BUYER_PRIVATE_KEY=0x...
FACILITATOR_WALLET_ADDRESS=0x...
FACILITATOR_PRIVATE_KEY=0x...

# RPC Endpoints
BASE_SEPOLIA_RPC=https://your-rpc-url
POLYGON_AMOY_RPC=https://your-rpc-url

# Payment Settings
PAYMENT_AMOUNT=0.01  # Amount in USDC
```

## 🔐 Security Best Practices

- **Never commit `.env`** - It's gitignored by default
- **Use separate wallets** for testnet and mainnet
- **Rotate private keys** regularly
- **Use hardware wallets** for production deployments
- **Limit funding wallet** to minimum required balance

## 🧪 Testing

### Getting Testnet Tokens

1. **Testnet ETH**:

   - Base Sepolia: [https://portal.cdp.coinbase.com/products/faucet](https://portal.cdp.coinbase.com/products/faucet)
   - Polygon Amoy: [https://faucet.polygon.technology/](https://faucet.polygon.technology/)

2. **Testnet USDC**:
   - Use Circle's testnet faucet or swap testnet ETH

## 🛠️ Development

### Project Structure

```
x402-escrow/
├── .env                 # Your local environment (gitignored)
├── example.env          # Template for environment variables
├── .gitignore          # Git ignore rules
├── LICENSE             # MIT License
└── README.md           # This file
```

## 📚 API Documentation

Coming soon...

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [HTTP 402 Payment Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)
- [Circle USDC](https://www.circle.com/en/usdc)
- [Foundry Book](https://book.getfoundry.sh/)
- [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559)

## 📧 Support

For questions or issues, please open an issue on GitHub.

---

Built with ❤️ for ETHGlobal
