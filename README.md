# x402-escrow

Reference implementation for **HTTP 402 Payment Required** with synchronous on-chain settlement.

Built for **ETHGlobal Brussels 2025** • Implements [Polygon's x402 specification](https://agentic-docs.polygon.technology/general/x402/)

## 🌟 Features

- ✅ **Synchronous Settlement**: Payment settles on-chain BEFORE content delivery
- ✅ **Polygon x402 Compliant**: Matches official HTTP 402 specification with EIP-3009
- ✅ **EIP-3009 Gasless Transfers**: NO APPROVAL NEEDED - signature is authorization
- ✅ **Multi-Chain**: Works on Base, Ethereum, Arbitrum, Optimism, Polygon, Arc
- ✅ **Replay Protection**: Nonce tracking prevents double-spend attacks
- ✅ **No Custom Contracts**: Uses USDC's built-in EIP-3009 `transferWithAuthorization`

## 🏗️ Architecture

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

### Payment Flow

1. **Buyer** requests protected content
2. **Seller** responds `402 Payment Required` + payment requirements
3. **Buyer** signs EIP-3009 TransferWithAuthorization (EIP-712) and retries with `X-PAYMENT` header
4. **Seller** forwards payment to **Facilitator**
5. **Facilitator** validates signature and executes `transferWithAuthorization` (USDC: buyer → seller)
6. **Facilitator** waits for blockchain confirmation (gasless for buyer, NO APPROVAL NEEDED)
7. **Seller** delivers content only after confirmed settlement

## 🚀 Quick Start

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
cp example.env .env
# Edit .env with your wallet addresses and private keys
```

### 3. Fund Wallets (Multi-Chain)

```bash
# Check balances across all networks
npm run balances

# Fund buyer, seller, facilitator on all networks
npm run fund
```

### 4. Run Demo

**No approval needed!** EIP-3009 eliminates the approval step.

**Terminal 1 - Facilitator:**

```bash
npm run facilitator
```

**Terminal 2 - Seller:**

```bash
npm run seller
```

**Terminal 3 - Buyer:**

```bash
npm run buyer
```

## 🌐 Supported Networks

| Network          | Chain ID | USDC Address                                 | Status    |
| ---------------- | -------- | -------------------------------------------- | --------- |
| Base Sepolia     | 84532    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | ✅ Tested |
| Ethereum Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | ✅ Ready  |
| Arbitrum Sepolia | 421614   | `0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d` | ✅ Ready  |
| Optimism Sepolia | 11155420 | `0x5fd84259d66cd46123540766be93dfe6d43130d7` | ✅ Ready  |
| Polygon Amoy     | 80002    | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` | ✅ Ready  |
| Arc Testnet      | TBD      | `0x3600000000000000000000000000000000000000` | ✅ Ready  |

## 📋 Project Structure

```
x402-escrow/
├── shared/              # Shared TypeScript types and utilities
│   ├── types.ts         # PaymentIntent, PaymentPayload, etc.
│   ├── eip712.ts        # EIP-712 signing and verification
│   └── logger.ts        # Colored logging utility
├── facilitator/         # Payment validation and settlement
│   └── server.ts        # POST /settle endpoint
├── seller/              # Content server with 402 protection
│   └── server.ts        # GET /api/content/premium
├── buyer/               # Automated buyer agent
│   └── agent.ts         # Request → Sign → Pay → Receive
├── scripts/             # Utility scripts
│   ├── check_balances.sh     # Multi-chain balance checker
│   ├── fund_wallets.sh       # Multi-chain wallet funding
│   └── approve_facilitator.ts # USDC approval script
├── foundry.toml         # Foundry configuration
├── package.json         # Node.js dependencies and scripts
└── QUICK_START.md       # Detailed setup guide
```

## 🔑 Key Components

### Facilitator (Port 4023)

- **POST /settle**: Validates EIP-3009 signature and executes `transferWithAuthorization`
- Checks signature, nonce, expiry, token, chain ID
- Executes synchronous on-chain settlement (NO APPROVAL NEEDED)
- Returns `PaymentResponse` with transaction hash
- Gasless for buyers - facilitator pays gas

### Seller (Port 4022)

- **GET /api/content/premium**: Protected endpoint
- Returns `402` with `PaymentRequirements` on first request
- Forwards payment to facilitator for settlement
- Delivers content only after confirmed settlement
- Includes `X-PAYMENT-RESPONSE` header with txHash

### Buyer Agent

- Automated payment flow
- Signs PaymentIntent using EIP-712
- Waits for synchronous settlement
- Receives content + payment confirmation

## 🛠️ Development

### Run Tests

```bash
# Foundry tests (when contracts added)
npm run test

# Fork tests against Base Sepolia
npm run test:fork:base
```

### Scripts

```bash
npm run balances    # Check wallet balances (all chains)
npm run fund        # Fund wallets (all chains)
npm run facilitator # Start facilitator server
npm run seller      # Start seller server
npm run buyer       # Run buyer payment flow (no approval needed!)
```

## 📊 Polygon x402 Compliance

This implementation follows [Polygon's x402 specification](https://agentic-docs.polygon.technology/general/x402/how-it-works/):

- ✅ **HTTP 402 Status Code**: Returns 402 for unpaid requests
- ✅ **PaymentRequirements**: Structured payment info in 402 response
- ✅ **X-PAYMENT Header**: Buyer sends payment in standardized header
- ✅ **X-PAYMENT-RESPONSE**: Seller confirms settlement
- ✅ **Synchronous Settlement**: Payment confirmed before delivery
- ✅ **EIP-712 Signatures**: Cryptographic authorization
- ✅ **Multi-Chain**: Works on any EVM chain

### Alignment with Polygon Reference

- ✅ Uses **EIP-3009** (`transferWithAuthorization`) - same as Polygon
- ✅ **Synchronous settlement** - payment confirmed before content delivery
- ✅ **NO APPROVAL NEEDED** - signature serves as authorization (gasless for buyer)
- ✅ **Facilitator executes settlement** - standard x402 pattern

## 🔐 Security

- **Replay Protection**: Nonce tracking (off-chain + on-chain)
- **Signature Verification**: EIP-712 domain binding
- **Expiry Enforcement**: Intents expire after set time
- **Chain ID Binding**: Prevents cross-chain replay attacks
- **Amount Verification**: Exact amount matching required

## 🎯 Future Enhancements

- [ ] Batch settlement for gas optimization
- [ ] Deferred settlement option
- [ ] Vault-based escrow mode
- [ ] ZK-privacy layer
- [ ] EIP-3009 integration (gasless approvals)
- [ ] Multi-token support beyond USDC
- [ ] Refund mechanisms
- [ ] Subscription models

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [Polygon x402 Documentation](https://agentic-docs.polygon.technology/general/x402/)
- [HTTP 402 Payment Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)
- [EIP-712: Typed Data Signing](https://eips.ethereum.org/EIPS/eip-712)
- [Circle USDC](https://www.circle.com/en/usdc)
- [Foundry Book](https://book.getfoundry.sh/)

## 📧 Contact

Built for ETHGlobal Brussels 2025

---

**⚠️ Testnet Only**: This is a reference implementation for testing. Do not use with real funds.
