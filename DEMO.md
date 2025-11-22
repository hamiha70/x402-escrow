# x402 Protocol - Demo Guide

This guide explains how to run demonstrations of the x402 payment protocol.

## Available Schemes

### 1. x402-exact (Synchronous Settlement) ✅ IMPLEMENTED

**Status:** Fully implemented and tested on Base Sepolia

**Description:** Synchronous on-chain settlement using EIP-3009 `transferWithAuthorization`. Payment is settled **before** content is delivered.

**Characteristics:**

- ⏱️ Latency: ~7-9 seconds (blockchain confirmation)
- 💰 Cost: Gasless for buyers, facilitator pays gas
- 🔒 Security: Strong guarantee - content only after confirmed payment
- 📊 Use case: Standard API payments, premium content, one-time purchases

**Run the demo:**

```bash
# Option 1: Automated full demo (starts servers, runs demo, shows results)
npm run demo:exact:full

# Option 2: Manual (servers must be running separately)
npm run start          # Terminal 1: Start servers
npm run demo:exact     # Terminal 2: Run demo
```

### 2. x402-escrow-deferred (Vault-Based Batch Settlement) 🚧 PLANNED

**Status:** Not yet implemented (placeholder only)

**Description:** Optimistic content delivery with payments held in escrow vault and batch-settled later.

**Planned Characteristics:**

- ⏱️ Latency: ~500ms-1s (optimistic delivery)
- 💰 Cost: Reduced gas through batching
- 🔒 Security: Escrow vault with dispute resolution
- 📊 Use case: High-frequency micropayments, streaming APIs, real-time services

**To be implemented:**

- Custom escrow vault contract
- Batch settlement mechanism
- Dispute resolution system

---

## Demo Scripts

### `demo-exact.ts`

Comprehensive demo of the x402-exact scheme with:

✅ **Complete Protocol Flow:**

1. Initial request (no payment) → 402 response
2. Payment intent creation and EIP-712 signing
3. Payment submission with signature
4. On-chain settlement via facilitator
5. Content delivery after confirmation

✅ **Detailed Logging:**

- Phase-by-phase timing breakdown
- HTTP request/response logging
- On-chain transaction details
- Balance changes before/after

✅ **Results Capture:**

- Saves to `demo-results-exact.json`
- Transaction hash and explorer link
- Per-phase duration metrics
- Success/failure status

**Example output:**

```
════════════════════════════════════════════════════
   x402 PAYMENT PROTOCOL - LIVE DEMO
   SCHEME: x402-exact (Synchronous EIP-3009)
════════════════════════════════════════════════════

▶ PHASE 1: Initial Request (No Payment)
  Requesting: http://localhost:4022/api/content/premium
  Received: HTTP 402 Payment Required
  Amount required: 0.01 USDC
✓ Completed in 52ms

▶ PHASE 2: Payment Intent Creation & Signing
  Creating payment intent...
  Querying USDC contract for EIP-712 domain...
  Domain query took: 1287ms
  Signature: 0x1bde4237f9eb4af7...
✓ Completed in 1305ms

▶ PHASE 3: Payment Submission
  Submitting to seller with X-Payment header...
  Request took: 6842ms (includes on-chain settlement)
✓ Completed in 6845ms

▶ PHASE 4: Content Delivery
  Content title: Premium AI Model Output
  Transaction hash: 0x8d4c1301512088f7...
✓ Completed in 5ms

▶ PHASE 5: On-Chain Verification
  Fetching transaction receipt...
  Block number: 18123456
  Gas used: 52341
  Buyer change: -0.010000 USDC
  Seller change: +0.010000 USDC
✓ Completed in 1523ms

════════════════════════════════════════════════════
   DEMO SUMMARY
════════════════════════════════════════════════════

✓ Total Duration: 9732ms (9.73s)

Phase Breakdown:
  PHASE 1: Initial Request           52ms  ( 0.5%)
  PHASE 2: Payment Intent Creation  1305ms  (13.4%)
  PHASE 3: Payment Submission       6845ms  (70.3%)
  PHASE 4: Content Delivery            5ms  ( 0.1%)
  PHASE 5: On-Chain Verification    1523ms  (15.7%)

Transaction:
  Hash: 0x8d4c1301512088f74c96064b9aacfcb64dd9d1e213a90b561c5ce944ec67f4c8
  Explorer: https://sepolia.basescan.org/tx/0x8d4c...

Balance Changes:
  Buyer:   10.000000 → 9.990000 USDC
  Seller:  0.000000 → 0.010000 USDC
```

### `run_demo_exact.sh`

Automated demo runner that:

1. Stops any existing servers
2. Starts facilitator and seller
3. Waits for readiness
4. Runs the demo script
5. Captures all output to timestamped log file
6. Displays summary with key metrics
7. Optionally stops servers (with `--auto-stop`)

**Usage:**

```bash
# Keep servers running after demo
bash scripts/run_demo_exact.sh

# Auto-stop servers after demo
bash scripts/run_demo_exact.sh --auto-stop

# Or via npm
npm run demo:exact:full
```

---

## Prerequisites

Before running demos, ensure:

1. **Environment configured:**

   ```bash
   cp example.env .env
   # Edit .env with your wallet keys
   ```

2. **Wallets funded:**

   ```bash
   npm run fund
   ```

3. **Balances verified:**
   ```bash
   npm run balances
   ```

Required balances for Base Sepolia:

- **Buyer**: 10+ USDC, 0.02+ ETH
- **Seller**: 0.01+ ETH (for receiving)
- **Facilitator**: 0.02+ ETH (for gas)

---

## Analyzing Demo Results

### JSON Results File

Each demo saves detailed results to `demo-results-exact.json`:

```json
{
  "timestamp": "2025-11-22T02:36:35.356Z",
  "network": "base-sepolia",
  "totalDuration": 9732,
  "success": true,
  "phases": [
    {
      "phase": "PHASE 1: Initial Request",
      "startTime": 1732240595408,
      "endTime": 1732240595460,
      "duration": 52
    }
    // ... more phases
  ],
  "transaction": {
    "hash": "0x8d4c...",
    "explorerUrl": "https://sepolia.basescan.org/tx/0x8d4c...",
    "blockNumber": 18123456,
    "gasUsed": "52341"
  },
  "balances": {
    "before": {
      "buyer": "10.000000",
      "seller": "0.000000"
    },
    "after": {
      "buyer": "9.990000",
      "seller": "0.010000"
    }
  }
}
```

### Log Files

All demo runs save logs to `logs/demo-exact-YYYYMMDD-HHMMSS.log`

View live logs:

```bash
tail -f logs/demo-exact-*.log
```

View server logs:

```bash
tail -f logs/facilitator.log logs/seller.log
```

---

## Performance Benchmarking

### Timing Breakdown

Typical x402-exact transaction on Base Sepolia:

| Phase               | Duration    | % of Total | Notes                                   |
| ------------------- | ----------- | ---------- | --------------------------------------- |
| Initial 402         | ~50ms       | 0.5%       | HTTP roundtrip                          |
| Intent creation     | ~1300ms     | 13%        | Includes USDC domain query (first time) |
| On-chain settlement | ~6800ms     | 70%        | Blockchain confirmation (1-2 blocks)    |
| Content delivery    | ~5ms        | 0.1%       | Immediate after settlement              |
| Verification        | ~1500ms     | 15%        | Receipt fetching + balance checks       |
| **Total**           | **~9700ms** | **100%**   | **~9.7 seconds end-to-end**             |

### Optimization Opportunities

**Already implemented:**

- ✅ Domain caching (reduces 2nd+ requests to ~8s)
- ✅ EIP-3009 gasless transfers (buyer pays $0 gas)

**Future optimizations:**

- ⏳ Optimistic delivery (x402-escrow-deferred scheme): ~1s
- ⏳ Batch settlement: Amortize gas costs
- ⏳ Pre-signed authorizations: Skip signing step

---

## Comparison: x402-exact vs Traditional Payments

### x402-exact (This Implementation)

```
User Request
    ↓
HTTP 402 (50ms)
    ↓
Sign Off-Chain (15ms) ← NO GAS COST
    ↓
Facilitator Settles On-Chain (7s) ← FACILITATOR PAYS GAS
    ↓
Content Delivered
────────────────
Total: ~7-9s
Buyer Cost: $0 gas
```

### Traditional ERC-20 (with approval)

```
User Request
    ↓
HTTP 402 (50ms)
    ↓
User Approves (5-10s) ← USER PAYS GAS ($0.50-$2)
    ↓
Sign Transfer (15ms)
    ↓
TransferFrom (5-10s) ← BUYER/FACILITATOR PAYS GAS
    ↓
Content Delivered
────────────────
Total: ~15-20s
Buyer Cost: $0.50-$2 gas
```

### Key Advantages

- ✅ **Gasless for buyers**: No approval transaction
- ✅ **Better UX**: One signature instead of two transactions
- ✅ **Faster**: Single blockchain interaction
- ✅ **Standard**: Uses USDC's native EIP-3009 support

---

## Troubleshooting

### Demo fails with "Insufficient balance"

```bash
npm run balances  # Check current balances
npm run fund      # Fund wallets from funding account
```

### Demo fails with "Invalid signature"

- Check that USDC domain is correctly detected
- Verify chainId matches (84532 for Base Sepolia)
- Try stopping and restarting servers

### Servers don't start

```bash
npm run stop      # Kill any zombie processes
lsof -i :4022     # Check if ports are in use
lsof -i :4023
npm run start     # Restart
```

### Transaction not confirming

- Check Base Sepolia block explorer
- Verify RPC endpoint is working
- Try again (could be network congestion)

---

## Next Steps

After running the demo:

1. **Inspect on-chain transaction:**

   - Open the explorer link from demo output
   - Verify `transferWithAuthorization` call
   - Check event logs

2. **Test on other chains:**

   - Update `.env` with different chain
   - Run `npm run fund` for that chain
   - Run demo again

3. **Integrate into your app:**

   - See `buyer/agent.ts` for client implementation
   - See `seller/server.ts` for seller implementation
   - See `PROTOCOL_FLOW.md` for detailed specs

4. **Implement escrow-deferred scheme:**
   - Design vault contract
   - Implement optimistic delivery
   - Add batch settlement

---

## Resources

- **Protocol Flow:** `PROTOCOL_FLOW.md` - Detailed specification
- **Quick Start:** `QUICK_START.md` - Setup and basic usage
- **README:** `README.md` - Project overview and architecture
- **EIP-3009:** https://eips.ethereum.org/EIPS/eip-3009
- **Polygon x402:** https://github.com/hamiha70/x402_exploration
