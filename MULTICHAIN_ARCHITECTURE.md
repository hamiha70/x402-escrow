# Multi-Chain Architecture

## Overview

The x402-escrow system supports **simultaneous multi-chain operation** with a single facilitator and seller deployment. Buyers select their preferred payment chain by choosing the appropriate endpoint.

## Key Design Decisions

### 1. **Chain Selection via Endpoints** (Not Environment Variables)

Instead of restarting servers with different configs, we use **chain-specific endpoints**:

```
Seller Endpoints:
  /api/content/premium/base-sepolia      → Base Sepolia USDC
  /api/content/premium/polygon-amoy      → Polygon Amoy USDC
  /api/content/premium/arbitrum-sepolia  → Arbitrum Sepolia USDC
  /api/content/premium/arc               → Arc Testnet USDC
  ...
```

**Why?**

- ✅ Real-world pattern: Sellers offer multiple payment options simultaneously
- ✅ No server restart needed
- ✅ Clear in demos: explicit chain choice
- ✅ Scales: Add chains without downtime

### 2. **Single Multi-Chain Facilitator**

The facilitator reads payment intent's `chainId` and dynamically:

- Selects correct RPC provider
- Validates against correct USDC contract
- Submits settlement transaction to correct chain

**Why?**

- ✅ Simpler deployment (one facilitator for all chains)
- ✅ Efficient: Shared infrastructure
- ✅ Flexible: Buyer chooses chain, facilitator adapts

### 3. **Explorer URLs vs RPC URLs**

**Two types of URLs, two different purposes:**

| Type             | Purpose              | Used For                                                      | Source                                 |
| ---------------- | -------------------- | ------------------------------------------------------------- | -------------------------------------- |
| **RPC URL**      | Blockchain queries   | `getTransactionReceipt()`, `balanceOf()`, on-chain settlement | `.env` (e.g., `BASE_SEPOLIA_RPC`)      |
| **Explorer URL** | Human-readable links | Display in demo output, logging, UI                           | `.env` (e.g., `BASE_SEPOLIA_EXPLORER`) |

**Example:**

```typescript
// RPC URL - actual blockchain interaction
const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
const receipt = await provider.getTransactionReceipt(txHash);

// Explorer URL - display only
const link = `${process.env.BASE_SEPOLIA_EXPLORER}/${txHash}`;
console.log(`View transaction: ${link}`);
```

**Why separate?**

- ✅ RPC providers (Alchemy, QuickNode) ≠ Block explorers (Basescan, Polygonscan)
- ✅ Explorer URLs are optional (display-only)
- ✅ Different chains have different explorer domains

## Configuration

### Environment Variables

Each chain requires 3 variables in `.env`:

```bash
# Base Sepolia
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/...
USDC_BASE_SEPOLIA=0x036CbD53842c5426634e7929541eC2318f3dCF7e
BASE_SEPOLIA_EXPLORER=https://sepolia.basescan.org/tx

# Polygon Amoy
POLYGON_AMOY_RPC=https://polygon-amoy.g.alchemy.com/v2/...
USDC_POLYGON_AMOY=0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
POLYGON_AMOY_EXPLORER=https://www.oklink.com/amoy/tx
```

### Server Startup

```bash
npm run start  # Starts facilitator + seller (both multi-chain capable)
```

Logs show all supported chains:

```
[facilitator] Multi-chain facilitator - Supports:
  • Base Sepolia (84532): 0x036CbD...
  • Polygon Amoy (80002): 0x41E94E...
  • Arc Testnet (1243): 0x360000...

[seller] Multi-chain seller - Accepting payments on:
  • Base Sepolia (84532): /api/content/premium/base-sepolia
  • Polygon Amoy (80002): /api/content/premium/polygon-amoy
  • Arc Testnet (1243): /api/content/premium/arc
```

## Demo Usage

### Run on Specific Chain

```bash
# Test on Polygon Amoy
./scripts/run_demo_exact.sh polygon-amoy

# Test on Arc Testnet
./scripts/run_demo_exact.sh arc

# Default to Base Sepolia
./scripts/run_demo_exact.sh
```

### Multi-Chain Testing Sequence

```bash
npm run start  # Start servers once

# Run demos on different chains (no restart needed!)
./scripts/run_demo_exact.sh base-sepolia
./scripts/run_demo_exact.sh polygon-amoy
./scripts/run_demo_exact.sh arc

npm run stop  # Stop servers when done
```

## Payment Flow (Multi-Chain)

```
1. Buyer → GET /api/content/premium/polygon-amoy
   ↓
2. Seller → 402 Payment Required
   {
     "PaymentRequirements": [{
       "chainId": 80002,  // Polygon Amoy
       "tokenAddress": "0x41E94Eb...",  // Polygon USDC
       "facilitator": "http://localhost:4023/settle"
     }]
   }
   ↓
3. Buyer → Signs payment intent for chainId 80002
   ↓
4. Buyer → GET /api/content/premium/polygon-amoy
   Headers: { "x-payment": "{intent, signatures}" }
   ↓
5. Seller → POST to Facilitator /settle
   ↓
6. Facilitator → Reads chainId from intent
              → Connects to Polygon Amoy RPC
              → Settles on Polygon using Polygon USDC
   ↓
7. Seller → 200 OK + Content + x-payment-response
```

## Benefits

1. **For Sellers**: Offer multiple payment chains without complexity
2. **For Buyers**: Choose cheapest/fastest chain for their use case
3. **For Demos**: Clear multi-chain capability demonstration
4. **For Production**: Easy to add new chains without architectural changes

## Adding a New Chain

1. Add to `.env`:

   ```bash
   NEW_CHAIN_RPC=https://...
   USDC_NEW_CHAIN=0x...
   NEW_CHAIN_EXPLORER=https://...
   ```

2. Add to `example.env` (same format)

3. Add to chain configs in:

   - `facilitator/server.ts` → `CHAIN_CONFIG`
   - `seller/server.ts` → `CHAINS`
   - `scripts/demo-exact.ts` → `CHAIN_CONFIGS`
   - `scripts/run_demo_exact.sh` → `CHAIN_NAMES`

4. Restart servers → New chain automatically available!

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Buyer Agent                      │
│  Chooses chain via endpoint                         │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                  Seller (Multi-Chain)                │
│  • /premium/base-sepolia    → Chain 84532           │
│  • /premium/polygon-amoy    → Chain 80002           │
│  • /premium/arc             → Chain 1243            │
└─────────────────────┬───────────────────────────────┘
                      │ forward payment intent
                      ▼
┌─────────────────────────────────────────────────────┐
│              Facilitator (Multi-Chain)               │
│  Reads chainId from intent, connects to:            │
│  • Provider[84532]  = JsonRpcProvider(BASE_RPC)     │
│  • Provider[80002]  = JsonRpcProvider(POLYGON_RPC)  │
│  • Provider[1243]   = JsonRpcProvider(ARC_RPC)      │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌────────┐  ┌─────────┐  ┌─────────┐
    │  Base  │  │ Polygon │  │   Arc   │
    │ Sepolia│  │  Amoy   │  │ Testnet │
    └────────┘  └─────────┘  └─────────┘
```

## Performance Considerations

**No overhead for multi-chain support:**

- Providers created on-demand (lazy initialization)
- Cached after first use
- Only active chain's RPC is queried per request

**Latency same as single-chain:**

- Each payment uses exactly one chain
- No cross-chain coordination needed
- Settlement time depends only on chosen chain's block time
