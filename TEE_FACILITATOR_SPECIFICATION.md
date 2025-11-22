# TEE Facilitator Specification (x402-tee-facilitator)

**Status**: Implementation Ready  
**Version**: 1.0  
**Date**: November 22, 2025

---

## 1. Overview

The TEE facilitator scheme provides **buyer-seller unlinkability** by running the facilitator inside a Trusted Execution Environment (Oasis ROFL). The facilitator maintains private off-chain accounting and settles to sellers from chain-specific omnibus vaults.

**Key Properties**:

- On-chain observers see: buyer deposits, seller withdrawals (no linkage)
- Facilitator accounting is private (sealed inside TEE)
- Buyers trust TEE to enforce algorithmic constraints
- Full x402 EIP-712 compatibility maintained

---

## 2. Architecture Components

### On-Chain: Omnibus Vault per Chain

**Contract**: `OmnibusVault.sol`

```solidity
contract OmnibusVault {
    IERC20 public immutable token;      // USDC
    address public immutable facilitator; // TEE-controlled address
    mapping(address => bool) public allowedSellers;

    // Buyers deposit
    function deposit(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    // Only facilitator can withdraw to sellers
    function withdrawToSeller(
        address seller,
        uint256 amount,
        bytes32 intentHash
    ) external {
        require(msg.sender == facilitator, "Only facilitator");
        require(allowedSellers[seller], "Seller not allowed");
        token.transfer(seller, amount);
        emit Withdrawn(seller, amount, intentHash);
    }
}
```

**Deployment**: One per chain (Base Sepolia, Polygon Amoy, etc.)

**Privacy**:

- ✅ Deposit events show buyer address (transparent deposit)
- ✅ Withdrawal events show seller address only
- ❌ No on-chain link between specific buyer and seller

### Off-Chain: TEE Ledger (File-Based)

**File**: `data/tee-ledger.json` (sealed storage in TEE)

```json
{
  "buyers": {
    "0xBuyerAddress1": {
      "balance": "1000000",
      "nonce": 5,
      "deposits": [
        {
          "amount": "1000000",
          "timestamp": 1700000000,
          "chain": 84532,
          "txHash": "0x..."
        }
      ],
      "spends": [
        {
          "seller": "0xSeller1",
          "amount": "10000",
          "resource": "/api/premium",
          "timestamp": 1700001000,
          "chain": 84532,
          "txHash": "0x...",
          "intentHash": "0x..."
        }
      ]
    }
  },
  "metadata": {
    "lastUpdated": 1700001000,
    "totalDeposits": "1000000",
    "totalSpends": "10000",
    "ledgerHash": "0x..."
  }
}
```

**Operations**:

- `recordDeposit(buyer, amount, chain, txHash)`
- `recordSpend(buyer, seller, amount, resource, chain, intentHash)`
- `getBalance(buyer): bigint`
- `computeLedgerHash(): bytes32` (for auditability)

**Atomicity**: Write to `tee-ledger.json.tmp`, then rename (atomic on POSIX)

### TEE Environment: Oasis ROFL

**Runtime**: Docker container with Node.js facilitator  
**Secrets**: RPC URLs + facilitator private keys via ROFL KMS  
**Storage**: `/data` mounted with TEE encryption  
**Attestation**: TEE measurement available via `/attestation` endpoint

---

## 3. Payment Flow (x402-tee-facilitator)

### Step-by-Step

**1. Buyer deposits to omnibus vault (on-chain)**

```typescript
// Buyer on Base Sepolia
await usdc.approve(omnibusVault, amount);
await omnibusVault.deposit(amount);
// Event: Deposited(buyerAddress, amount)
```

**2. Buyer requests content from seller**

```http
GET /api/content/premium/base-sepolia?scheme=x402-tee-facilitator
```

**3. Seller returns 402 with TEE payment requirements**

```json
{
  "scheme": "x402-tee-facilitator",
  "amount": "10000",
  "tokenAddress": "0x036CbD...",
  "seller": "0xSeller...",
  "resource": "/api/content/premium/base-sepolia",
  "facilitator": "https://rofl-endpoint.oasis.io/tee-settle",
  "vault": "0xOmnibusVault...",
  "attestation": "https://rofl-endpoint.oasis.io/attestation",
  "chainId": 84532
}
```

**4. Buyer signs EIP-712 PaymentIntent**

```typescript
const intent = {
  buyer: buyerAddress,
  seller: sellerAddress,
  amount: "10000",
  token: usdcAddress,
  nonce: randomBytes32(),
  expiry: now() + 300,
  resource: "/api/content/premium/base-sepolia",
  chainId: 84532,
};

const signature = await wallet.signTypedData(domain, types, intent);
```

**5. Buyer sends payment to TEE facilitator**

```http
POST /tee-settle
{
  "intentStruct": intent,
  "signature": signature
}
```

**6. TEE facilitator verifies and settles**

```typescript
// Inside TEE:
// a) Verify signature
const intentHash = keccak256(abi.encode(intentStruct));
const recovered = ecrecover(eip712Hash(domain, intentStruct), signature);
if (recovered !== intentStruct.buyer) throw "Invalid signature";

// b) Check balance
const buyerBalance = ledger.getBalance(intentStruct.buyer);
if (buyerBalance < intentStruct.amount) throw "Insufficient balance";

// c) Update ledger
ledger.deductBalance(intentStruct.buyer, intentStruct.amount);
ledger.recordSpend({
  buyer: intentStruct.buyer,
  seller: intentStruct.seller,
  amount: intentStruct.amount,
  resource: intentStruct.resource,
  intentHash,
});

// d) Settle on-chain
const omnibusVault = getOmnibusVault(intentStruct.chainId);
const tx = await omnibusVault.withdrawToSeller(
  intentStruct.seller,
  intentStruct.amount,
  intentHash
);

// e) Return receipt
return {
  success: true,
  txHash: tx.hash,
  newBalance: ledger.getBalance(intentStruct.buyer),
  intentHash,
};
```

**7. Seller delivers content**

Standard x402 flow (same as exact/escrow-deferred).

---

## 4. Privacy Analysis

### What's Hidden

- ✅ **Buyer-seller linkage**: TEE ledger keeps mapping private
- ✅ **Buyer spending patterns**: Only TEE knows who paid whom
- ✅ **Buyer balances**: Ledger sealed in TEE

### What's Visible

- ❌ **Deposit amounts**: Public on-chain (buyer deposits X USDC)
- ❌ **Withdrawal amounts**: Public on-chain (seller receives Y USDC)
- ✅ **Facilitator activity**: Total vault balance visible

### Comparison to Other Schemes

| Scheme              | Buyer Visibility             | Seller Visibility       | Linkage                 |
| ------------------- | ---------------------------- | ----------------------- | ----------------------- |
| Exact               | Public (EIP-3009)            | Public                  | Public                  |
| Escrow-deferred     | Public (Vault.batchWithdraw) | Public                  | Public                  |
| **TEE facilitator** | **Public (deposit)**         | **Public (withdrawal)** | **Private (TEE only)**  |
| ZK Pool             | Public (ephemeral)           | Public                  | Private (cryptographic) |

**Privacy gain**: Observer knows buyer deposited and seller received payment, but cannot link specific deposits to specific withdrawals.

**Anonymity set**: All buyers who have deposited to the omnibus vault.

---

## 5. Trust Model

### What Buyer Trusts

1. **TEE hardware** (Intel SGX/TDX): Cannot be compromised without breaking attestation
2. **ROFL operator**: Runs correct code (verifiable via attestation measurement)
3. **Facilitator algorithm**: Enforces balance constraints and doesn't double-spend

### What Buyer Can Verify

- ✅ TEE measurement matches published code (via `/attestation`)
- ✅ Omnibus vault has sufficient funds (on-chain query)
- ✅ Seller allowlist enforced (on-chain in OmnibusVault)
- ✅ Own balance via `/balance/:address` query (TEE returns private ledger state)

### What Buyer Cannot Verify

- ❌ Facilitator doesn't log ledger externally (must trust TEE confidentiality)
- ❌ Ledger persistence across TEE restarts (trust ROFL sealed storage)

### Attack Scenarios

| Attack                                  | Protection                                               | Residual Risk                                      |
| --------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Facilitator steals funds                | On-chain omnibus vault; facilitator can only pay sellers | Facilitator could pay fake seller (need allowlist) |
| Facilitator double-spends buyer balance | Ledger in TEE; atomic file writes                        | TEE software bug or compromise                     |
| Observer links buyer to seller          | Linkage only in TEE; not exposed                         | Facilitator operator logs externally (breaks TEE)  |
| Facilitator censors buyer               | Buyer can verify via `/balance` query                    | No decentralized alternative for MVP               |

---

## 6. Secrets Management (ROFL KMS)

### RPC URLs (per chain)

```bash
oasis rofl secret set BASE_SEPOLIA_RPC "https://base-sepolia.quiknode.pro/..."
oasis rofl secret set POLYGON_AMOY_RPC "https://polygon-amoy.quiknode.pro/..."
```

**Access in code**:

```typescript
const rpcUrl = process.env.BASE_SEPOLIA_RPC; // Injected by ROFL
```

### Facilitator Private Keys (per chain)

```bash
oasis rofl secret set FACILITATOR_PRIVATE_KEY_BASE "0x..."
oasis rofl secret set FACILITATOR_PRIVATE_KEY_POLYGON "0x..."
```

**Why per-chain**: Each chain has separate omnibus vault with specific facilitator address.

**Storage**: ROFL KMS encrypts and seals secrets in TEE.

**Access**:

```typescript
const wallet = new ethers.Wallet(
  process.env.FACILITATOR_PRIVATE_KEY_BASE,
  provider
);
```

---

## 7. Balance Query & Authentication

### Endpoint: `GET /balance/:address`

**Request**:

```http
GET /balance/0xBuyerAddress
Authorization: Bearer <optional-jwt>
```

**Response**:

```json
{
  "address": "0xBuyerAddress",
  "balance": "990000",
  "nonce": 5,
  "deposits": [
    { "amount": "1000000", "timestamp": 1700000000, "chain": 84532 }
  ],
  "spends": [
    { "seller": "0xSeller", "amount": "10000", "timestamp": 1700001000 }
  ]
}
```

**Authentication** (MVP):

- Optional: Require signed challenge
- Simple: No auth (assume HTTPS + TEE confidentiality sufficient)
- Future: JWT with buyer signature

---

## 8. Auditability & Compliance

### Ledger Hash Publication

**Mechanism**: Periodically compute and publish ledger hash.

```typescript
// In TEE
const ledgerHash = keccak256(JSON.stringify(ledger));

// Could emit on-chain or publish via attestation endpoint
await omnibusVault.publishLedgerHash(ledgerHash, signature);
```

**Purpose**: Allows external auditors to verify ledger hasn't been tampered with (if they can access ledger later).

### Seller Allowlist

**On-chain enforcement**:

```solidity
mapping(address => bool) public allowedSellers;

function authorizeSeller(address seller, bool status) external onlyOwner {
    allowedSellers[seller] = status;
}
```

**TEE checks before settlement**: Query `omnibusVault.allowedSellers(seller)` before calling `withdrawToSeller()`.

### Audit API (Future)

**Endpoint**: `GET /audit/ledger-summary`

Returns aggregated statistics without revealing individual buyers:

```json
{
  "totalBuyers": 150,
  "totalDeposits": "150000000",
  "totalSpends": "145000000",
  "totalBalance": "5000000",
  "ledgerHash": "0x..."
}
```

---

## 9. Multi-Chain Support

### Chain Configuration

Each supported chain needs:

1. OmnibusVault deployment
2. Facilitator wallet with ETH for gas
3. RPC URL secret in ROFL KMS
4. Seller allowlist configuration

**Example** (Base Sepolia + Polygon Amoy):

```bash
# Deploy contracts
forge create OmnibusVault --constructor-args $USDC_BASE_SEPOLIA $FACILITATOR_ADDRESS_BASE
forge create OmnibusVault --constructor-args $USDC_POLYGON_AMOY $FACILITATOR_ADDRESS_POLYGON

# Set secrets in ROFL
oasis rofl secret set BASE_SEPOLIA_RPC "https://..."
oasis rofl secret set POLYGON_AMOY_RPC "https://..."
oasis rofl secret set FACILITATOR_PRIVATE_KEY_BASE "0x..."
oasis rofl secret set FACILITATOR_PRIVATE_KEY_POLYGON "0x..."
```

**Runtime**: TEE facilitator supports all chains simultaneously (same as current facilitator).

---

## 10. Scheme Isolation

### Why Separate from Existing Schemes

**Existing schemes** (exact, escrow-deferred):

- Use different settlement mechanisms
- Use `Vault.sol` with deposit tracking
- Public buyer-seller linkage

**TEE scheme**:

- Uses `OmnibusVault.sol` (facilitator-controlled)
- Private ledger in TEE
- Hidden buyer-seller linkage

**No shared state**: Buyer must deposit separately for each scheme.

**Example**:

- Buyer deposits 100 USDC to `Vault.sol` (for escrow-deferred)
- Buyer deposits 50 USDC to `OmnibusVault.sol` (for TEE scheme)
- Total: 150 USDC across 2 schemes (independent balances)

---

## 11. EIP-712 Verification in TEE

### Intent Structure Validation

**Buyer sends** (via HTTPS):

```json
{
  "intentStruct": {
    "buyer": "0xBuyer",
    "seller": "0xSeller",
    "amount": "10000",
    "token": "0xUSDC",
    "nonce": "0xNonce",
    "expiry": 1700002000,
    "resource": "/api/premium",
    "chainId": 84532
  },
  "signature": "0xSignature..."
}
```

**TEE verification steps**:

```typescript
// 1. Recompute intent hash
const computedHash = ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "address",
      "address",
      "uint256",
      "address",
      "bytes32",
      "uint256",
      "string",
      "uint256",
    ],
    [
      intentStruct.buyer,
      intentStruct.seller,
      intentStruct.amount,
      intentStruct.token,
      intentStruct.nonce,
      intentStruct.expiry,
      intentStruct.resource,
      intentStruct.chainId,
    ]
  )
);

// 2. Recover signer from EIP-712 signature
const domain = {
  name: "x402-tee-facilitator",
  version: "1",
  chainId: intentStruct.chainId,
  verifyingContract: omnibusVaultAddress,
};

const types = {
  PaymentIntent: [
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "token", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint256" },
    { name: "resource", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
};

const recovered = ethers.verifyTypedData(
  domain,
  types,
  intentStruct,
  signature
);

// 3. Verify recovered address matches buyer in intent
if (recovered !== intentStruct.buyer) {
  throw new Error("Invalid signature");
}

// 4. Check balance in ledger
const balance = ledger.getBalance(intentStruct.buyer);
if (balance < BigInt(intentStruct.amount)) {
  throw new Error("Insufficient balance");
}
```

**Why send intentStruct**: TEE needs full struct to verify hash matches what buyer signed.

**Security**: Buyer cannot forge intent (signature binds all fields).

---

## 12. ROFL Deployment Configuration

### File: `rofl/app.yaml`

```yaml
name: x402-tee-facilitator
version: 1.0.0
runtime: container
image: ./Dockerfile

endpoints:
  - path: /tee-settle
    methods: [POST]
  - path: /balance/{address}
    methods: [GET]
  - path: /health
    methods: [GET]
  - path: /attestation
    methods: [GET]

secrets:
  - BASE_SEPOLIA_RPC
  - POLYGON_AMOY_RPC
  - ARBITRUM_SEPOLIA_RPC
  - OPTIMISM_SEPOLIA_RPC
  - ARC_TESTNET_RPC
  - FACILITATOR_PRIVATE_KEY_BASE
  - FACILITATOR_PRIVATE_KEY_POLYGON
  - FACILITATOR_PRIVATE_KEY_ARBITRUM
  - FACILITATOR_PRIVATE_KEY_OPTIMISM
  - FACILITATOR_PRIVATE_KEY_ARC

storage:
  - mount: /data
    encrypted: true
    persistent: true

network:
  allow_outbound: true # For RPC calls to Base, Polygon, etc.
```

### File: `rofl/Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY facilitator/ ./facilitator/
COPY shared/ ./shared/

# Create data directory for ledger
RUN mkdir -p /data && chmod 700 /data

# Expose HTTP port
EXPOSE 4023

# Run facilitator server
CMD ["node", "facilitator/server.js"]
```

### Deployment Commands

```bash
# 1. Build ROFL bundle
cd rofl
oasis rofl build

# 2. Set secrets (encrypted in KMS)
oasis rofl secret set BASE_SEPOLIA_RPC "https://..."
oasis rofl secret set FACILITATOR_PRIVATE_KEY_BASE "0x..."
# ... repeat for all chains

# 3. Deploy to ROFL marketplace
oasis rofl deploy --network testnet

# 4. Get attestation
curl https://<rofl-instance>.oasis.io/attestation
```

---

## 13. Attestation & Verification

### Attestation Endpoint

**Endpoint**: `GET /attestation`

**Response**:

```json
{
  "measurement": "0xTEEMeasurementHash...",
  "timestamp": 1700000000,
  "rofl_version": "1.0.0",
  "code_hash": "0xDockerImageHash...",
  "signer": "0xROFLAttestationKey..."
}
```

### Buyer Verification (Optional)

```typescript
// Before sending sensitive data
const attestation = await fetch(`${facilitatorUrl}/attestation`).then((r) =>
  r.json()
);

// Verify measurement matches published code
const expectedMeasurement = "0xExpectedHash..."; // Published on GitHub
if (attestation.measurement !== expectedMeasurement) {
  throw new Error("TEE measurement mismatch - possible compromise");
}

// Proceed with payment
await sendPayment(facilitatorUrl, intent, signature);
```

**Security**: Ensures facilitator is running expected code in genuine TEE.

---

## 14. Success Criteria

### MVP Deliverables

- ✅ `OmnibusVault.sol` deployed on Base Sepolia
- ✅ TEE facilitator running in ROFL (Docker container)
- ✅ File-based ledger (`data/tee-ledger.json`) working
- ✅ Payment flow end-to-end: deposit → sign → settle → seller paid
- ✅ Balance query working (`/balance/:address`)
- ✅ Attestation endpoint returning TEE measurement
- ✅ No on-chain buyer-seller linkage

### Out of Scope (Post-MVP)

- ❌ Redundant TEE instances
- ❌ Ledger backup/recovery
- ❌ Gas relay for buyers
- ❌ Encrypted intent payloads (assume HTTPS sufficient)
- ❌ Multi-facilitator support

---

## 15. Integration with Existing Infrastructure

### Seller Server

Add new strategy to registry:

```typescript
// seller/server.ts
import { TEEFacilitatorStrategy } from "./strategies/TEEFacilitatorStrategy.js";

registry.register(new ExactStrategy(...));
registry.register(new EscrowDeferredStrategy(...));
registry.register(new TEEFacilitatorStrategy(...)); // NEW
```

**Endpoint**: `/api/content/:resource?scheme=x402-tee-facilitator`

### Facilitator Server (Running in TEE)

Add new route:

```typescript
// facilitator/server.ts
import { teeSettleRouter } from "./routes/teeSettle.js";
import { balanceRouter } from "./routes/balance.js";

app.use("/tee-settle", teeSettleRouter);
app.use("/balance", balanceRouter);
```

**Same multi-chain config** as existing facilitator (dynamic provider selection).

### Buyer Agent

Add new scheme handler (similar to existing):

```typescript
// buyer/agent.ts
if (requirements.scheme === "x402-tee-facilitator") {
  // Sign EIP-712 intent
  // Send to TEE facilitator with full intent struct
  // Wait for receipt with updated balance
}
```

---

## 16. Testing Strategy

### Unit Tests

- TEE ledger operations (deposit, spend, balance, nonce)
- Intent hash verification
- Signature recovery
- Balance overflow/underflow checks
- File atomic write operations

### Integration Tests

- Deploy OmnibusVault on local Anvil
- Run facilitator (non-TEE) with file ledger
- Test deposit → verify ledger updated
- Test payment → verify seller received funds
- Test balance query
- Test insufficient balance rejection

### E2E Test (Local)

Full flow without ROFL:

1. Deploy OmnibusVault on Base Sepolia
2. Run facilitator locally (with file ledger)
3. Buyer deposits 1 USDC
4. Buyer requests content with TEE scheme
5. Buyer signs and sends payment
6. Verify seller received payment
7. Verify ledger updated
8. Verify on-chain no buyer-seller link

### E2E Test (ROFL)

Same flow but with facilitator in ROFL:

1. Deploy ROFL instance
2. Set secrets
3. Run full payment flow
4. Verify attestation endpoint
5. Verify ledger persists across requests

---

_This specification defines the complete TEE facilitator scheme, ready for implementation with Oasis ROFL support._
