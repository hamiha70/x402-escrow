# x402 Payment Protocol - Reference Implementation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![x402 Compliant](https://img.shields.io/badge/x402-compliant-green.svg)](https://agentic-docs.polygon.technology/general/x402/intro/)

A **fully compliant** reference implementation of the x402 Payment Protocol with **synchronous on-chain settlement** using EIP-3009 `transferWithAuthorization`.

## 🎯 What is x402?

x402 extends HTTP 402 Payment Required with cryptographic payment intents, enabling **micropayments for digital content and API access**. This implementation achieves full x402 compliance through a **two-signature pattern**:

1. **x402 Signature** - HTTP authorization with cryptographic resource binding
2. **EIP-3009 Signature** - Blockchain settlement without gas fees for payer

## ✨ Key Features

- ✅ **Two-Signature Pattern** - Complete cryptographic guarantees
- ✅ **Resource Binding** - Prevents signature reuse across endpoints
- ✅ **Nonce Binding** - Links HTTP authorization to blockchain settlement
- ✅ **Multi-Chain Support** - Works across EVM networks (Base, Ethereum, Arbitrum, Optimism, Polygon)
- ✅ **EIP-3009 Settlement** - Gasless USDC transfers (buyer pays no gas)
- ✅ **Synchronous Flow** - Payment settled before content delivery
- ✅ **Dynamic Domain Resolution** - Queries USDC contracts for correct EIP-712 domains

## 🏗️ Architecture

```
┌──────────┐         ┌──────────┐         ┌──────────────┐
│  Buyer   │◄───────►│  Seller  │◄───────►│ Facilitator  │
│ (Client) │         │ (Server) │         │   (Server)   │
└──────────┘         └──────────┘         └──────────────┘
     │                     │                       │
     │  x402 Signature     │                       │
     │  EIP-3009 Signature │                       │
     └─────────────────────┴───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ USDC Token  │
                    │ (EIP-3009)  │
                    └─────────────┘
```

### Components

- **Buyer** - Client that requests content and creates payment intents
- **Seller** - Content provider that requires payment
- **Facilitator** - Validates signatures and executes on-chain settlement
- **USDC** - ERC-20 stablecoin with EIP-3009 support

## 🚀 Quick Start

### Prerequisites

```bash
# Install Foundry (for blockchain tools)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install Node.js dependencies
npm install
```

### Configuration

1. **Copy environment template:**

   ```bash
   cp example.env .env
   ```

2. **Configure wallets and RPCs:**

   ```bash
   # Edit .env with your:
   # - Wallet addresses and private keys (seller, buyer, facilitator)
   # - RPC endpoints for target networks
   # - USDC contract addresses
   ```

3. **Fund wallets:**
   ```bash
   npm run fund    # Fund all wallets with native tokens and USDC
   npm run balances # Check balances
   ```

### Running the Demo

**Option 1: Full Automated Demo**

```bash
npm run demo:exact:full
```

This will:

1. Start facilitator and seller servers
2. Execute complete payment flow
3. Show detailed verification of both signatures
4. Display on-chain settlement results
5. Stop servers

**Option 2: Manual Testing**

```bash
# Terminal 1: Start servers
npm run start

# Terminal 2: Run demo
npm run demo:exact

# When done
npm run stop
```

### Expected Output

```
✓ TWO-SIGNATURE PATTERN VERIFIED

x402 Signature (HTTP Layer):
  • Resource binding: /api/content/premium
  • Nonce: 0x7a2b4e25c98bf7...
  • Domain: x402-Payment-Intent v2
  • Verified by: Buyer (self), Facilitator

EIP-3009 Signature (Settlement Layer):
  • Transfer: 0x0AE6EF... → 0x301541...
  • Amount: 10000 (raw units = 0.01 USDC)
  • Nonce: 0x7a2b4e25c98bf7... (SAME as x402)
  • Verified by: Buyer (self), Facilitator, USDC contract

Cryptographic Bindings:
  ✓ Nonce links both signatures
  ✓ Resource binding prevents signature reuse
  ✓ Seller binding ensures correct recipient
  ✓ Amount binding prevents manipulation

Settlement Result:
  • Transaction: 0x64746c6f...09c92
  • Block: 34007104
  • Gas used: 85720
  • Buyer balance: 9.97 → 9.96 USDC
  • Seller balance: 0.03 → 0.04 USDC
```

## 📋 Protocol Flow

### Phase 1: Initial Request (No Payment)

```http
GET /api/content/premium HTTP/1.1
Host: localhost:4022
```

**Response:**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "Payment required",
  "PaymentRequirements": [{
    "network": "base-sepolia",
    "token": "USDC",
    "tokenAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "0.01",
    "decimals": 6,
    "seller": "0x301541177dE41fBEF4924a911F1959185647b7A5",
    "resource": "/api/content/premium",
    "facilitator": "http://localhost:4023/settle",
    "chainId": 84532,
    "schemes": ["intent"],
    "expiresAt": 1732233600
  }]
}
```

### Phase 2: Buyer Creates TWO Signatures

**Step 2.1: Create Payment Intent**

```typescript
const intent: PaymentIntent = {
  seller: "0x301541177dE41fBEF4924a911F1959185647b7A5",
  buyer: "0x0AE6EF742a4347c9C5a9f7aF18b7455A6b78821E",
  amount: "10000", // 0.01 USDC (6 decimals)
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  nonce: "0x7a2b4e25c98bf7...",
  expiry: 1732233780,
  resource: "/api/content/premium", // ← RESOURCE BINDING
  chainId: 84532,
};
```

**Step 2.2: Sign with x402 Domain (HTTP Authorization)**

```typescript
// Domain for HTTP layer
const x402Domain = {
  name: "x402-Payment-Intent",
  version: "2",
  chainId: 84532,
  verifyingContract: "0x0000000000000000000000000000000000000402"
};

const x402Signature = await signer.signTypedData(
  x402Domain,
  { PaymentIntent: [...] },
  intent
);
// Result: Cryptographic proof of authorization for THIS resource
```

**Step 2.3: Convert to EIP-3009 Format**

```typescript
const transferAuth: TransferAuthorization = {
  from: intent.buyer,
  to: intent.seller,
  value: intent.amount,
  validAfter: 0,
  validBefore: intent.expiry,
  nonce: intent.nonce, // ← SAME NONCE (binding!)
};
```

**Step 2.4: Query USDC for Domain & Sign**

```typescript
// Dynamically query USDC contract
const usdcDomain = await getUSDCDomain(tokenAddress, chainId, provider);
// Returns: { name: "USDC", version: "2", chainId: 84532, verifyingContract: "0x036..." }

const eip3009Signature = await signer.signTypedData(
  usdcDomain,
  { TransferWithAuthorization: [...] },
  transferAuth
);
// Result: Authorization for USDC contract to execute transfer
```

### Phase 3: Payment Submission

```http
GET /api/content/premium HTTP/1.1
Host: localhost:4022
x-payment: {
  "scheme": "intent",
  "data": {
    "intent": {...},
    "x402Signature": "0xc7e20c...",
    "transferAuth": {...},
    "eip3009Signature": "0x0bde82..."
  }
}
```

### Phase 4: Facilitator Validates BOTH Signatures

**Step 4.1: Validate x402 Signature**

```typescript
const x402Recovered = verifyX402PaymentIntent(intent, x402Signature, chainId);
// Checks: Resource binding, nonce, expiry, signature validity
```

**Step 4.2: Validate EIP-3009 Signature**

```typescript
const eip3009Recovered = await verifyTransferAuthorizationWithProvider(
  transferAuth,
  eip3009Signature,
  tokenAddress,
  chainId,
  provider
);
// Checks: Signature matches buyer, nonce matches
```

**Step 4.3: Execute On-Chain Settlement**

```typescript
const tx = await usdcContract.transferWithAuthorization(
  transferAuth.from,
  transferAuth.to,
  transferAuth.value,
  transferAuth.validAfter,
  transferAuth.validBefore,
  transferAuth.nonce,
  v,
  r,
  s // EIP-3009 signature components
);
await tx.wait(); // Wait for confirmation
```

### Phase 5: Content Delivery

```http
HTTP/1.1 200 OK
Content-Type: application/json
x-payment-response: {
  "status": "settled",
  "txHash": "0x64746c6f2334c879...",
  "network": "base-sepolia"
}

{
  "content": {
    "title": "Premium AI Model Output",
    "data": { ... }
  },
  "payment": {
    "txHash": "0x64746c6f2334c879...",
    "amount": "10000"
  }
}
```

## 🔒 Security Features

### Two-Signature Pattern

| Layer      | Signature | Purpose                             | Verifying Contract         |
| ---------- | --------- | ----------------------------------- | -------------------------- |
| HTTP       | x402      | Authorization with resource binding | `0x0000...0402` (symbolic) |
| Blockchain | EIP-3009  | Settlement authorization            | USDC contract address      |

### Cryptographic Bindings

| Binding      | Implementation                | Security Benefit                          |
| ------------ | ----------------------------- | ----------------------------------------- |
| **Nonce**    | Same nonce in both signatures | Links HTTP auth to settlement             |
| **Resource** | In x402 signature             | Prevents signature reuse across endpoints |
| **Seller**   | In both signatures            | Ensures correct recipient                 |
| **Amount**   | In both signatures            | Prevents manipulation                     |
| **Buyer**    | Both signed by buyer          | Proves buyer authorization                |

### Replay Protection

- **Off-chain** - Facilitator tracks used nonces in memory
- **On-chain** - USDC contract's `authorizationState` prevents reuse
- **Expiry** - 3-minute validity window limits attack window

## 🌐 Multi-Chain Support

### Supported Networks

| Network          | Chain ID | USDC Address                                 |
| ---------------- | -------- | -------------------------------------------- |
| Base Sepolia     | 84532    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Arbitrum Sepolia | 421614   | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| Optimism Sepolia | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` |
| Polygon Amoy     | 80002    | `0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582` |
| Arc Testnet      | 1243     | `0xCc127bb4c1bE4e2ee33e38bcf7a3e7f5eCd7E1B1` |

### Dynamic Domain Resolution

The implementation automatically queries each USDC contract for its correct EIP-712 domain:

```typescript
export async function getUSDCDomain(
  tokenAddress: string,
  chainId: number,
  provider: ethers.Provider
): Promise<EIP712Domain> {
  const usdcContract = new ethers.Contract(tokenAddress, USDC_ABI, provider);

  const name = await usdcContract.name();
  const version = await usdcContract.EIP712_VERSION();

  return {
    name, // "USDC" or "USD Coin" depending on chain
    version, // "2" typically
    chainId,
    verifyingContract: tokenAddress,
  };
}
```

This ensures cross-chain compatibility without hardcoding domain values.

## 📊 Performance

### Typical Latency (Base Sepolia)

| Phase                           | Duration  | Percentage |
| ------------------------------- | --------- | ---------- |
| Initial Request                 | ~50ms     | 0.5%       |
| Dual Signing                    | ~1.3s     | 13.5%      |
| Payment Submission + Settlement | ~5.2s     | 54.7%      |
| On-Chain Verification           | ~1.6s     | 17.2%      |
| **Total**                       | **~9.4s** | **100%**   |

### Gas Costs

- **Buyer**: 0 gas (gasless EIP-3009 transfer)
- **Facilitator**: ~85,720 gas for `transferWithAuthorization`

## 🛠️ Development

### Project Structure

```
x402-escrow/
├── buyer/           # Client agent (creates payment intents)
├── seller/          # Content server (HTTP 402)
├── facilitator/     # Settlement executor
├── shared/          # Common types, EIP-712 utilities
├── scripts/         # Demo and utility scripts
├── README.md        # This file
├── X402_STANDARD.md # Official x402 specification
└── COMPLIANCE_REVIEW.md # Implementation compliance review
```

### Available Scripts

```bash
# Server Management
npm run start        # Start facilitator & seller
npm run stop         # Stop all servers

# Component Testing
npm run buyer        # Run buyer agent
npm run seller       # Run seller server
npm run facilitator  # Run facilitator server

# Demos
npm run demo:exact        # Run demo (servers must be running)
npm run demo:exact:full   # Full automated demo (start→test→stop)

# Wallet Management
npm run fund         # Fund wallets with native tokens and USDC
npm run balances     # Check balances across all networks
```

### Adding a New Chain

1. **Add RPC endpoint to `.env`:**

   ```bash
   NEW_CHAIN_RPC=https://rpc.newchain.example
   ```

2. **Add USDC address to `.env`:**

   ```bash
   USDC_NEW_CHAIN=0x...
   ```

3. **Update `foundry.toml`:**

   ```toml
   [rpc_endpoints]
   new_chain = "${NEW_CHAIN_RPC}"
   ```

4. **The code automatically handles the rest** through dynamic domain resolution!

## 📚 Documentation

- **[README.md](./README.md)** (this file) - Complete implementation guide
- **[X402_STANDARD.md](./X402_STANDARD.md)** - Official x402 protocol specification
- **[COMPLIANCE_REVIEW.md](./COMPLIANCE_REVIEW.md)** - Full compliance analysis and verification

## 🔗 References

- **x402 Standard**: https://agentic-docs.polygon.technology/general/x402/intro/
- **EIP-712**: https://eips.ethereum.org/EIPS/eip-712
- **EIP-3009**: https://eips.ethereum.org/EIPS/eip-3009
- **HTTP 402**: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

## 🤝 Contributing

This is a reference implementation for educational and demonstration purposes. Contributions, issues, and feature requests are welcome!

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

## ⚠️ Security Notice

**This implementation is for demonstration and testing purposes.**

For production use:

- Use HTTPS (not HTTP) for all communications
- Implement proper key management (not raw private keys in `.env`)
- Add rate limiting and DDoS protection
- Implement proper error handling and monitoring
- Consider using hardware security modules (HSMs) for facilitator keys
- Audit smart contracts and cryptographic implementations

## 🎓 Learn More

### Why Two Signatures?

The two-signature pattern provides complete cryptographic guarantees:

1. **x402 Signature** (HTTP Layer)

   - Binds payment to specific resource
   - Prevents signature reuse across endpoints
   - Works with any payment method (not just USDC)

2. **EIP-3009 Signature** (Settlement Layer)
   - Authorizes blockchain transfer
   - Enables gasless payments for buyer
   - Provides on-chain settlement guarantees

### Why Not Just EIP-3009?

EIP-3009 alone doesn't include the `resource` field, so a signature could theoretically be reused for different endpoints. The x402 signature adds resource binding at the HTTP layer, ensuring each signature is valid for exactly one resource.

### Comparison with Alternatives

| Approach                    | Resource Binding  | Gasless       | Settlement   |
| --------------------------- | ----------------- | ------------- | ------------ |
| **This Implementation**     | ✅ Cryptographic  | ✅ Yes        | Synchronous  |
| EIP-3009 Only               | ❌ Off-chain only | ✅ Yes        | Synchronous  |
| ERC-20 approve/transferFrom | ❌ Off-chain only | ❌ No         | Synchronous  |
| Payment Channels            | ✅ Cryptographic  | ⚠️ Setup cost | Asynchronous |

---

**Built for ETHGlobal** | **x402 Reference Implementation** | **2025**
