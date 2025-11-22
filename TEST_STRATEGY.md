# Test Strategy & Organization

## Test Categories

### 1. Unit Tests (`test/unit/**/*.test.ts`)
**Pure logic tests - No blockchain interaction**
- Strategy pattern (registries, routing)
- Queue management (in-memory operations)
- Validation logic (signature verification with known inputs)
- Fast execution (<1s total)

### 2. E2E Tests with Real Chain (`test/e2e/**/*.test.ts`)
**Full integration with deployed contracts**
- Requires: RPC connection, funded wallets, deployed contracts
- Tests: x402-exact (uses real USDC EIP-3009)
- Slow execution (10-30s per test due to block confirmations)
- Environment-dependent (testnet congestion)

### 3. E2E Tests with Mock Chain (`test/e2e-mock/**/*.test.ts`)
**Full integration WITHOUT deployed contracts**
- Requires: RPC connection (for USDC domain queries only)
- Tests: x402-escrow-deferred (Vault not deployed yet)
- Medium execution (2-5s per test)
- **MUST migrate to real chain tests after Vault deployment**

## Naming Convention

```typescript
describe("ExactStrategy (Seller)", () => {
  // Pure unit test
  it("should generate correct payment requirements", () => {});
});

describe("E2E x402-exact [REAL_CHAIN]", () => {
  // Uses deployed USDC contracts
  it("should complete full payment flow", () => {});
});

describe("E2E x402-escrow-deferred [MOCK_CHAIN]", () => {
  // Vault contract not deployed - HTTP flow only
  it("should validate and queue intent", () => {});
});
```

## Test Markers

### `[REAL_CHAIN]` Tests
- ✅ Uses actual deployed contracts (USDC, Vault)
- ✅ On-chain transactions executed
- ✅ Gas costs incurred
- ✅ Block confirmations awaited
- ⚠️ Requires funded wallets
- ⚠️ Slow (network latency)

### `[MOCK_CHAIN]` Tests  
- ⚠️ Simulates contract behavior
- ⚠️ No actual on-chain settlement
- ⚠️ Queue operations only
- ⚠️ **TEMPORARY** - must be replaced after deployment
- ✅ Fast (no block confirmations)
- ✅ No gas costs

## Migration Path

### Current State (Phase 2 - Escrow-Deferred Implementation)
```
test/
├── unit/                      ✅ 28 tests (pure logic)
├── e2e/
│   └── exact-baseline.test.ts ✅ 1 test [REAL_CHAIN]
└── e2e-mock/
    └── escrow-deferred.test.ts 🚧 TBD [MOCK_CHAIN]
```

### After Vault Deployment (Phase 2 Complete)
```
test/
├── unit/                      ✅ 28 tests
├── e2e/
│   ├── exact-baseline.test.ts ✅ [REAL_CHAIN]
│   └── escrow-deferred.test.ts ✅ [REAL_CHAIN] (migrated!)
└── e2e-mock/                   ❌ DELETED (no longer needed)
```

### Future (Phase 3 - ZK Privacy)
```
test/
├── unit/                       ✅ ~40 tests
├── e2e/
│   ├── exact-baseline.test.ts           ✅ [REAL_CHAIN]
│   ├── escrow-deferred.test.ts          ✅ [REAL_CHAIN]
│   └── private-escrow-deferred.test.ts  ✅ [REAL_CHAIN]
└── e2e-mock/                             ❌ EMPTY
```

## Forge Integration

### Mock Expectations Testing
Once Vault is deployed, we can verify our mock assumptions:

```solidity
// test/foundry/VaultMockValidation.t.sol
contract VaultMockValidationTest is Test {
    // Load the same intents used in [MOCK_CHAIN] tests
    // Verify they would have succeeded/failed as expected
    
    function test_MockedIntentsMatchRealBehavior() public {
        // 1. Load intent from TypeScript test
        // 2. Execute batchWithdraw on real Vault
        // 3. Assert result matches mock expectation
    }
}
```

### Suggested npm Scripts
```json
{
  "test:unit": "mocha test/unit/**/*.test.ts",
  "test:e2e": "mocha test/e2e/**/*.test.ts",
  "test:e2e-mock": "mocha test/e2e-mock/**/*.test.ts",
  "test:all-mock": "npm run test:unit && npm run test:e2e-mock",
  "test:all-real": "npm run test:unit && npm run test:e2e",
  "test:validate-mocks": "forge test --match-contract VaultMockValidation"
}
```

## CI/CD Strategy

### Pull Request Checks (Fast)
```bash
npm run test:unit          # 28 tests, <1s
npm run test:e2e-mock      # Fast HTTP-only tests
```

### Pre-Deploy Checks (Thorough)
```bash
npm run test:all-real      # Full e2e with testnet
```

### Post-Deploy Validation
```bash
npm run test:validate-mocks  # Verify mocks matched reality
```

## Key Principles

1. **Mock tests are TEMPORARY scaffolding**
   - Delete after contract deployment
   - Never commit long-term reliance on mocks

2. **Mark clearly in test names**
   - `[MOCK_CHAIN]` = will be replaced
   - `[REAL_CHAIN]` = permanent

3. **Fast feedback loop**
   - Unit tests run in CI on every commit
   - E2E tests run pre-deploy only

4. **Forge validates TypeScript mocks**
   - Cross-language test consistency
   - Prevents divergence between mock and reality

## Example Test File Structure

```typescript
// test/e2e-mock/escrow-deferred.test.ts
describe("E2E x402-escrow-deferred [MOCK_CHAIN]", () => {
  // ⚠️ WARNING: This test uses MOCK Vault behavior
  // ⚠️ TODO: Migrate to test/e2e/ after Vault deployment
  // ⚠️ Then validate mocks with: npm run test:validate-mocks
  
  it("should validate intent and queue for settlement", async () => {
    // Test HTTP flow only
    // Facilitator queues intent (no on-chain call)
    // Content delivered immediately
  });
});
```

## Benefits

✅ **Clear expectations** - Everyone knows which tests are temporary  
✅ **Fast iteration** - Can develop HTTP flow without waiting for deployment  
✅ **Safe migration** - Mocks can be validated against real contracts  
✅ **No tech debt** - Explicit markers ensure mocks don't linger  
✅ **Forge integration** - Cross-language test validation

