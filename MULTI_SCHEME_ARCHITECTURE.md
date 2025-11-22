# Multi-Scheme Architecture Proposal

## Overview

Support 3 progressive payment schemes with multi-chain capability:

1. **x402-exact** (IMPLEMENTED ✅)

   - Synchronous settlement before content delivery
   - EIP-3009 `transferWithAuthorization` (gasless)
   - Multi-chain: Base, Polygon, Arbitrum, Optimism, Ethereum

2. **x402-escrow-deferred** (TO IMPLEMENT)

   - Instant content delivery
   - Batched settlement via Vault contract
   - Pre-deposited funds in escrow

3. **x402-private-escrow-deferred** (FUTURE)
   - Same as escrow-deferred + privacy (ZK proofs)
   - Anonymous multi-buyer/multi-seller batches

## Design Challenge

**Parameters to handle**:

- Multiple schemes (exact, escrow-deferred, private)
- Multiple chains (6+ testnets)
- Multiple endpoints per scheme+chain combination
- Scheme-specific logic (immediate vs deferred settlement)

**Anti-pattern**:

```
/api/content/premium/exact/base-sepolia           ❌ Too many endpoints
/api/content/premium/exact/polygon-amoy
/api/content/premium/escrow-deferred/base-sepolia
/api/content/premium/private/base-sepolia
... (18+ endpoints for 3 schemes × 6 chains)
```

## Proposed Architecture

### 1. **Scheme Selection via Query Parameter** ✅

```
GET /api/content/premium/base-sepolia?scheme=exact
GET /api/content/premium/base-sepolia?scheme=escrow-deferred
GET /api/content/premium/base-sepolia?scheme=private

Default: scheme=exact (backwards compatible)
```

**Why**:

- ✅ Chain explicit in path (clear, SEO-friendly)
- ✅ Scheme as parameter (optional, defaults to exact)
- ✅ Fewer endpoints (6 instead of 18+)
- ✅ Easy to add new schemes without new routes

### 2. **Seller: Strategy Pattern**

```typescript
// seller/strategies/PaymentStrategy.ts
interface PaymentStrategy {
  scheme: string;
  generateRequirements(
    resource: string,
    chain: ChainConfig
  ): PaymentRequirements;
  validatePayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<ValidationResult>;
  shouldSettleImmediately(): boolean;
}

// seller/strategies/ExactStrategy.ts
class ExactStrategy implements PaymentStrategy {
  scheme = "x402-exact";

  generateRequirements(resource, chain) {
    return {
      scheme: "intent",
      network: chain.networkSlug,
      token: chain.usdc,
      facilitator: `${FACILITATOR_URL}/settle/exact`,
      // ... EIP-3009 specific
    };
  }

  shouldSettleImmediately() {
    return true; // Synchronous
  }
}

// seller/strategies/EscrowDeferredStrategy.ts
class EscrowDeferredStrategy implements PaymentStrategy {
  scheme = "x402-escrow-deferred";

  generateRequirements(resource, chain) {
    return {
      scheme: "x402-escrow-deferred",
      vault: getVaultAddress(chain),
      escrow: { type: "vault-pool", mode: "deferred" },
      facilitator: `${FACILITATOR_URL}/validate-intent`,
      // ... Vault specific
    };
  }

  shouldSettleImmediately() {
    return false; // Deferred
  }
}

// seller/StrategyRegistry.ts
const strategies = new Map<string, PaymentStrategy>([
  ["exact", new ExactStrategy()],
  ["escrow-deferred", new EscrowDeferredStrategy()],
  // ["private", new PrivateStrategy()], // Future
]);
```

**Seller endpoint handler**:

```typescript
app.get("/api/content/premium/:chainSlug", async (req, res) => {
  const chainSlug = req.params.chainSlug;
  const schemeName = req.query.scheme || "exact"; // Default to exact

  const chain = getChainBySlug(chainSlug);
  const strategy = strategies.get(schemeName);

  if (!strategy) {
    return res.status(400).json({ error: `Unknown scheme: ${schemeName}` });
  }

  // Check for payment
  const paymentHeader = req.headers["x-payment"];

  if (!paymentHeader) {
    // Return 402 with scheme-specific requirements
    const requirements = strategy.generateRequirements(req.path, chain);
    return res.status(402).json({
      error: "Payment required",
      PaymentRequirements: [requirements],
    });
  }

  // Validate payment (strategy-specific)
  const validation = await strategy.validatePayment(payload, requirements);

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Deliver content (immediate for all schemes)
  return res
    .status(200)
    .header("x-payment-response", JSON.stringify(validation.receipt))
    .json({ content: PREMIUM_CONTENT });
});
```

### 3. **Facilitator: Route-Based Separation**

```typescript
// facilitator/routes/exact.ts
router.post("/settle/exact", async (req, res) => {
  // Synchronous settlement (current implementation)
  // Uses EIP-3009 transferWithAuthorization
  // Returns immediately with txHash
});

// facilitator/routes/escrow-deferred.ts
router.post("/validate-intent", async (req, res) => {
  // Validates intent against vault
  // Adds to settlement queue
  // Returns receipt with status "pending"
  // Does NOT settle on-chain yet
});

// facilitator/routes/settlement-worker.ts (background)
// Periodic worker that:
// - Reads pending intents from queue
// - Batches them
// - Calls vault.batchWithdraw()
// - Updates queue with results
```

**Facilitator structure**:

```
facilitator/
├── server.ts                  # Main app
├── routes/
│   ├── exact.ts              # POST /settle/exact (sync)
│   ├── escrow-deferred.ts    # POST /validate-intent (async)
│   └── health.ts             # GET /health
├── services/
│   ├── ExactSettlement.ts    # EIP-3009 logic
│   ├── VaultValidation.ts    # Vault balance checks
│   └── SettlementQueue.ts    # Queue management
└── workers/
    └── BatchSettler.ts        # Background worker for deferred
```

### 4. **Buyer: Scheme-Aware Agent**

```typescript
// buyer/strategies/SchemeStrategy.ts
interface SchemeStrategy {
  createPayload(
    requirements: PaymentRequirements,
    wallet: Wallet
  ): Promise<PaymentPayload>;
}

// buyer/strategies/ExactScheme.ts
class ExactScheme implements SchemeStrategy {
  async createPayload(requirements, wallet) {
    // Sign x402 intent
    // Sign EIP-3009 authorization
    // Return payload with both signatures
  }
}

// buyer/strategies/EscrowDeferredScheme.ts
class EscrowDeferredScheme implements SchemeStrategy {
  async createPayload(requirements, wallet) {
    // Check vault balance
    // Deposit if needed
    // Sign vault-domain intent
    // Return payload for deferred validation
  }
}

// buyer/agent.ts
const schemeStrategies = {
  intent: new ExactScheme(),
  "x402-escrow-deferred": new EscrowDeferredScheme(),
};

async function handlePaymentRequirement(requirements) {
  const scheme = requirements.scheme || "intent";
  const strategy = schemeStrategies[scheme];

  if (!strategy) {
    throw new Error(`Unsupported scheme: ${scheme}`);
  }

  return await strategy.createPayload(requirements, wallet);
}
```

### 5. **Chain Configuration: Centralized**

```typescript
// shared/chain-config.ts
export interface ChainConfig {
  chainId: number;
  name: string;
  networkSlug: string;
  rpc: string;
  usdc: string;
  vault?: string; // For escrow-deferred
  explorer: string;
  supportsEIP3009: boolean;
}

export const CHAINS: Record<number, ChainConfig> = {
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    networkSlug: "base-sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC!,
    usdc: process.env.USDC_BASE_SEPOLIA!,
    vault: process.env.VAULT_BASE_SEPOLIA, // Added for escrow
    explorer: process.env.BASE_SEPOLIA_EXPLORER!,
    supportsEIP3009: true,
  },
  // ... other chains
};
```

## Implementation Plan

### Phase 1: Refactor Current (Exact) ✅

- [x] Multi-chain seller endpoints
- [x] Multi-chain facilitator
- [x] Dynamic provider selection
- [x] Demo on Base & Polygon

### Phase 2: Add Strategy Pattern (This PR)

- [ ] Extract `ExactStrategy` from current seller code
- [ ] Create `StrategyRegistry`
- [ ] Add `?scheme=` query parameter support
- [ ] Refactor facilitator routes (`/settle/exact`)
- [ ] Update buyer to detect scheme
- [ ] Keep exact behavior identical (backwards compatible)

### Phase 3: Implement Escrow-Deferred

- [ ] Deploy Vault contracts (per chain)
- [ ] Add `EscrowDeferredStrategy` to seller
- [ ] Add `/validate-intent` to facilitator
- [ ] Implement `SettlementQueue`
- [ ] Create `BatchSettler` worker
- [ ] Update buyer for vault deposits
- [ ] E2E test: escrow-deferred flow

### Phase 4: Multi-Scheme Demo

- [ ] Update `run_demo_exact.sh` → `run_demo.sh --scheme=exact`
- [ ] Add `run_demo.sh --scheme=escrow-deferred`
- [ ] Performance comparison (latency, gas)

## File Structure (Proposed)

```
x402-escrow/
├── shared/
│   ├── chain-config.ts        # Centralized chain definitions
│   ├── types.ts               # Shared interfaces
│   └── strategies/            # NEW: Scheme interfaces
│       └── PaymentStrategy.ts
├── seller/
│   ├── server.ts              # Route handler
│   ├── strategies/            # NEW: Scheme implementations
│   │   ├── ExactStrategy.ts
│   │   └── EscrowDeferredStrategy.ts
│   └── StrategyRegistry.ts    # NEW: Strategy lookup
├── facilitator/
│   ├── server.ts              # Main app
│   ├── routes/                # NEW: Scheme-specific routes
│   │   ├── exact.ts           # /settle/exact
│   │   └── escrow-deferred.ts # /validate-intent
│   ├── services/              # NEW: Business logic
│   │   ├── ExactSettlement.ts
│   │   ├── VaultValidation.ts
│   │   └── SettlementQueue.ts
│   └── workers/               # NEW: Background jobs
│       └── BatchSettler.ts
├── buyer/
│   ├── agent.ts               # Main logic
│   └── strategies/            # NEW: Scheme handlers
│       ├── ExactScheme.ts
│       └── EscrowDeferredScheme.ts
├── contracts/                 # NEW: Vault contracts
│   └── Vault.sol
└── scripts/
    └── run_demo.sh            # Updated: --scheme parameter
```

## Benefits

1. **Extensibility**: Add new schemes without touching existing code
2. **Testability**: Each strategy is independently testable
3. **Clarity**: Scheme logic is isolated, not mixed
4. **Multi-chain**: Chain config works with any scheme
5. **Backwards Compatible**: Default to "exact" scheme

## Trade-offs

### Considered: Separate Endpoints

```
/api/content/premium/base-sepolia      (exact)
/api/content/escrow/premium/base-sepolia (escrow-deferred)
```

❌ Rejected: Different resource paths break x402 resource binding

### Considered: Header-Based Scheme

```
X-Scheme: escrow-deferred
```

❌ Rejected: Can't discover schemes from URL, breaks REST

### Chosen: Query Parameter

```
?scheme=escrow-deferred
```

✅ Best of both: discoverability + single resource path

## Questions for You

1. **Vault Deployment**: One vault per chain, or one global vault?

   - Recommendation: One per chain (simpler multi-chain logic)

2. **Queue Storage**: File, database, or in-memory?

   - Recommendation: SQLite for hackathon (simple, persistent)

3. **Worker Trigger**: Cron, manual, or on-demand?

   - Recommendation: Manual for demo, then add cron

4. **Backwards Compatibility**: Keep exact as default?
   - Recommendation: Yes, `?scheme=exact` optional

Ready to proceed with Phase 2 (Strategy Pattern refactor)?
