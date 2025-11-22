# Repository Pruning Proposal

**Date**: November 22, 2024  
**Objective**: Clean codebase without redundancies while maintaining solid test coverage

---

## 📋 Summary

| Category      | Action            | Count              | Rationale                                |
| ------------- | ----------------- | ------------------ | ---------------------------------------- |
| Logs          | **Archive**       | 18 files           | Historical record, helpful for debugging |
| Demo Results  | **Archive**       | 4 files            | Historical record of test runs           |
| Backup Files  | **Delete**        | 1 file             | Redundant (`.backup` suffix)             |
| Loose Scripts | **Archive**       | 1 file             | Temporary test file                      |
| Documentation | **Consolidate**   | 11 files           | Merge status/guide docs into README      |
| Scripts       | **Delete/Rename** | 5 delete, 1 rename | Demos redundant with test suite          |
| Tests         | **Keep All**      | 11 files           | Solid test rails - don't touch           |

---

## 1. LOGS - Propose: ARCHIVE ✅

**Action**: Move to `archive/historical-logs/`

### Root Logs (2 files)

```
deploy.log (5.4K) - Deployment history
fork-test.log (109 bytes) - Fork test results
```

### logs/ Directory (16 files)

```
- Multiple e2e test logs from today's run
- Demo logs from Arc testing
- Server logs (facilitator.log, seller.log)
- Various test logs
```

**Rationale**:

- Historical record useful if things break later
- Not needed for daily work
- Archive preserves them without cluttering root/logs
- **Replay capability** if we need to debug

**Command**:

```bash
mkdir -p archive/historical-logs
mv *.log archive/historical-logs/ 2>/dev/null
mv logs/*.log archive/historical-logs/
```

---

## 2. DEMO RESULT FILES - Propose: ARCHIVE ✅

**Action**: Move to `archive/demo-results/`

### Files (4)

```
demo-results-exact-arc.json (875 bytes)
demo-results-exact-base-sepolia.json (1.6K)
demo-results-exact-polygon-amoy.json (1.6K)
demo-results-exact.json (1.6K)
```

**Rationale**:

- Historical test results from initial Arc investigation
- Superseded by `E2E_TEST_RESULTS.md`
- Useful for comparison if we need to verify changes
- **Replay capability**

**Command**:

```bash
mkdir -p archive/demo-results
mv demo-results*.json archive/demo-results/
```

---

## 3. BACKUP FILES - Propose: DELETE ✅

**Action**: Delete

### Files (1)

```
scripts/fund-account.sh.backup
```

**Rationale**:

- Redundant (we have git history)
- Taking up space
- No replay value
- Git provides better versioning

**Command**:

```bash
rm scripts/fund-account.sh.backup
```

---

## 4. LOOSE SCRIPTS IN ROOT - Propose: ARCHIVE ✅

**Action**: Move to `archive/arc-investigation/`

### Files (1)

```
test-arc-integration.js
```

**Rationale**:

- Temporary test file from Arc investigation
- Superseded by `scripts/test-chain-exact.ts`
- Already have similar files in archive
- Keep for historical reference

**Command**:

```bash
mv test-arc-integration.js archive/arc-investigation/
```

---

## 5. DOCUMENTATION - Propose: CONSOLIDATE/ARCHIVE 📝

**Current**: 19 markdown files in root

### ✅ KEEP (Core Documentation - 8 files)

**Essential:**

1. `README.md` - Main entry point
2. `X402_STANDARD.md` - Protocol specification
3. `ZK_PRIVACY_DESIGN.md` - Privacy architecture (you want to review this!)
4. `E2E_TEST_RESULTS.md` - Current test results
5. `CHAIN_VERIFICATION_GUARANTEES.md` - Important verification docs

**Supporting:** 6. `MULTICHAIN_ARCHITECTURE.md` - Architecture overview 7. `MULTI_SCHEME_ARCHITECTURE.md` - Scheme design 8. `MULTICHAIN_STATUS.md` - Current status

### 🔄 CONSOLIDATE/SIMPLIFY (Review - 6 files)

**Status/Progress Docs** (may be outdated):

1. `DEPLOYMENT_STATUS.md` - Check if superseded by `deployed.env`
2. `REFACTORING_STATUS.md` - May be complete, can archive
3. `IMPLEMENTATION_COMPLETE.md` - Milestone doc, can archive
4. `PERFORMANCE_ANALYSIS.md` - Check if still relevant or needs update

**Guides** (may need consolidation): 5. `DEPLOYMENT_GUIDE.md` - Could merge into README 6. `VERIFICATION_GUIDE.md` - Could merge into README

### 📦 ARCHIVE (Historical - 5 files)

**Investigation/Postmortem:**

1. `CLEANUP_SUMMARY.md` - Arc resolution summary → archive
2. `CRITICAL_BUG_POSTMORTEM.md` - Historical bug → archive
3. `ESCROW_DEFERRED_SPEC_SUMMARY.md` - Spec summary (if redundant with MULTI_SCHEME)
4. `COMPLIANCE_REVIEW.md` - Historical review → archive
5. `TEST_STRATEGY.md` - May be superseded by actual tests

**Proposed Action**: Let's review these together before moving

---

## 6. SCRIPTS - Propose: CONSOLIDATE 🔧

**Current**: 14 scripts

### ✅ KEEP (Essential - 9 scripts)

**Core Operations:**

1. `start_servers.sh` - Server management
2. `stop_servers.sh` - Server management
3. `check_balances.sh` - Balance checking
4. `deploy-contracts.sh` - Contract deployment
5. `setup.sh` - Initial setup

**Funding (Both Needed):**

6. `fund-account.sh` - Single account utility
7. `fund_wallets.sh` - Multi-wallet setup utility

**Testing:**

8. `test-chain-exact.ts` - **RENAME** to `test-chain-exact.ts` (honest naming - it's exact-only, not multi-scheme)
9. `validate-api-keys.sh` - Setup validation
10. `benchmark-schemes.sh` - Performance testing

### ❌ DELETE (Redundant with Test Suite - 5 scripts)

**Covered by test-chain-exact.ts:**

1. `demo-exact.ts` - Same flow, less comprehensive
2. `run_demo_exact.sh` - Wrapper for redundant demo

**Covered by test/e2e-real/escrow-deferred-flow.test.ts:**

3. `demo-escrow-deferred.ts` - Comprehensive e2e test exists

**Covered by test suite (unit + e2e):**

4. `test-batch-settlement.ts` - Batch settler unit tests + e2e tests cover this
5. `queue-multiple-intents.sh` - Batch testing covered

**Detailed Analysis:** See `SCRIPT_CLEANUP_PLAN.md` for comprehensive rationale on why test-chain-e2e is exact-only and why demos are redundant.

---

## 7. TESTS - Propose: KEEP ALL ✅

**Current**: 11 test files across 5 directories

### Structure

```
test/
├── canary/
│   └── critical-path.test.ts          ✅ Keep
├── unit/
│   ├── strategy-registry.test.ts      ✅ Keep
│   ├── batch-settler.test.ts          ✅ Keep
│   ├── eip712-consistency.test.ts     ✅ Keep
│   ├── settlement-queue.test.ts       ✅ Keep
│   └── exact-strategy.test.ts         ✅ Keep
├── e2e/
│   └── exact-baseline.test.ts         ✅ Keep
├── e2e-mock/
│   └── escrow-deferred.test.ts        ✅ Keep
├── e2e-real/
│   └── escrow-deferred-flow.test.ts   ✅ Keep
├── facilitator.test.ts                ✅ Keep
└── seller.test.ts                     ✅ Keep
```

**Rationale**:

- **Solid test rails** - comprehensive coverage
- Unit tests (5) cover core logic
- E2E tests (2) cover integration
- Canary test for CI/CD
- Component tests (2) for services
- **Do NOT touch** - maintains quality assurance

**Note**: The new `scripts/test-chain-exact.ts` **complements** these tests (manual multi-chain testing), doesn't replace them.

---

## 📊 Proposed Actions Summary

### Immediate (No Review Needed)

```bash
# 1. Archive logs
mkdir -p archive/historical-logs
mv *.log archive/historical-logs/ 2>/dev/null || true
mv logs/*.log archive/historical-logs/ 2>/dev/null || true

# 2. Archive demo results
mkdir -p archive/demo-results
mv demo-results*.json archive/demo-results/

# 3. Delete backup file
rm scripts/fund-account.sh.backup

# 4. Archive loose test script
mv test-arc-integration.js archive/arc-investigation/
```

**Result**: Cleans root directory, preserves history

### ✅ APPROVED - Ready to Execute

**Documentation Consolidation:**

- Status docs (4) → Archive to `archive/milestones/`
- Guides (2) → Merge into README, then archive originals
- Historical docs (5) → Archive to `archive/investigations/`

**Scripts Cleanup:**

- Rename: `test-chain-exact.ts` → `test-chain-exact.ts` (honest naming)
- Delete: 5 demo/batch scripts (redundant with test suite)
- Keep: Both funding scripts (different use cases)
- See: `SCRIPT_CLEANUP_PLAN.md` for detailed rationale

### Keep As-Is (No Changes)

- ✅ All 11 test files - **solid test rails maintained**
- ✅ 8 core documentation files - Essential references
- ✅ 10 essential scripts - Core operations + testing

---

## 🎯 Expected Outcome

**Before**: 19 docs, 14 scripts, 18+ loose files in root  
**After**: ~8-12 docs, ~9-12 scripts, clean root directory

**Benefits**:

- ✅ Clean, focused codebase
- ✅ Historical data preserved in archive
- ✅ No loss of test coverage
- ✅ Easier to navigate and refactor
- ✅ Replay capability if things break

---

## ❓ Questions for You

1. **Documentation Review**: Should I proceed with consolidating status docs and guides?

2. **Scripts Review**:

   - Keep both `fund-account.sh` and `fund_wallets.sh`?
   - Keep `demo-*.ts` scripts or rely on `test-chain-exact.ts`?

3. **Archive Strategy**: Comfortable with moving logs/results to archive instead of deleting?

4. **Test Coverage**: Happy with keeping all 11 test files untouched?

---

**Ready to proceed with immediate actions? Or would you like to review specific categories first?**
