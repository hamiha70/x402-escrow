/**
 * x402 Facilitator - Synchronous Settlement
 * 
 * Validates payment intents and executes immediate on-chain settlement
 * before confirming to the seller.
 * 
 * Flow:
 * 1. Seller forwards payment from buyer
 * 2. Facilitator verifies EIP-712 signature
 * 3. Facilitator executes transferFrom (requires prior approval)
 * 4. Facilitator returns settlement confirmation
 * 5. Seller delivers content
 */

import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { createLogger } from "../shared/logger.js";
import type {
	PaymentPayload,
	PaymentContext,
	PaymentResponse,
	PaymentRequirements,
} from "../shared/types.js";
import { processExactPayment } from "./services/ExactSettlement.js";
import type { ExactSettlementConfig } from "./services/ExactSettlement.js";
import { processEscrowDeferredPayment } from "./services/EscrowDeferredValidation.js";
import type { EscrowDeferredConfig } from "./services/EscrowDeferredValidation.js";
import { processAllPending } from "./services/BatchSettler.js";
import type { BatchSettlerConfig } from "./services/BatchSettler.js";
import queue from "./services/SettlementQueue.js";

dotenv.config();

const logger = createLogger("facilitator");
const app = express();
app.use(express.json());

// Environment configuration
const PORT = process.env.FACILITATOR_PORT || 4023;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY;
const FACILITATOR_ADDRESS = process.env.FACILITATOR_WALLET_ADDRESS;

if (!FACILITATOR_PRIVATE_KEY || !FACILITATOR_ADDRESS) {
	throw new Error("Missing required environment variables: FACILITATOR_PRIVATE_KEY, FACILITATOR_WALLET_ADDRESS");
}

// Multi-chain configuration
const CHAIN_CONFIG: Record<number, { rpc: string; usdc: string; name: string }> = {
	84532: { rpc: process.env.BASE_SEPOLIA_RPC!, usdc: process.env.USDC_BASE_SEPOLIA!, name: "Base Sepolia" },
	80002: { rpc: process.env.POLYGON_AMOY_RPC!, usdc: process.env.USDC_POLYGON_AMOY!, name: "Polygon Amoy" },
	421614: { rpc: process.env.ARBITRUM_SEPOLIA_RPC!, usdc: process.env.USDC_ARBITRUM_SEPOLIA!, name: "Arbitrum Sepolia" },
	11155420: { rpc: process.env.OPTIMISM_SEPOLIA_RPC!, usdc: process.env.USDC_OPTIMISM_SEPOLIA!, name: "Optimism Sepolia" },
	1243: { rpc: process.env.ARC_TESTNET_RPC!, usdc: process.env.USDC_ARC_TESTNET!, name: "Arc Testnet" },
	11155111: { rpc: process.env.ETHEREUM_SEPOLIA_RPC!, usdc: process.env.USDC_ETHEREUM_SEPOLIA!, name: "Ethereum Sepolia" }
};

// Provider and wallet cache (one per chain)
const providerCache = new Map<number, ethers.JsonRpcProvider>();
const walletCache = new Map<number, ethers.Wallet>();

function getProvider(chainId: number): ethers.JsonRpcProvider {
	if (!providerCache.has(chainId)) {
		const config = CHAIN_CONFIG[chainId];
		if (!config || !config.rpc) {
			throw new Error(`Chain ${chainId} not configured or RPC URL missing`);
		}
		providerCache.set(chainId, new ethers.JsonRpcProvider(config.rpc));
	}
	return providerCache.get(chainId)!;
}

function getWallet(chainId: number): ethers.Wallet {
	if (!walletCache.has(chainId)) {
		const provider = getProvider(chainId);
		walletCache.set(chainId, new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider));
	}
	return walletCache.get(chainId)!;
}

function getChainConfig(chainId: number) {
	const config = CHAIN_CONFIG[chainId];
	if (!config) {
		throw new Error(`Chain ${chainId} not supported`);
	}
	return config;
}

// Create settlement config (for exact scheme)
const settlementConfig: ExactSettlementConfig = {
	getProvider,
	getWallet,
	getChainConfig,
};

// Create validation config (for escrow-deferred scheme)
const validationConfig: EscrowDeferredConfig = {
	getProvider,
	getChainConfig,
};

// Create batch settler config
const batchSettlerConfig: BatchSettlerConfig = {
	getProvider,
	getWallet,
	getChainConfig,
};

/**
 * POST /settle
 * 
 * Validate and settle a payment intent synchronously
 */
app.post("/settle", async (req, res) => {
	try {
		const payload: PaymentPayload = req.body;

		// Validate payload structure (two-signature pattern)
		if (!payload.scheme || !payload.data || !payload.data.intent || 
		    !payload.data.x402Signature || !payload.data.transferAuth || !payload.data.eip3009Signature) {
			return res.status(400).json({
				error: "Invalid payment payload structure (requires x402Signature, transferAuth, eip3009Signature)",
			});
		}

		logger.info(`Received settlement request for resource: ${payload.data.intent.resource}`);

		// Create payment context
		const context: PaymentContext = {
			scheme: "x402-exact",
			chainId: payload.data.intent.chainId,
			chainSlug: "", // Not needed for facilitator
			token: payload.data.intent.token,
			seller: payload.data.intent.seller,
			resource: payload.data.intent.resource,
			mode: "synchronous",
		};

		// Process payment (validate + settle synchronously)
		const paymentResponse = await processExactPayment(payload, context, settlementConfig);

		if (paymentResponse.status === "failed") {
			logger.warn(`Payment processing failed: ${paymentResponse.error}`);
			return res.status(400).json(paymentResponse);
		}

		logger.success(`Payment settled successfully: ${paymentResponse.txHash}`);
		return res.status(200).json(paymentResponse);
	} catch (error: any) {
		logger.error("Unexpected error", error);
		return res.status(500).json({
			error: "Internal server error",
			details: error.message,
		});
	}
});

/**
 * POST /validate-intent
 * 
 * Validation endpoint for x402-escrow-deferred scheme
 * Validates payment intent and queues for batch settlement
 */
app.post("/validate-intent", async (req, res) => {
	try {
		const { requirements, payload } = req.body as {
			requirements: PaymentRequirements;
			payload: PaymentPayload;
		};

		// Validate payload structure
		if (!requirements || !payload || !payload.data || !payload.data.intent || !payload.data.x402Signature) {
			return res.status(400).json({
				error: "Invalid request structure (requires requirements and payload)",
			});
		}

		// Check for vault address
		if (!requirements.vault) {
			return res.status(400).json({
				error: "Vault address required for escrow-deferred scheme",
			});
		}

		logger.info(`Received validation request for resource: ${payload.data.intent.resource}`);

		// Create payment context
		const context: PaymentContext = {
			scheme: "x402-escrow-deferred",
			chainId: payload.data.intent.chainId,
			chainSlug: requirements.network,
			token: payload.data.intent.token,
			vault: requirements.vault,
			seller: payload.data.intent.seller,
			resource: payload.data.intent.resource,
			mode: "deferred",
		};

		// Process payment (validate + queue)
		const paymentResponse = await processEscrowDeferredPayment(
			payload,
			requirements,
			context,
			validationConfig
		);

		if (paymentResponse.status === "failed") {
			logger.warn(`Validation failed: ${paymentResponse.error}`);
			return res.status(400).json(paymentResponse);
		}

		logger.success(`Intent validated and queued: ${paymentResponse.intentNonce}`);
		return res.status(200).json(paymentResponse);
	} catch (error: any) {
		logger.error("Unexpected error", error);
		return res.status(500).json({
			error: "Internal server error",
			details: error.message,
		});
	}
});

/**
 * POST /settle-batch
 * 
 * Trigger batch settlement of pending escrow-deferred intents
 */
app.post("/settle-batch", async (req, res) => {
	try {
		logger.info("Batch settlement triggered");
		
		const result = await processAllPending(batchSettlerConfig);
		
		return res.json({
			success: true,
			batchesProcessed: result.totalBatches,
			intentsSettled: result.totalSettled,
			errors: result.errors,
			queueStats: queue.getStats(),
		});
	} catch (error: any) {
		logger.error("Batch settlement error", error);
		return res.status(500).json({
			error: "Batch settlement failed",
			details: error.message,
		});
	}
});

/**
 * GET /queue
 * 
 * Get queue statistics
 */
app.get("/queue", (req, res) => {
	const stats = queue.getStats();
	const pending = queue.getPending();
	
	return res.json({
		stats,
		pending: pending.map(r => ({
			id: r.id,
			buyer: r.buyer,
			seller: r.seller,
			amount: r.amount,
			vault: r.vault,
			chainId: r.chainId,
			createdAt: r.createdAt,
		})),
	});
});

/**
 * GET /health
 */
app.get("/health", (req, res) => {
	const stats = queue.getStats();
	
	res.json({
		status: "healthy",
		facilitator: FACILITATOR_ADDRESS,
		supportedChains: Object.keys(CHAIN_CONFIG).map(id => ({
			chainId: parseInt(id),
			name: CHAIN_CONFIG[parseInt(id)].name,
		})),
		endpoints: {
			settle: "/settle (x402-exact)",
			validateIntent: "/validate-intent (x402-escrow-deferred)",
			settleBatch: "/settle-batch (trigger batch settlement)",
			queue: "/queue (view queue status)",
		},
		queue: stats,
	});
});

/**
 * Start server
 */
app.listen(PORT, () => {
	logger.success(`Facilitator running on port ${PORT}`);
	logger.info(`Multi-chain facilitator - Supports:`);
	Object.entries(CHAIN_CONFIG).forEach(([chainId, config]) => {
		if (config.rpc && config.usdc) {
			logger.info(`  • ${config.name} (${chainId}): ${config.usdc}`);
		}
	});
	logger.info(`Facilitator address: ${FACILITATOR_ADDRESS}`);
	logger.info(`Endpoints:`);
	logger.info(`  • POST /settle - x402-exact (synchronous EIP-3009)`);
	logger.info(`  • POST /validate-intent - x402-escrow-deferred (deferred batch settlement)`);
	logger.info(`✅ NO APPROVAL NEEDED - gasless for buyers!`);
});

