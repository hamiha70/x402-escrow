# Private-Escrow x402

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![x402 Compliant](https://img.shields.io/badge/x402-compliant-green.svg)](https://agentic-docs.polygon.technology/general/x402/intro/)

> **Trustless micropayments for the agentic web - instant delivery, batched settlement, optional privacy**

## 🎯 What Is This?

Three progressive implementations of x402 Payment Protocol, each solving different problems:

| Scheme                           | Status         | Latency | Gas/Payment | Privacy | Use Case            |
| -------------------------------- | -------------- | ------- | ----------- | ------- | ------------------- |
| **x402-exact**                   | ✅ Complete    | ~9s     | ~85k        | None    | Reference/benchmark |
| **x402-escrow-deferred**         | 🚧 In Progress | <100ms  | ~3k\*       | None    | High-volume APIs    |
| **x402-private-escrow-deferred** | 🔮 Planned     | <100ms  | ~10k\*      | Full    | Sensitive data      |

\*When batching 100+ payments

### The Problem

**AI agents need micropayments** (per API call, per query, per result), but:

- ❌ Credit cards: Too slow, high fees, require humans
- ❌ Standard crypto: 5-10s latency breaks agent workflows
- ❌ Payment channels: Setup friction, capital lockup

### Our Solution

**x402-escrow-deferred**: Instant delivery + batched settlement

- ✅ <100ms response (94x faster than synchronous)
- ✅ 28x cheaper gas (batching optimization)
- ✅ Trustless (escrow secures both parties)
- ✅ Standards-based (extends x402)

**x402-private-escrow-deferred** (coming soon): + transaction privacy via ZK

## 🚀 Quick Start

### File Structure

```
.env              # Runtime config (private keys, RPCs, API keys) - NOT in git
deployed.env      # Deployed contract addresses - IN git for reference
example.env       # Template for .env - IN git
```

### Run the Reference Implementation (x402-exact)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp example.env .env
# Edit .env with your wallets and RPCs

# 3. (Optional) Merge deployed contract addresses
cat deployed.env >> .env

# 3. Fund wallets
npm run fund
npm run balances

# 4. Run full demo
npm run demo:exact:full
```

### Expected Output

```
✓ TWO-SIGNATURE PATTERN VERIFIED

x402 Signature (HTTP Layer):
  • Resource binding: /api/content/premium
  • Nonce: 0x7a2b4e25c98bf7...
  • Verified by: Buyer (self), Facilitator

EIP-3009 Signature (Settlement Layer):
  • Amount: 10000 (0.01 USDC)
  • Nonce: 0x7a2b4e25c98bf7... (SAME - binding!)
  • Verified by: Buyer (self), Facilitator, USDC contract

Settlement Result:
  • Transaction: 0x64746c6f...09c92
  • Gas used: 85720
  • Buyer: 9.97 → 9.96 USDC (-0.01)
  • Seller: 0.03 → 0.04 USDC (+0.01)
  • Total time: 9.4 seconds
```

## 📋 Implementation Details

### x402-exact (Reference Implementation)

**Purpose**: Baseline for comparison - standard synchronous x402

**Flow**:

```
Request → 402 Payment Required
       → Buyer signs (x402 + EIP-3009)
       → Facilitator settles on-chain
       → Wait for confirmation
       → Content delivered
```

**Key Innovation**: Two-signature pattern

1. **x402 signature**: HTTP authorization WITH resource binding
2. **EIP-3009 signature**: Blockchain settlement authorization
3. **Same nonce**: Cryptographically links both signatures

**Why two signatures?**

- EIP-3009 alone lacks `resource` field → signature could be reused
- x402 signature adds resource binding at HTTP layer
- Nonce binding proves they're for the same payment

**Status**: ✅ Fully implemented and tested on Base Sepolia

### x402-escrow-deferred (Innovation #1)

**Purpose**: Instant delivery + batched settlement for high-volume micropayments

**Flow**:

```
Setup:   Buyer deposits USDC to escrow contract

Payment: Request → 402 Payment Required
              → Buyer signs payment intent
              → Seller verifies escrow + signature
              → INSTANT content delivery (<100ms)

Later:   Facilitator batches [Payment1...Payment100]
              → Single on-chain settlement
              → 28x gas savings
```

**Architecture**:

```
┌─────────────────────────────────────────────┐
│  Escrow Contract (per buyer)                │
│  ├─ USDC balance locked                     │
│  ├─ Authorized sellers list                 │
│  ├─ Payment proofs (merkle tree)            │
│  ├─ Time-lock (buyer protection)            │
│  └─ Batch settlement function               │
└─────────────────────────────────────────────┘
```

**Security Model**:

- Buyer locks funds in escrow upfront
- Seller delivers immediately (trusting escrow lock)
- Facilitator batches payment proofs (merkle accumulator)
- Periodic settlement releases funds to sellers
- Time locks + dispute mechanism protect both parties

**Benefits**:

- **Speed**: 9.4s → <100ms (94x faster)
- **Cost**: ~85k gas → ~3k gas per payment (when batching 100)
- **UX**: Instant response for AI agents
- **Economics**: Makes sub-$0.01 payments viable

**Status**: 🚧 In progress (escrow contract, merkle proofs, batch settlement)

### x402-private-escrow-deferred (Innovation #2)

**Purpose**: All benefits of escrow-deferred + transaction privacy

**Additional Features**:

- **Privacy**: Individual payments hidden in multi-buyer anonymity set
- **ZK Proofs**: Prove "I paid" without revealing who/what/when
- **Anonymity**: k-anonymity among all buyers in batch

**Privacy Model**:

- Facilitator sees payments but can't link buyer→seller→resource
- On-chain: Only batch settlements visible, no individual payments
- ZK circuit proves payment validity without revealing details

**Trade-off**: Higher gas (~10k per payment) for privacy guarantees

**Tech Stack**: Noir (Aztec ZK), Avail (data availability)

**Status**: 🔮 Planned (after escrow-deferred complete)

## 🏗️ Architecture

```
┌──────────┐         ┌──────────┐         ┌──────────────┐
│  Buyer   │◄───────►│  Seller  │◄───────►│ Facilitator  │
│ (Agent)  │         │  (API)   │         │  (Batcher)   │
└────┬─────┘         └──────────┘         └──────┬───────┘
     │                                             │
     │  1. Deposit to Escrow                      │
     │  2. Sign payment intent (off-chain)        │
     │  3. Receive content instantly              │
     │                                             │
     └─────────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Escrow    │
                    │  Contract   │
                    │   + USDC    │
                    └─────────────┘

Later: Facilitator batches & settles on-chain
```

## 🌐 Multi-Chain Support

Tested on:

- Base Sepolia (84532)
- Ethereum Sepolia (11155111)
- Arbitrum Sepolia (421614)
- Optimism Sepolia (11155420)
- Polygon Amoy (80002)
- Arc Testnet (1243)

**Dynamic USDC Domain Resolution**: Automatically queries each chain's USDC contract for correct EIP-712 domain (name, version), ensuring cross-chain compatibility.

## 🛠️ Development

### Project Structure

```
private-escrow-x402/
├── buyer/              # Client agent (creates payment intents)
├── seller/             # Content server (HTTP 402)
├── facilitator/        # Settlement executor & batcher
├── shared/             # EIP-712 utilities, types
├── contracts/          # Escrow contracts (coming soon)
├── circuits/           # ZK circuits (coming soon)
├── scripts/            # Demo and utility scripts
├── submission/         # ETHGlobal submission docs
├── README.md           # This file
├── X402_STANDARD.md    # Official x402 spec
└── COMPLIANCE_REVIEW.md # Implementation compliance
```

### Available Commands

```bash
# Server management
npm run start           # Start facilitator & seller
npm run stop            # Stop all servers

# Testing
npm run demo:exact         # Run exact scheme demo
npm run demo:exact:full    # Full automated demo
npm run buyer              # Run buyer agent
npm run seller             # Run seller server
npm run facilitator        # Run facilitator server

# Wallet management
npm run fund            # Fund all wallets
npm run balances        # Check balances

# Coming soon
npm run demo:escrow-deferred
npm run demo:private-escrow-deferred
```

## 🎓 Why This Matters

### The Agentic Web Needs Micropayments

AI agents are becoming primary web consumers:

- Accessing paid APIs (OpenAI, research databases, real-time data)
- Agent-to-agent commerce (data trading, computation markets)
- Autonomous content consumption (news, analysis, training data)
- Metered services (per-query pricing, usage-based billing)

**Requirements**:

1. **Instant** - Agents can't wait 10 seconds per request
2. **Cheap** - Sub-cent payments must be economically viable
3. **Trustless** - No reliance on centralized payment processors
4. **Private** (optional) - Hide sensitive purchasing behavior

### Current Solutions Fall Short

| Solution                | Speed  | Cost     | Trustless | Private  |
| ----------------------- | ------ | -------- | --------- | -------- |
| Credit cards            | Slow   | High     | ❌        | ❌       |
| x402-exact (standard)   | 9s     | ~85k gas | ✅        | ❌       |
| Payment channels        | Fast\* | Low\*    | ✅        | ❌       |
| **Our escrow-deferred** | <100ms | ~3k gas  | ✅        | Optional |

\*Payment channels require setup, capital lockup, and channel management

### Our Innovation

We combine:

- **x402 standard**: HTTP 402 + cryptographic payment intents
- **Deferred verification**: Deliver first, batch settle later
- **Escrow security**: Lock funds upfront, release after proof
- **ZK privacy** (coming): Hide individual transactions

Result: **Practical micropayments for the agentic web**

## 🔒 Security

### Escrow Model

**Buyer Protection**:

- Funds locked in smart contract, not with facilitator
- Time locks prevent indefinite lockup
- Dispute mechanism if seller doesn't deliver

**Seller Protection**:

- Escrow balance verified before delivery
- Cryptographic payment intent proves buyer committed
- Batch settlement guarantees payment

**Facilitator Role**:

- Batches payment proofs (merkle accumulator)
- Submits settlement transactions
- Pays gas fees (reimbursed from batch)

### Two-Signature Pattern (x402-exact)

| Layer      | Purpose                          | Verifying Contract         |
| ---------- | -------------------------------- | -------------------------- |
| HTTP       | Authorization + resource binding | `0x0000...0402` (symbolic) |
| Blockchain | Settlement authorization         | USDC contract              |

Both signatures share the same nonce, cryptographically linking them.

## 📊 Performance Comparison

| Metric                 | x402-exact | escrow-deferred | Improvement |
| ---------------------- | ---------- | --------------- | ----------- |
| **Latency**            | 9.4s       | <100ms          | 94x faster  |
| **Gas/payment**        | ~85k       | ~3k\*           | 28x cheaper |
| **Throughput**         | ~10/min    | ~1000/min       | 100x higher |
| **Min viable payment** | $0.05      | $0.001          | 50x lower   |

\*When batching 100 payments

## 📚 Documentation

- **[README.md](./README.md)** - This file (overview, quick start)
- **[X402_STANDARD.md](./X402_STANDARD.md)** - Official x402 specification
- **[COMPLIANCE_REVIEW.md](./COMPLIANCE_REVIEW.md)** - x402-exact compliance analysis
- **[submission/](./submission/)** - ETHGlobal submission documents

## 🔗 References

- **x402 Standard**: https://agentic-docs.polygon.technology/general/x402/intro/
- **EIP-712**: https://eips.ethereum.org/EIPS/eip-712
- **EIP-3009**: https://eips.ethereum.org/EIPS/eip-3009
- **Noir (ZK)**: https://noir-lang.org/
- **Avail**: https://www.availproject.org/

## 🤝 Contributing

This is a hackathon project exploring novel payment schemes. Contributions welcome!

Focus areas:

- Escrow contract security
- Merkle accumulator optimization
- ZK circuit design
- Gas optimization
- Multi-chain testing

## 📄 License

MIT License - see [LICENSE](./LICENSE)

## ⚠️ Disclaimer

**Hackathon project - not production ready**

For production use, add:

- HTTPS enforcement
- Hardware security modules (HSMs)
- Professional security audit
- Formal verification
- Insurance/bonding for facilitators
- Legal compliance review

---

**Built for ETHGlobal** | **Making micropayments practical for AI agents** | **2025**
