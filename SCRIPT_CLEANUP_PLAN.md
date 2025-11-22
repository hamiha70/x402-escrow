# Script Cleanup Plan

## Analysis: test-chain-exact.ts (formerly test-chain-e2e.ts)

**Current State:**

```typescript
/**
 * Parameterized E2E Test for x402-exact scheme
 * ...
 */
```

**Reality Check:**

- ✅ Parameterized by chain (base-sepolia, polygon-amoy, arc, etc.)
- ❌ NOT parameterized by scheme (hardcoded to x402-exact only)
- ❌ Does NOT support escrow-deferred
- ❌ Does NOT support private-deferred-escrow

**Why it's exact-only:**

- Uses direct EIP-3009 `transferWithAuthorization` (lines 83-84)
- No Vault interaction
- No escrow/batch settlement logic
- Tests USDC contract's EIP-712 domain, not Vault's domain

**Honest Name:** `test-chain-exact.ts` (reflects what it actually does)

---

## Batch Testing Coverage

### ✅ Comprehensive Test Rails Exist

**Unit Tests** (`test/unit/batch-settler.test.ts`):

- Queue record structure validation
- Multi-intent grouping by vault/chain
- Batch data preparation for Vault.batchWithdraw()
- Queue status management (pending → settled → failed)
- Statistics tracking

**E2E Tests** (`test/e2e-real/escrow-deferred-flow.test.ts`):

- Full escrow-deferred flow on Base Sepolia
- Vault deposit → intent signing → queue → batch settlement
- On-chain verification of batch settlement
- Real Vault contract interaction
- 8-step comprehensive flow validation

### ❌ Redundant Scripts

**`scripts/test-batch-settlement.ts`**:

- Covers same functionality as test suite
- Less comprehensive than e2e test
- Uses mock signatures (line 71: `signMockIntent`)
- No advantage over proper test suite

**Verdict:** DELETE (covered by test suite)

---

## Demo Scripts Analysis

### `demo-exact.ts`

**Purpose:** Demonstrates x402-exact synchronous settlement
**Coverage:**

- EIP-712 signing
- EIP-3009 transferWithAuthorization
- Timing and gas measurements
- JSON result export

**Test Coverage:**

- `scripts/test-chain-exact.ts` - Same exact flow, parameterized by chain
- No unique test cases

**Verdict:** DELETE (redundant with test-chain-exact.ts)

---

### `demo-escrow-deferred.ts`

**Purpose:** Demonstrates x402-escrow-deferred with Vault
**Coverage:**

- Vault domain signing
- Escrow payment flow
- Deferred settlement concept
- Mock Vault behavior (line 4-6 warning)

**Test Coverage:**

- `test/e2e-real/escrow-deferred-flow.test.ts` - Comprehensive 8-step validation
- `test/unit/batch-settler.test.ts` - Batch logic validation
- No unique test cases

**Verdict:** DELETE (redundant with test suite)

---

## Proposed Actions

### 1. Rename for Honesty

```bash
git mv scripts/test-chain-e2e.ts scripts/test-chain-exact.ts
```

**Update references:**

- `E2E_TEST_RESULTS.md` - Update script name
- `CHAIN_VERIFICATION_GUARANTEES.md` - Update script name
- Any documentation referencing the script

---

### 2. Delete Redundant Demo Scripts

```bash
rm scripts/demo-exact.ts
rm scripts/demo-escrow-deferred.ts
rm scripts/run_demo_exact.sh
```

**Rationale:**

- Test suite provides comprehensive coverage
- Tests are more reliable (proper assertions, no manual inspection)
- Demo scripts become stale and diverge from actual implementation
- Maintenance burden

---

### 3. Delete Redundant Batch Script

```bash
rm scripts/test-batch-settlement.ts
rm scripts/queue-multiple-intents.sh
```

**Rationale:**

- Fully covered by `test/e2e-real/escrow-deferred-flow.test.ts`
- Fully covered by `test/unit/batch-settler.test.ts`
- No unique test cases
- Maintenance burden

---

### 4. Keep Funding Scripts (Both)

```bash
# KEEP both
scripts/fund-account.sh
scripts/fund_wallets.sh
```

**Rationale:**

- `fund-account.sh` - Single account funding utility
- `fund_wallets.sh` - Multi-wallet setup utility
- Different use cases, both useful
- Small, stable scripts with different purposes

---

## Future: Multi-Scheme E2E

**When private-deferred-escrow is ready:**

Create `scripts/test-chain-multi-scheme.ts`:

```typescript
/**
 * Parameterized E2E Test for all x402 schemes
 *
 * Usage:
 *   tsx scripts/test-chain-multi-scheme.ts base-sepolia exact
 *   tsx scripts/test-chain-multi-scheme.ts base-sepolia escrow-deferred
 *   tsx scripts/test-chain-multi-scheme.ts base-sepolia private-deferred
 */
```

**Benefits:**

- Single parameterized test for all schemes
- Consistent multi-layer chain verification
- Easier to maintain than 3 separate scripts

---

## Summary

| Action     | File                                        | Rationale                      |
| ---------- | ------------------------------------------- | ------------------------------ |
| **RENAME** | `test-chain-e2e.ts` → `test-chain-exact.ts` | Honest naming (exact-only)     |
| **DELETE** | `demo-exact.ts`                             | Covered by test-chain-exact.ts |
| **DELETE** | `demo-escrow-deferred.ts`                   | Covered by e2e test suite      |
| **DELETE** | `run_demo_exact.sh`                         | Demo script wrapper            |
| **DELETE** | `test-batch-settlement.ts`                  | Covered by test suite          |
| **DELETE** | `queue-multiple-intents.sh`                 | Batch testing covered          |
| **KEEP**   | `fund-account.sh`                           | Single account utility         |
| **KEEP**   | `fund_wallets.sh`                           | Multi-wallet utility           |
| **KEEP**   | `benchmark-schemes.sh`                      | Performance testing            |

---

## Test Rails Remain Solid ✅

After cleanup, we retain:

- ✅ Unit tests (5 files)
- ✅ E2E mock tests (2 files)
- ✅ E2E real tests (2 files)
- ✅ Integration tests (2 files)
- ✅ Foundry test (Vault.t.sol)
- ✅ Parameterized chain testing (test-chain-exact.ts)

**No test coverage lost** - all deleted scripts are redundant with proper test suite.
