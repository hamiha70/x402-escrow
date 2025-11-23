# x402 Demo UI

Interactive web-based demo that visualizes x402 payment flows in real-time.

## Features

- **Real-time visualization** of HTTP 402 payment flows via WebSocket
- **Two payment schemes**:
  - `x402-exact`: Synchronous on-chain settlement
  - `x402-escrow-deferred`: Instant delivery with deferred settlement
- **Multi-chain support**: Polygon Amoy, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Arc Testnet
- **No wallet popups**: Uses private keys from `.env` for automated flow
- **Clean coral/cream design** matching the project branding

## Quick Start

### 1. Setup Environment

Make sure your `.env` file is configured with:

- Wallet private keys (buyer, seller, facilitator)
- RPC URLs for testnets
- USDC contract addresses
- Deployed vault addresses (for escrow-deferred)

### 2. Run the Demo

```bash
npm run demo:ui
```

This will start the demo server on `http://localhost:3000` (or the port specified in `DEMO_PORT`).

### 3. Open in Browser

Navigate to `http://localhost:3000` and:

1. Select a network (default: Polygon Amoy)
2. Choose a payment scheme (exact or escrow-deferred)
3. Click "Run Demo Flow"
4. Watch the real-time visualization!

## Architecture

```
demo/
├── server.ts              # Express + WebSocket server
├── orchestrator.ts        # Payment flow orchestration
├── networks.ts            # Chain configuration
└── public/
    ├── index.html        # UI
    ├── styles.css        # Coral/cream styling
    └── app.js            # WebSocket client
```

## How It Works

1. **Demo Server** (`server.ts`):

   - Serves static frontend files
   - Provides REST endpoints: `/api/run-exact`, `/api/run-escrow-deferred`
   - Broadcasts events via WebSocket

2. **Orchestrator** (`orchestrator.ts`):

   - Internally runs buyer/seller/facilitator logic
   - Emits events at each step (HTTP requests, signatures, transactions)
   - Uses private keys from `.env` (no wallet popups)

3. **Frontend** (`public/`):
   - WebSocket client displays events in real-time
   - Shows HTTP 402 flow, EIP-712 signatures, blockchain transactions
   - Links to block explorers for transaction verification

## Event Types

- `step`: High-level flow step (e.g., "Buyer requests content")
- `http-request`: Outgoing HTTP request with headers/body
- `http-response`: Incoming HTTP response (402, 200, etc.)
- `signing`: EIP-712 signature generation
- `transaction`: Blockchain transaction (pending → confirmed)
- `complete`: Flow finished with metrics
- `error`: Error occurred

## Payment Schemes

### x402-exact

**Flow**:

1. Buyer requests content → 402 Payment Required
2. Buyer signs PaymentIntent (EIP-712)
3. Buyer signs TransferWithAuthorization (EIP-3009)
4. Facilitator executes on-chain settlement
5. Wait for transaction confirmation
6. Content delivered

**Metrics**:

- Latency: ~9 seconds
- Gas: ~85k units
- Privacy: None (public on-chain)

### Escrow-Deferred

**Flow**:

1. Check buyer's vault balance
2. Buyer requests content → 402 Payment Required
3. Buyer signs PaymentIntent (deferred)
4. Facilitator validates instantly (no on-chain wait)
5. Content delivered immediately
6. Settlement queued for batch processing

**Metrics**:

- Latency: <100ms
- Gas: ~3k per payment (when batched)
- Privacy: None (public on-chain)

## Network Configuration

Available networks are configured in `networks.ts`:

- **Polygon Amoy** (default)
- **Base Sepolia**
- **Arbitrum Sepolia**
- **Optimism Sepolia**
- **Arc Testnet**

Each network requires:

- RPC URL in `.env`
- USDC contract address
- (Optional) Vault contract address for escrow-deferred

## Troubleshooting

### "Network not found" error

Make sure the selected network has:

- RPC URL configured in `.env`
- USDC address configured in `.env`

### "Vault not deployed" error (escrow-deferred only)

Deploy the vault contract first:

```bash
npm run deploy:vault:polygon-amoy
```

Then add the deployed address to `.env`:

```bash
VAULT_POLYGON_AMOY=0x...
```

### WebSocket connection issues

Check that:

- Demo server is running on the expected port
- No firewall blocking WebSocket connections
- Browser supports WebSockets (all modern browsers do)

## Development

### Run with custom port

```bash
DEMO_PORT=8080 npm run demo:ui
```

### Add new network

1. Update `demo/networks.ts` with chain config
2. Add RPC URL and USDC address to `.env`
3. Deploy vault if using escrow-deferred
4. Add network option to `demo/public/index.html`

### Add new payment scheme

1. Implement flow in `demo/orchestrator.ts`
2. Add route in `demo/server.ts`
3. Add tab and description in `demo/public/index.html`
4. Update scheme descriptions in `demo/public/app.js`

## Notes

- This demo uses real blockchain transactions on testnets
- Private keys are read from `.env` (never commit these!)
- Transaction hashes link to block explorers for verification
- The demo simulates the full x402 payment protocol flow

## Coming Soon

- **TEE Facilitator**: Privacy-preserving payments via Oasis ROFL
- **ZK Private**: Zero-knowledge proof-based privacy
- **Batch Settlement**: Manual trigger for escrow-deferred settlements
- **Transaction History**: View past demo runs

---

**Built for ETHGlobal 2025** | **Oasis Privacy Track**
