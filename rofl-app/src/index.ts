/**
 * x402 TEE ROFL App
 * 
 * Standalone service running inside Oasis ROFL (Trusted Execution Environment).
 * Handles ONLY the x402-tee-facilitator payment scheme.
 * 
 * Architecture:
 * - Runs independently in TEE (not part of main facilitator)
 * - Main facilitator proxies TEE requests here
 * - Maintains private buyer accounting in sealed storage
 * - Settles to sellers via OmnibusVault contracts
 */

import express from "express";
import { ethers } from "ethers";
import { TEELedgerManager } from "./services/TEELedgerManager.js";
import { OmnibusVaultManager } from "./services/OmnibusVaultManager.js";
import { createSettleRouter } from "./routes/settle.js";
import { createBalanceRouter } from "./routes/balance.js";
import { createActivityRouter } from "./routes/activity.js";
import { createAttestationRouter } from "./routes/attestation.js";
import { logger } from "./utils/logger.js";

const app = express();
app.use(express.json());

// Configuration from ROFL secrets (injected as environment variables)
const PORT = process.env.PORT || 8080;
const LEDGER_PATH = process.env.TEE_LEDGER_PATH || "/data/tee-ledger.json";

// Multi-chain configuration (from ROFL secrets)
const CHAIN_CONFIG: Record<number, { 
	rpc: string; 
	usdc: string; 
	vault: string;
	privateKey: string;
	name: string;
}> = {
	84532: {
		rpc: process.env.BASE_SEPOLIA_RPC!,
		usdc: process.env.USDC_BASE_SEPOLIA!,
		vault: process.env.OMNIBUS_VAULT_BASE_SEPOLIA!,
		privateKey: process.env.TEE_FACILITATOR_PRIVATE_KEY_BASE!,
		name: "Base Sepolia"
	},
	80002: {
		rpc: process.env.POLYGON_AMOY_RPC!,
		usdc: process.env.USDC_POLYGON_AMOY!,
		vault: process.env.OMNIBUS_VAULT_POLYGON_AMOY!,
		privateKey: process.env.TEE_FACILITATOR_PRIVATE_KEY_POLYGON!,
		name: "Polygon Amoy"
	},
	421614: {
		rpc: process.env.ARBITRUM_SEPOLIA_RPC!,
		usdc: process.env.USDC_ARBITRUM_SEPOLIA!,
		vault: process.env.OMNIBUS_VAULT_ARBITRUM_SEPOLIA!,
		privateKey: process.env.TEE_FACILITATOR_PRIVATE_KEY_ARBITRUM!,
		name: "Arbitrum Sepolia"
	},
	11155420: {
		rpc: process.env.OPTIMISM_SEPOLIA_RPC!,
		usdc: process.env.USDC_OPTIMISM_SEPOLIA!,
		vault: process.env.OMNIBUS_VAULT_OPTIMISM_SEPOLIA!,
		privateKey: process.env.TEE_FACILITATOR_PRIVATE_KEY_OPTIMISM!,
		name: "Optimism Sepolia"
	},
	5042002: {
		rpc: process.env.ARC_TESTNET_RPC!,
		usdc: process.env.USDC_ARC_TESTNET!,
		vault: process.env.OMNIBUS_VAULT_ARC_TESTNET!,
		privateKey: process.env.TEE_FACILITATOR_PRIVATE_KEY_ARC!,
		name: "Arc Testnet"
	}
};

// Provider and wallet cache (per chain)
const providerCache = new Map<number, ethers.JsonRpcProvider>();
const walletCache = new Map<number, ethers.Wallet>();

function getProvider(chainId: number): ethers.JsonRpcProvider {
	if (!providerCache.has(chainId)) {
		const config = CHAIN_CONFIG[chainId];
		if (!config || !config.rpc) {
			throw new Error(`Chain ${chainId} not configured`);
		}
		providerCache.set(chainId, new ethers.JsonRpcProvider(config.rpc));
	}
	return providerCache.get(chainId)!;
}

function getWallet(chainId: number): ethers.Wallet {
	if (!walletCache.has(chainId)) {
		const config = CHAIN_CONFIG[chainId];
		if (!config || !config.privateKey) {
			throw new Error(`Chain ${chainId} wallet not configured`);
		}
		const provider = getProvider(chainId);
		walletCache.set(chainId, new ethers.Wallet(config.privateKey, provider));
	}
	return walletCache.get(chainId)!;
}

function getVaultAddress(chainId: number): string {
	const config = CHAIN_CONFIG[chainId];
	if (!config || !config.vault) {
		throw new Error(`Chain ${chainId} vault not configured`);
	}
	return config.vault;
}

// Initialize TEE services
logger.info("Initializing TEE services...");
const ledger = new TEELedgerManager(LEDGER_PATH);
const vaultManager = new OmnibusVaultManager({
	getProvider,
	getWallet,
	getVaultAddress,
});

logger.info(`Ledger initialized at ${LEDGER_PATH}`);
logger.info(`Supported chains: ${Object.keys(CHAIN_CONFIG).join(", ")}`);

// Register routes
app.use("/settle", createSettleRouter(ledger, vaultManager));
app.use("/balance", createBalanceRouter(ledger));
app.use("/activity", createActivityRouter(ledger));
app.use("/attestation", createAttestationRouter());

// Health check
app.get("/health", (req, res) => {
	const stats = ledger.getStats();
	res.json({
		status: "healthy",
		service: "x402-tee-rofl-app",
		version: "1.0.0",
		ledger: {
			path: LEDGER_PATH,
			stats: stats,
		},
		chains: Object.keys(CHAIN_CONFIG).map(Number),
	});
});

// Start server
app.listen(PORT, () => {
	logger.info("=".repeat(50));
	logger.info(`x402 TEE ROFL App running on port ${PORT}`);
	logger.info(`Ledger: ${LEDGER_PATH}`);
	logger.info(`Chains: ${Object.values(CHAIN_CONFIG).map(c => c.name).join(", ")}`);
	logger.info("=".repeat(50));
});

// Graceful shutdown
process.on("SIGTERM", () => {
	logger.info("SIGTERM received, shutting down gracefully");
	process.exit(0);
});
