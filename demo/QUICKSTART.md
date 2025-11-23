# x402 Demo UI - Quick Start Guide

## 🚀 Launch in 3 Steps

### 1. Ensure `.env` is Configured

You need these variables set:

```bash
# Wallets (required)
BUYER_PRIVATE_KEY=0x...
BUYER_WALLET_ADDRESS=0x...
SELLER_WALLET_ADDRESS=0x...
FACILITATOR_PRIVATE_KEY=0x...
FACILITATOR_WALLET_ADDRESS=0x...

# RPC URLs (at least one)
POLYGON_AMOY_RPC=https://...
BASE_SEPOLIA_RPC=https://...

# USDC Addresses (match your RPCs)
USDC_POLYGON_AMOY=0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
USDC_BASE_SEPOLIA=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Block Explorers
POLYGON_AMOY_EXPLORER=https://www.oklink.com/amoy/tx
BASE_SEPOLIA_EXPLORER=https://sepolia.basescan.org/tx

# Vault Addresses (optional, for escrow-deferred only)
VAULT_POLYGON_AMOY=0x...  # Deploy with: npm run deploy:vault
VAULT_BASE_SEPOLIA=0x...
```

### 2. Install Dependencies (if not done)

```bash
npm install
```

### 3. Launch Demo

```bash
npm run demo:ui
```

Opens at **http://localhost:3000**

---

## 🎮 Using the Demo

### Select Network

Choose from dropdown:

- **Polygon Amoy** (default)
- Base Sepolia
- Arbitrum Sepolia
- Optimism Sepolia
- Arc Testnet

### Select Payment Scheme

**x402-exact** (Always Available):

- Synchronous on-chain settlement
- Real blockchain transaction
- ~9 second latency
- ~85k gas

**Escrow-Deferred** (Requires Vault):

- Instant content delivery
- Deferred settlement
- <100ms latency
- ~3k gas (when batched)

### Run the Flow

1. Click **"Run Demo Flow"**
2. Watch real-time events:
   - HTTP 402 exchanges
   - EIP-712 signatures
   - Blockchain transactions
   - Explorer links
3. View final metrics

---

## 🐛 Troubleshooting

### "Network not found"

**Solution**: Add RPC URL and USDC address to `.env`

### "Vault not deployed" (escrow-deferred only)

**Solution**: Deploy vault first:

```bash
npm run deploy:vault:polygon-amoy
# Add deployed address to .env as VAULT_POLYGON_AMOY
```

### Server won't start

**Solution**: Check that:

- `.env` exists with required variables
- Port 3000 is not in use (or set `DEMO_PORT` to different port)
- `npm install` has been run

### "Insufficient funds"

**Solution**: Fund wallets on testnet:

```bash
npm run fund  # Or use faucets directly
```

---

## 📊 What You'll See

### Event Types

- **Blue events**: HTTP requests/responses
- **Purple events**: Signature generation
- **Green events**: Blockchain transactions
- **Red events**: Errors

### Metrics

After completion, you'll see:

- Total time (exact: ~9s, deferred: <0.1s)
- Gas used (with explorer link)
- Transaction hash (clickable)

---

## 🎯 Demo Tips

### For Presentations

1. **Start with x402-exact** on Polygon Amoy

   - Shows the full flow clearly
   - Real transaction is impressive

2. **Switch to escrow-deferred** on Base Sepolia

   - Highlight the speed difference
   - Explain deferred settlement benefit

3. **Use transaction links**
   - Click to show on block explorer
   - Proves it's real blockchain

### For Development

- Open browser console (F12) for detailed logs
- Check WebSocket connection status
- Network tab shows real API calls
- Modify `demo/orchestrator.ts` to customize flows

---

## 🔗 Quick Links

- **Demo Documentation**: `demo/README.md`
- **Implementation Details**: `DEMO_IMPLEMENTATION.md`
- **Main README**: `../README.md`
- **x402 Standard**: `X402_STANDARD.md`

---

## ✅ Test Installation

Run the startup test:

```bash
cd demo
./test-startup.sh
```

This verifies:

- Dependencies installed
- Server can start
- Health endpoint responds

---

**Ready to demo!** 🎉

Launch with: `npm run demo:ui`
