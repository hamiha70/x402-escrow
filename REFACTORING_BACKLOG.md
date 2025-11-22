# Refactoring Backlog

**Purpose**: Track code organization improvements to be done after TEE deployment validation.

---

## 1. Organize Services by Scheme Folders

**Current structure**:
```
facilitator/services/
├── ExactSettlement.ts
├── EscrowDeferredValidation.ts
├── BatchSettler.ts
├── SettlementQueue.ts
├── TEELedgerManager.ts
└── OmnibusVaultManager.ts
```

**Proposed structure**:
```
facilitator/services/
├── exact/
│   └── ExactSettlement.ts
├── escrow-deferred/
│   ├── EscrowDeferredValidation.ts
│   ├── BatchSettler.ts
│   └── SettlementQueue.ts
└── tee-facilitator/
    ├── TEELedgerManager.ts
    └── OmnibusVaultManager.ts
```

**Impact**:
- Update imports in routes: `../services/exact/ExactSettlement.js`
- Update imports in tests
- Update imports in main server.ts

**Why postponed**: 
- Needs Oasis team support NOW (3-hour window)
- Refactoring is low-risk maintenance
- Code works as-is; separation is organizational
- Better to validate TEE deployment first

**Effort**: ~30 minutes (mechanical refactoring)

---

## 2. Similar Organization for Routes

**Current**:
```
facilitator/routes/
├── exact.ts
├── escrowDeferred.ts
├── teeSettle.ts
└── balance.ts
```

**Proposed**:
```
facilitator/routes/
├── exact.ts
├── escrow-deferred/
│   └── validate.ts
└── tee-facilitator/
    ├── settle.ts
    ├── balance.ts
    └── activity.ts
```

**Rationale**: Co-locate scheme-specific routes with their services.

**Effort**: ~15 minutes

---

## 3. Strategy Organization

**Current**:
```
seller/strategies/
├── ExactStrategy.ts
├── EscrowDeferredStrategy.ts
└── TEEFacilitatorStrategy.ts
```

**Proposed**: Keep as-is (flat structure is fine for strategies).

---

## Total Refactoring Effort

- Services reorganization: 30 minutes
- Routes reorganization: 15 minutes
- Import updates: 15 minutes
- Test updates: 15 minutes
- **Total**: ~75 minutes

**Schedule**: After TEE deployment validated with Oasis team.

---

_This backlog captures organizational improvements without blocking TEE implementation progress._

