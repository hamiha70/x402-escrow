/**
 * x402 TEE Facilitator - ROFL App
 * 
 * Standalone application running inside Oasis ROFL Trusted Execution Environment.
 * Handles x402-tee-facilitator scheme with private buyer-seller accounting.
 * 
 * This app runs INDEPENDENTLY from the main facilitator server.
 */

import express from "express";
import { ethers } from "ethers";
import { createLogger } from "./utils/logger.js";
import { getChainConfig, getPrivateKey } from "./utils/config.js";
import { TEELedgerManager } from "./services/TEELedgerManager.js";
import { OmnibusVaultManager } from "./services/OmnibusVaultManager.js";
import { createSettleRouter } from "./routes/settle.js";
import { createBalanceRouter } from "./routes/balance.js";
import { createActivityRouter } from "./routes/activity.js";
import { createAttestationRouter } from "./routes/attestation.js";

const logger = createLogger("rofl-app");

const PORT = process.env.PORT || 8080;
const LEDGER_PATH = process.env.LEDGER_PATH || "/data/tee-ledger.json";

// Initialize Express app
const app = express();
app.use(express.json());

// Provider and wallet cache (per chain)
const providerCache = new Map<number, ethers.JsonRpcProvider>();
const walletCache = new Map<number, ethers.Wallet>();

function getProvider(chainId: number): ethers.JsonRpcProvider {
	if (!providerCache.has(chainId)) {
		const config = getChainConfig(chainId);
		const provider = new ethers.JsonRpcProvider(config.rpc);
		providerCache.set(chainId, provider);
		logger.info(`Provider created for chain ${chainId} (${config.name})`);
	}
	return providerCache.get(chainId)!;
}

function getWallet(chainId: number): ethers.Wallet {
	if (!walletCache.has(chainId)) {
		const privateKey = getPrivateKey(chainId);
		const provider = getProvider(chainId);
		const wallet = new ethers.Wallet(privateKey, provider);
		walletCache.set(chainId, wallet);
		logger.info(`Wallet created for chain ${chainId}: ${wallet.address}`);
	}
	return walletCache.get(chainId)!;
}

function getVaultAddress(chainId: number): string {
	const config = getChainConfig(chainId);
	return config.omnibusVault;
}

// Initialize services
logger.info("Initializing TEE Ledger Manager...");
const ledger = new TEELedgerManager(LEDGER_PATH);

logger.info("Initializing Omnibus Vault Manager...");
const vaultManager = new OmnibusVaultManager({
	getProvider,
	getWallet,
	getVaultAddress,
});

// Register routes
app.use("/settle", createSettleRouter(ledger, vaultManager));
app.use("/balance", createBalanceRouter(ledger));
app.use("/activity", createActivityRouter(ledger));
app.use("/attestation", createAttestationRouter());

// Health check
app.get("/health", (req, res) => {
	const stats = ledger.getStats();
	res.status(200).json({
		status: "healthy",
		uptime: process.uptime(),
		ledger: stats,
		timestamp: Date.now(),
	});
});

// Start server
app.listen(PORT, () => {
	logger.info(`═══════════════════════════════════════════════════════`);
	logger.info(`x402 TEE Facilitator (ROFL) running on port ${PORT}`);
	logger.info(`═══════════════════════════════════════════════════════`);
	logger.info(`Ledger path: ${LEDGER_PATH}`);
	logger.info(`Ledger stats: ${JSON.stringify(ledger.getStats())}`);
	logger.info(`Endpoints:`);
	logger.info(`  POST /settle          - TEE payment settlement`);
	logger.info(`  GET  /balance/:addr   - Query buyer balance`);
	logger.info(`  GET  /activity        - Activity log (demo)`);
	logger.info(`  GET  /attestation     - TEE measurement`);
	logger.info(`  GET  /health          - Health check`);
	logger.info(`═══════════════════════════════════════════════════════`);
});

