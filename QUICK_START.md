# Quick Start Guide

## Prerequisites

1. **Node.js** v16+ and npm
2. **Foundry** (for contract interactions)
3. **Base Sepolia testnet ETH and USDC**

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp example.env .env
```

Required variables:
- `BUYER_WALLET_ADDRESS` + `BUYER_PRIVATE_KEY`
- `SELLER_WALLET_ADDRESS` + `SELLER_PRIVATE_KEY`
- `FACILITATOR_WALLET_ADDRESS` + `FACILITATOR_PRIVATE_KEY`
- `BASE_SEPOLIA_RPC` (your RPC endpoint)
- `USDC_BASE_SEPOLIA=0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### 3. Fund Wallets

The buyer needs:
- **Base Sepolia ETH** (for gas when approving)
- **USDC on Base Sepolia** (for payments)

Get testnet tokens:
- ETH: https://portal.cdp.coinbase.com/products/faucet
- USDC: Swap testnet ETH or use Circle's testnet faucet

## Running the Demo

### Step 1: Approve Facilitator

The buyer must approve the facilitator to spend their USDC:

```bash
npm run approve
```

This grants the facilitator permission to execute `transferFrom` on behalf of the buyer.

### Step 2: Start Services

In **separate terminals**:

**Terminal 1 - Facilitator:**
```bash
npm run facilitator
```

**Terminal 2 - Seller:**
```bash
npm run seller
```

### Step 3: Make a Payment

In **Terminal 3 - Buyer:**
```bash
npm run buyer
```

## Expected Flow

1. **Buyer** requests `/api/content/premium`
2. **Seller** responds with `402 Payment Required` + payment requirements
3. **Buyer** creates and signs PaymentIntent (EIP-712)
4. **Buyer** retries request with `X-PAYMENT` header
5. **Seller** forwards payment to **Facilitator**
6. **Facilitator**:
   - Validates signature
   - Executes `transferFrom` (USDC: buyer → seller)
   - Waits for blockchain confirmation
   - Returns success with txHash
7. **Seller** delivers content with `X-PAYMENT-RESPONSE` header
8. **Buyer** receives content + payment confirmation

## Verification

Check the transaction on Base Sepolia:
```
https://sepolia.basescan.org/tx/<TX_HASH>
```

## Troubleshooting

### "Insufficient allowance"
Run the approve script: `npm run approve`

### "Insufficient balance"
Fund your buyer wallet with USDC

### "Facilitator unavailable"
Make sure the facilitator server is running on port 4023

### "Invalid signature"
Check that `FACILITATOR_WALLET_ADDRESS` in `.env` matches the running facilitator

## Architecture

```
┌─────────┐         ┌─────────┐         ┌──────────────┐
│  Buyer  │────1───>│ Seller  │         │ Facilitator  │
│         │<───2────│ (402)   │         │              │
│         │────3───>│         │────4───>│              │
│ Sign    │         │ Forward │ Settle  │ transferFrom │
│ Intent  │         │ Payment │ On-Chain│ (USDC)       │
│         │<───7────│         │<───6────│              │
│ Content │  200 OK │ Deliver │ Success │              │
└─────────┘         └─────────┘         └──────────────┘
                                               │
                                               v
                                        ┌──────────────┐
                                        │ Base Sepolia │
                                        │ (Blockchain) │
                                        └──────────────┘
```

## Key Features

- ✅ **Synchronous Settlement**: Payment settles before content delivery
- ✅ **EIP-712 Signatures**: Cryptographic payment authorization
- ✅ **Replay Protection**: Nonce tracking prevents double-spend
- ✅ **Polygon x402 Compliant**: Matches official specification
- ✅ **No Smart Contracts**: Uses standard ERC-20 `transferFrom`

## Next Steps

- Run E2E tests: `npm run test:e2e`
- Deploy on other chains (Polygon Amoy, etc.)
- Add batching and deferred settlement (future enhancement)

