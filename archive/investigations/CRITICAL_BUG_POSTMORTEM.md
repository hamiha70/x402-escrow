# Critical Bug Postmortem: EIP-712 Field Order Mismatch

## Date
2025-11-22

## Severity
**CRITICAL** - Complete failure of escrow-deferred payment scheme

## Impact
- All batch settlement attempts failed with "Vault: invalid signature"
- 100% failure rate for escrow-deferred payments (5/5 intents failed)
- Exact scheme unaffected (uses different EIP-712 domain)

## Root Cause
**EIP-712 type definition field order mismatch** between:
1. `shared/types.ts` → `PAYMENT_INTENT_TYPES` (used by buyer & facilitator)
2. `src/Vault.sol` → `PAYMENT_INTENT_TYPEHASH` (used by on-chain verification)

### Incorrect Order (Bug)
```typescript
// shared/types.ts (WRONG)
PaymentIntent: [
    { name: "seller", type: "address" },  // ❌ SELLER FIRST
    { name: "buyer", type: "address" },
    ...
]
```

### Correct Order (Fix)
```typescript
// shared/types.ts (CORRECT)
PaymentIntent: [
    { name: "buyer", type: "address" },   // ✅ BUYER FIRST
    { name: "seller", type: "address" },
    ...
]
```

### Vault.sol Reference
```solidity
// src/Vault.sol
bytes32 public constant PAYMENT_INTENT_TYPEHASH =
    keccak256(
        "PaymentIntent(address buyer,address seller,...)"
        //              ^^^^^ BUYER FIRST
    );
```

## How It Happened

1. **Initial Implementation**: Vault.sol was correctly implemented with `buyer` first
2. **TypeScript Types**: `shared/types.ts` was created with `seller` first
3. **No Cross-Validation**: No test verified that TypeScript types matched Solidity contract
4. **Silent Failure**: Unit tests passed (mocked), but on-chain settlement failed

## Why It Wasn't Caught Earlier

### What DID Pass ✅
- Unit tests (no on-chain verification)
- E2E mock tests (used mock vault address, skipped deposit check)
- Exact scheme tests (uses different EIP-712 domain for USDC, not Vault)

### What FAILED ❌
- **First real batch settlement attempt** (multi-intent test)
- All 5 queued intents failed with "invalid signature"
- On-chain `Vault.batchWithdraw()` rejected all signatures

## Detection

### Manual Testing
User queued 5 intents via `scripts/queue-multiple-intents.sh` and triggered batch settlement:
```bash
curl -X POST http://localhost:4023/settle-batch
# Result: "Vault: invalid signature" for all intents
```

### Test Suite Gap
- No EIP-712 consistency test across TypeScript ↔ Solidity boundary
- No test verified signature recovery matches expected signer

## Fix

### Code Change
```diff
export const PAYMENT_INTENT_TYPES = {
    PaymentIntent: [
+       { name: "buyer", type: "address" },   // BUYER FIRST
        { name: "seller", type: "address" },
-       { name: "buyer", type: "address" },
        { name: "amount", type: "uint256" },
        ...
    ],
};
```

### New Test Coverage
Created `test/unit/eip712-consistency.test.ts` with:
1. ✅ Field order validation (matches Vault.sol)
2. ✅ Type validation (correct types for all fields)
3. ✅ End-to-end signature verification
4. ✅ Negative test: wrong field order MUST fail
5. ✅ Negative test: wrong domain MUST fail

### Canary Suite
Created `test/canary/critical-path.test.ts` for fast (<5s) smoke tests:
- Catches EIP-712 field order bugs immediately
- Runs before full test suite to fail fast
- Validates critical type definitions

## Prevention Measures

### Immediate
1. ✅ Fix field order in `shared/types.ts`
2. ✅ Add EIP-712 consistency test
3. ✅ Add canary suite for fast smoke tests
4. 🔜 Run full test suite to verify fix

### Future
1. **Codegen**: Generate TypeScript types from Solidity ABIs (forge-std, typechain)
2. **Cross-Validation**: CI step to verify TypeScript ↔ Solidity type consistency
3. **Fork Tests**: Add Foundry fork tests that interact with deployed contracts
4. **Integration Tests**: E2E tests against real deployed Vault (not mocks)

## Lessons Learned

### EIP-712 is Extremely Fragile
- Field order matters (even one swap breaks everything)
- Domain parameters matter (name, version, chainId, verifyingContract)
- Type names matter (exact string match required)
- **ANY mismatch = 100% failure rate**

### Mocking Hides Critical Bugs
- Mock tests passed because they never hit real on-chain validation
- Need balance: fast mocked tests + slower integration tests
- Mark tests clearly: `[MOCK_CHAIN]` vs `[REAL_CHAIN]`

### Test Coverage Gaps
- Unit tests alone are insufficient for cross-boundary validation
- Need "consistency tests" that span multiple layers (TS ↔ Sol)
- Canary suite catches catastrophic failures fast

### Solidity-First Development
- When working with EIP-712, define types in Solidity first
- Generate TypeScript types from Solidity (not vice versa)
- Solidity compiler enforces stricter validation

## Timeline

| Time | Event |
|------|-------|
| T-2h | Implemented escrow-deferred scheme, unit tests passing |
| T-1h | Deployed Vault to Base Sepolia, factory pattern refactor |
| T-0h | First multi-intent batch test → ALL FAILED |
| T+5m | User asked about Arc testnet & field order |
| T+10m | Created EIP-712 consistency test → BUG FOUND |
| T+15m | Created canary suite for fast detection |
| T+20m | Fixed field order, awaiting user verification |

## Verification Plan

1. User runs `npm run test:unit` in separate terminal
2. Verify all 50 tests pass (47 existing + 3 new EIP-712 tests)
3. Restart services (`npm run stop && npm run start`)
4. Re-queue 5 intents (`INTENT_COUNT=5 ./scripts/queue-multiple-intents.sh`)
5. Trigger batch settlement (`curl -X POST http://localhost:4023/settle-batch`)
6. Verify on-chain: `cast call $VAULT "deposits(address)" $BUYER_ADDRESS`

## Status
🔧 **FIX APPLIED** - Awaiting user verification in separate terminal

