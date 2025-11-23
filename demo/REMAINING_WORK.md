# Demo UI - Remaining Work

**Current Status**: Phase 1 Complete ✅  
**Date**: November 23, 2025

---

## ✅ What's Working (Phase 1)

1. ✅ 3-column role-based layout (BUYER | FACILITATOR | SELLER)
2. ✅ Large step number badges (40px circular)
3. ✅ Color-coded event types (HTTP=blue, Blockchain=green, Signing=purple)
4. ✅ All scheme buttons red and clickable to run
5. ✅ 1-second animation delay between events
6. ✅ Vault addresses in example.env
7. ✅ Full-width edge-to-edge layout

---

## 🔨 Phase 2: Flow Metrics & Timing (Next)

### Timing Metrics

**Add two timing measurements**:

1. **Request-to-Service**: When content is delivered

   - x402-exact: ~9s (waits for blockchain)
   - Escrow-deferred: ~0.08s (instant)

2. **Request-to-Pay**: When blockchain settlement happens
   - x402-exact: ~9s (same as service)
   - Escrow-deferred: Deferred (shown as "Queued")

**Implementation**:

- Capture timestamps at start, service delivery, and settlement
- Display both metrics in Results panel
- Format: "Request→Service: 0.08s | Request→Pay: Deferred"

### Flow Characteristics

**Always show in same order** (5 items):

1. ⚡ **Service < Settle** (GOOD when true)

   - exact: ❌ False → Grey, thin font
   - escrow-deferred: ✅ True → Green ✅, bold font

2. 📦 **Batch Settle** (GOOD when true)

   - exact: ❌ False → Grey, thin font
   - escrow-deferred: ✅ True → Green ✅, bold font

3. 🔒 **Buyer not Onchain** (GOOD when true)

   - exact: ❌ False → Red ❌, bold font (buyer IS onchain = BAD)
   - escrow-deferred: ✅ True → Green ✅, bold font

4. 🏦 **Escrow Required** (BAD when true)

   - exact: ❌ False → Grey, thin font
   - escrow-deferred: ✅ True → Red ❌, bold font (requires pre-deposit = BAD)

5. 🛡️ **Trustless Facilitator** (GOOD when true)
   - exact: ✅ True → Green ✅, bold font
   - escrow-deferred: ✅ True → Green ✅, bold font
   - TEE: ✅ True → Green ✅, bold font (hardware attestation)

### Auto-Derivation Logic

```javascript
const SCHEME_CHARACTERISTICS = {
  exact: {
    serviceBeforeSettle: false,
    batchSettle: false,
    buyerNotOnchain: false, // Buyer IS onchain (bad)
    escrowRequired: false,
    trustlessFacilitator: true,
  },
  "escrow-deferred": {
    serviceBeforeSettle: true,
    batchSettle: true,
    buyerNotOnchain: true,
    escrowRequired: true, // Required (bad)
    trustlessFacilitator: true,
  },
  tee: {
    serviceBeforeSettle: true,
    batchSettle: true,
    buyerNotOnchain: true,
    escrowRequired: false,
    trustlessFacilitator: true,
  },
  zk: {
    serviceBeforeSettle: true,
    batchSettle: true,
    buyerNotOnchain: true,
    escrowRequired: false,
    trustlessFacilitator: true,
  },
};
```

### Display Format

```
┌─────────────────────────────────────┐
│ 📊 FLOW CHARACTERISTICS             │
├─────────────────────────────────────┤
│ ✅ Service < Settle                 │ ← Green check, bold (applies & good)
│ ✅ Batch Settle                     │ ← Green check, bold
│ ✅ Buyer not Onchain                │ ← Green check, bold
│ ❌ Escrow Required                  │ ← Red X, bold (applies & bad)
│ ✅ Trustless Facilitator            │ ← Green check, bold
├─────────────────────────────────────┤
│ ⏱️ Request→Service: 0.08s           │
│ ⏱️ Request→Pay: Deferred            │
│ ⛽ Gas: 0 (deferred)                │
│ 🔗 Explorer: (no tx yet)            │
└─────────────────────────────────────┘
```

vs. for exact:

```
┌─────────────────────────────────────┐
│ 📊 FLOW CHARACTERISTICS             │
├─────────────────────────────────────┤
│ ⚪ Service < Settle                 │ ← Grey circle, thin (doesn't apply)
│ ⚪ Batch Settle                     │ ← Grey circle, thin
│ ❌ Buyer not Onchain                │ ← Red X, bold (buyer IS onchain = bad)
│ ⚪ Escrow Required                  │ ← Grey circle, thin
│ ✅ Trustless Facilitator            │ ← Green check, bold
├─────────────────────────────────────┤
│ ⏱️ Request→Service: 9.4s            │
│ ⏱️ Request→Pay: 9.4s                │
│ ⛽ Gas: 86,164                      │
│ 🔗 View on Explorer                 │
└─────────────────────────────────────┘
```

---

## 🎨 Phase 3: Hover/Click Details

### Modal Overlay on Click

**Click any event** → Show modal with full details:

```
┌──────────────────────────────────────────┐
│  ✕ Close                                 │
│                                          │
│  📤 HTTP REQUEST                         │
│  POST /settle                            │
│                                          │
│  Headers:                                │
│  ─────────────────────────────           │
│  Content-Type: application/json          │
│  x-payment: {                            │
│    "scheme": "intent",                   │
│    "data": {                             │
│      "intent": {                         │
│        "buyer": "0x0AE6EF742a4347...",   │
│        "seller": "0x301541177dE41...",   │
│        "amount": "10000",                │
│        "token": "0x41E94Eb019C...",      │
│        "nonce": "0xd6be5f5c754...",      │
│        "expiry": 1763863681,             │
│        "resource": "/api/content/...",   │
│        "chainId": 80002                  │
│      },                                  │
│      "x402Signature": "0xabc...",        │
│      "transferAuth": {...},              │
│      "eip3009Signature": "0xdef..."      │
│    }                                     │
│  }                                       │
│                                          │
│  [Copy to Clipboard]                     │
└──────────────────────────────────────────┘
```

**Benefits**:

- Explain x402 protocol details
- Show actual payloads for education
- Copy for testing
- Crossable lanes (can expand wide)

---

## 🐛 Bugs to Fix

### High Priority

1. **Vault deployment error** - Add vault addresses to .env (DONE in example.env, need in actual .env)
2. **Events in wrong columns** - Some events showing in buyer when should be in facilitator/seller
3. **Explorer link navigation** - Currently opens in new tab, should have back button option

### Medium Priority

4. **Step number visibility** - Need large circular badges (DONE, needs testing)
5. **All buttons same color** - Make all 4 red (DONE, needs testing)
6. **Timing accuracy** - Ensure real measurements, not estimated

---

## 📋 Implementation Order

### Phase 2A: Timing Metrics (30 min)

1. Add timing capture to orchestrator
2. Calculate Request→Service and Request→Pay
3. Display in results panel
4. Test on both schemes

### Phase 2B: Flow Characteristics (45 min)

1. Add characteristic derivation logic
2. Create characteristics panel HTML
3. Style with green/red/grey symbols
4. Add bold/thin font logic
5. Show after flow completes (or 4-5s idle)

### Phase 3: Hover Modal (45 min)

1. Add click handlers to all events
2. Create modal overlay component
3. Format JSON with syntax highlighting
4. Add copy button
5. Handle escape/close

---

## ✅ Ready to Proceed?

**Next**: Should I implement Phase 2A (Timing) + 2B (Characteristics)?

This will make the demo **much more impactful** by showing the trade-offs clearly!
