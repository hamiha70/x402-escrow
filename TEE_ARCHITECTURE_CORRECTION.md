# TEE Architecture Correction (Standalone ROFL App)

**Critical Update**: The TEE facilitator must be a **standalone application**, not mixed with the main facilitator.

---

## Correct Architecture

### Two Separate Services

```
┌─────────────────────────────────────────────────┐
│  Main Facilitator (Outside TEE)                 │
│  Port: 4023                                     │
│  Location: facilitator/                         │
│  Handles:                                       │
│    - POST /settle (exact scheme)                │
│    - POST /validate-intent (escrow-deferred)    │
│    - POST /tee-settle (PROXY to ROFL)          │
│    - POST /settle-batch                         │
└──────────────┬──────────────────────────────────┘
               │
               │ HTTP Proxy
               │
               ▼
┌─────────────────────────────────────────────────┐
│  ROFL App (Inside TEE)                          │
│  Port: 8080 (internal to ROFL)                  │
│  Location: rofl-app/                            │
│  Handles:                                       │
│    - POST /settle (TEE settlement)              │
│    - GET /balance/:address                      │
│    - GET /activity                              │
│    - GET /attestation                           │
│  Has:                                           │
│    - TEELedgerManager (private accounting)      │
│    - OmnibusVaultManager (chain interaction)    │
│    - Sealed storage (/data/tee-ledger.json)     │
└─────────────────────────────────────────────────┘
```

---

## Directory Structure

### Before (Incorrect)

```
facilitator/
├── server.ts              # Mixed: exact + escrow + TEE
├── services/
│   ├── ExactSettlement.ts
│   ├── TEELedgerManager.ts    # ❌ Shouldn't be here
│   └── OmnibusVaultManager.ts # ❌ Shouldn't be here
rofl/
└── Dockerfile  # ❌ Packages facilitator/ (wrong)
```

### After (Correct)

```
facilitator/
├── server.ts              # Handles: exact, escrow-deferred, proxy to ROFL
├── routes/
│   ├── exact.ts
│   ├── escrowDeferred.ts
│   └── teeProxy.ts        # NEW: Proxies to ROFL instance
└── services/
    ├── ExactSettlement.ts
    ├── EscrowDeferredValidation.ts
    ├── BatchSettler.ts
    └── SettlementQueue.ts

rofl-app/                  # NEW: Standalone TEE application
├── src/
│   ├── index.ts           # Express server (TEE only)
│   ├── routes/
│   │   ├── settle.ts      # POST /settle
│   │   ├── balance.ts     # GET /balance
│   │   ├── activity.ts    # GET /activity
│   │   └── attestation.ts # GET /attestation
│   ├── services/
│   │   ├── TEELedgerManager.ts    # Moved here
│   │   └── OmnibusVaultManager.ts # Moved here
│   └── utils/
│       ├── logger.ts      # Simple logger
│       └── types.ts       # PaymentIntent types
├── package.json           # Independent dependencies
├── tsconfig.json
├── Dockerfile             # Builds rofl-app/ only
└── rofl.yaml              # ROFL configuration
```

---

## Implementation Changes Needed

### 1. Create Standalone ROFL App

**File**: `rofl-app/src/index.ts`

```typescript
import express from "express";
import dotenv from "dotenv";
import { settleRouter } from "./routes/settle.js";
import { balanceRouter } from "./routes/balance.js";
import { activityRouter } from "./routes/activity.js";
import { attestationRouter } from "./routes/attestation.js";
import { TEELedgerManager } from "./services/TEELedgerManager.js";
import { OmnibusVaultManager } from "./services/OmnibusVaultManager.js";

dotenv.config();

const app = express();
app.use(express.json());

// Initialize TEE services
const ledger = new TEELedgerManager("/data/tee-ledger.json");
const vaultManager = new OmnibusVaultManager(/* config */);

// Register routes
app.use("/settle", settleRouter(ledger, vaultManager));
app.use("/balance", balanceRouter(ledger));
app.use("/activity", activityRouter(ledger));
app.use("/attestation", attestationRouter());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "x402-tee-rofl-app",
    ledgerStats: ledger.getStats(),
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`ROFL app listening on port ${PORT}`);
  console.log(`Ledger path: /data/tee-ledger.json`);
});
```

### 2. Move Services to ROFL App

Move these files:

- `facilitator/services/TEELedgerManager.ts` → `rofl-app/src/services/TEELedgerManager.ts`
- `facilitator/services/OmnibusVaultManager.ts` → `rofl-app/src/services/OmnibusVaultManager.ts`

Update imports to use local utils (no dependency on `../shared`).

### 3. Create Proxy in Main Facilitator

**File**: `facilitator/routes/teeProxy.ts`

```typescript
import express from "express";
import axios from "axios";
import { createLogger } from "../../shared/logger.js";

const logger = createLogger("tee-proxy");

export function createTEEProxyRouter() {
  const router = express.Router();
  const roflUrl = process.env.ROFL_INSTANCE_URL || "http://localhost:8080";

  // Proxy TEE settlement requests
  router.post("/", async (req, res) => {
    try {
      logger.info(`Proxying TEE settlement to ${roflUrl}`);

      const response = await axios.post(`${roflUrl}/settle`, req.body);

      logger.info(`TEE settlement response: ${response.data.success}`);
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      logger.error(`TEE proxy error: ${error.message}`);
      return res.status(error.response?.status || 500).json({
        error: "TEE facilitator unreachable",
        details: error.message,
      });
    }
  });

  return router;
}
```

**Register in** `facilitator/server.ts`:

```typescript
import { createTEEProxyRouter } from "./routes/teeProxy.js";

app.use("/tee-settle", createTEEProxyRouter());
```

### 4. Update Dockerfile

**File**: `rofl-app/Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production

# Copy ONLY rofl-app source
COPY src/ ./src/

# Create data directory for sealed storage
RUN mkdir -p /data && chmod 700 /data

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

# Run standalone ROFL app
CMD ["node", "src/index.js"]
```

**Build from**: `rofl-app/` directory (not root)

---

## Why This Architecture

### Benefits

1. **Clean Separation**:

   - facilitator/ = non-TEE code (exact, escrow-deferred)
   - rofl-app/ = TEE-only code (tee-facilitator scheme)
   - No mixing of concerns

2. **Security**:

   - TEE only exposes what it needs
   - No accidental inclusion of non-TEE routes/services
   - Minimal attack surface

3. **Testability**:

   - Can test ROFL app standalone: `cd rofl-app && npm run dev`
   - Can test main facilitator without ROFL
   - Can test proxy independently

4. **Deployment**:

   - Main facilitator: Standard deployment (npm start)
   - ROFL app: Deployed to Oasis ROFL infrastructure
   - Independent lifecycles

5. **Matches Oasis Patterns**:
   - Example: `rofl-x402-service` is standalone
   - ROFL demos are self-contained apps
   - Not "facilitator with TEE bolted on"

### Communication Flow

```
Buyer → Seller → GET /api/content?scheme=x402-tee-facilitator
         ↓
Seller returns 402 with facilitator URL: http://localhost:4023/tee-settle
         ↓
Buyer → POST http://localhost:4023/tee-settle (main facilitator)
         ↓
Main facilitator proxies → https://<rofl-instance>/settle
         ↓
ROFL app processes in TEE → settles on-chain → returns receipt
         ↓
Main facilitator forwards receipt → Buyer
         ↓
Seller delivers content
```

---

## Deployment Workflow (Corrected)

### 1. Deploy Main Facilitator (Non-TEE)

```bash
# Standard deployment
npm run facilitator
# Listening on localhost:4023
# Handles: exact, escrow-deferred, tee-proxy
```

### 2. Deploy ROFL App (TEE)

```bash
cd rofl-app

# Build
npm run build

# Build Docker image
docker build -t x402-tee-rofl-app .

# Deploy to ROFL
oasis rofl build
oasis rofl deploy

# Get ROFL instance URL
# Example: https://abc123.rofl.oasis.io
```

### 3. Configure Proxy

```bash
# In main facilitator .env
ROFL_INSTANCE_URL=https://abc123.rofl.oasis.io

# Restart main facilitator
npm run facilitator
```

### 4. Test End-to-End

```bash
# Buyer sends payment to main facilitator
POST http://localhost:4023/tee-settle
  { intentStruct, signature }

# Main facilitator proxies to ROFL
# ROFL processes in TEE
# Response flows back to buyer
```

---

_This architecture properly separates TEE code (rofl-app/) from non-TEE code (facilitator/), matching Oasis ROFL patterns._
