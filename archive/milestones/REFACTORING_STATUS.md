# Multi-Scheme Refactoring Status

## ✅ Completed

### Step 1: Baseline Tests
- ✅ Seller unit tests (`test/seller.test.ts`)
- ✅ Facilitator unit tests (`test/facilitator.test.ts`)
- ✅ E2E baseline test (`test/e2e/exact-baseline.test.ts`)
- ✅ Test script added to `package.json` (`test:baseline`)

### Step 2: Spec Alignment
- ✅ Spec summary document (`ESCROW_DEFERRED_SPEC_SUMMARY.md`)
- ✅ Extracted interfaces and requirements from vault design spec

### Step 3: Scheme Abstractions (No Behavior Change)
- ✅ **Shared Types**:
  - Added `PaymentScheme` type
  - Added `PaymentContext` interface
  - Extended `PaymentRequirements` with `vault` and `escrow` fields
  - Extended `PaymentResponse` with `pending` status and `mode` field

- ✅ **Seller Refactoring**:
  - Created `PaymentStrategy` interface (`seller/strategies/PaymentStrategy.ts`)
  - Created `ExactStrategy` class (wraps current logic)
  - Created `EscrowDeferredStrategy` class (for future use)
  - Created `StrategyRegistry` for scheme management
  - Refactored `seller/server.ts` to use strategy pattern
  - Added canonical resource computation (scheme-independent)
  - Added `?scheme=` query parameter support

- ✅ **Facilitator Refactoring**:
  - Created `ExactSettlement` service module (`facilitator/services/ExactSettlement.ts`)
  - Extracted validation and settlement logic into service
  - Refactored `facilitator/server.ts` to use service module
  - Maintained backward compatibility with `/settle` endpoint

- ✅ **Buyer Refactoring**:
  - Created `SchemeStrategy` interface (`buyer/strategies/SchemeStrategy.ts`)
  - Created `ExactScheme` class (wraps current logic)
  - Created `EscrowDeferredScheme` class (for future use)
  - Created `SchemeRegistry` for scheme management
  - Refactored `buyer/agent.ts` to use scheme strategies
  - Added precondition checking (balance, vault deposit)

### Step 4: Escrow-Deferred Surfaces (Partial)
- ✅ **Vault Contract**:
  - Created `src/Vault.sol` with deposit and batchWithdraw
  - Implements EIP-712 signing for payment intents
  - Nonce tracking and solvency checks
  - Events for deposits, intent settlement, batch withdrawals

- ✅ **Seller Strategy**:
  - Created `EscrowDeferredStrategy` class
  - Generates 402 requirements with vault and escrow metadata
  - Validates payment and forwards to facilitator `/validate-intent`

- ✅ **Buyer Strategy**:
  - Created `EscrowDeferredScheme` class
  - Checks vault deposit balance
  - Signs payment intent with vault domain
  - Handles deposit preconditions

- ✅ **EIP-712 Utilities**:
  - Added `getVaultDomain()` function
  - Added `signPaymentIntentWithVaultDomain()` function

## ⚠️ Remaining Work

### Step 4: Escrow-Deferred Surfaces (Remaining)
- ⏳ **Facilitator Validation Endpoint**:
  - Need to create `POST /validate-intent` endpoint
  - Validate escrow-deferred payment intents
  - Verify vault-domain signatures
  - Check vault deposit balances
  - Queue intents for batch settlement

- ⏳ **Settlement Queue**:
  - Define queue record structure
  - Implement in-memory or file-based queue storage
  - Add queue management functions

- ⏳ **Chain Configuration**:
  - Extend chain config to include vault addresses
  - Add vault addresses to `.env` and `example.env`
  - Update chain config utilities

### Step 5: Facilitator Escrow-Deferred Validation (Not Started)
- ⏳ Implement `/validate-intent` endpoint
- ⏳ Add unit tests for escrow-deferred validation
- ⏳ Implement queue storage

### Step 6: Batch Settlement Worker (Not Started)
- ⏳ Create `BatchSettler` worker module
- ⏳ Group intents by vault + chain
- ⏳ Prepare batchWithdraw arguments
- ⏳ Execute batch settlements

### Step 7: E2E Escrow-Deferred Demo (Not Started)
- ⏳ Create `demo-escrow-deferred.ts` script
- ⏳ Test full escrow-deferred flow
- ⏳ Verify vault deposits and batch settlement

### Step 8: Regression Testing (Not Started)
- ⏳ Run baseline tests to verify exact scheme still works
- ⏳ Update `MULTICHAIN_STATUS.md` with scheme comparison
- ⏳ Document limitations

## Testing Status

- ⏳ Baseline tests created but not yet run
- ⏳ Refactored code compiles (no linting errors)
- ⏳ Need to verify exact scheme still works end-to-end

## Next Steps

1. **Test Refactored Code**: Run baseline tests to ensure exact scheme still works
2. **Complete Facilitator Validation**: Implement `/validate-intent` endpoint
3. **Add Vault Configuration**: Add vault addresses to environment config
4. **Implement Queue**: Add settlement queue storage
5. **Create Demo**: Build escrow-deferred demo script

