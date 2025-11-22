/**
 * x402 Seller Server
 * 
 * Serves protected content with HTTP 402 payment flow.
 * Delegates payment verification and settlement to facilitator.
 * 
 * Flow:
 * 1. Client requests protected resource without payment → 402
 * 2. Client retries with X-PAYMENT header
 * 3. Seller forwards to facilitator for settlement
 * 4. If settlement succeeds → 200 + content
 * 5. If settlement fails → 402 with error
 */

import express from "express";
import dotenv from "dotenv";
import { createLogger } from "../shared/logger.js";
import type {
	PaymentPayload,
	PaymentContext,
} from "../shared/types.js";
import { createDefaultRegistry } from "./strategies/StrategyRegistry.js";
import type { PaymentStrategy } from "./strategies/PaymentStrategy.js";

dotenv.config();

const logger = createLogger("seller");
const app = express();
app.use(express.json());

// Environment configuration
const PORT = process.env.SELLER_PORT || 4022;
const SELLER_ADDRESS = process.env.SELLER_WALLET_ADDRESS;
const FACILITATOR_URL = process.env.FACILITATOR_URL || "http://localhost:4023";
const USDC_DECIMALS = 6;

// Payment amount from env (human-readable, e.g. "0.01")
const PAYMENT_AMOUNT_DISPLAY = process.env.PAYMENT_AMOUNT || "0.01";
// Convert to raw units for on-chain comparison (e.g. "10000")
const PAYMENT_AMOUNT_RAW = String(Number(PAYMENT_AMOUNT_DISPLAY) * 10 ** USDC_DECIMALS);

if (!SELLER_ADDRESS) {
	throw new Error("Missing required environment variable: SELLER_WALLET_ADDRESS");
}

// Multi-chain configuration
interface ChainConfig {
	chainId: number;
	name: string;
	networkSlug: string;
	usdc: string;
	enabled: boolean;
}

const CHAINS: ChainConfig[] = [
	{ chainId: 84532, name: "Base Sepolia", networkSlug: "base-sepolia", usdc: process.env.USDC_BASE_SEPOLIA || "", enabled: !!process.env.USDC_BASE_SEPOLIA },
	{ chainId: 80002, name: "Polygon Amoy", networkSlug: "polygon-amoy", usdc: process.env.USDC_POLYGON_AMOY || "", enabled: !!process.env.USDC_POLYGON_AMOY },
	{ chainId: 421614, name: "Arbitrum Sepolia", networkSlug: "arbitrum-sepolia", usdc: process.env.USDC_ARBITRUM_SEPOLIA || "", enabled: !!process.env.USDC_ARBITRUM_SEPOLIA },
	{ chainId: 11155420, name: "Optimism Sepolia", networkSlug: "optimism-sepolia", usdc: process.env.USDC_OPTIMISM_SEPOLIA || "", enabled: !!process.env.USDC_OPTIMISM_SEPOLIA },
	{ chainId: 1243, name: "Arc Testnet", networkSlug: "arc", usdc: process.env.USDC_ARC_TESTNET || "", enabled: !!process.env.USDC_ARC_TESTNET },
	{ chainId: 11155111, name: "Ethereum Sepolia", networkSlug: "ethereum-sepolia", usdc: process.env.USDC_ETHEREUM_SEPOLIA || "", enabled: !!process.env.USDC_ETHEREUM_SEPOLIA },
];

const enabledChains = CHAINS.filter(c => c.enabled);

// Initialize strategy registry
const strategyRegistry = createDefaultRegistry(
	FACILITATOR_URL,
	PAYMENT_AMOUNT_DISPLAY,
	PAYMENT_AMOUNT_RAW,
	USDC_DECIMALS
);

/**
 * Protected content (example)
 */
const PREMIUM_CONTENT = {
	title: "Premium AI Model Output",
	data: {
		model: "gpt-4",
		response: "This is premium content available only to paying users.",
		timestamp: new Date().toISOString(),
	},
	metadata: {
		contentType: "ai-response",
		version: "1.0",
	},
};

/**
 * Compute canonical resource path (scheme-independent)
 * Removes query parameters like ?scheme= to ensure resource binding consistency
 */
function getCanonicalResource(req: express.Request): string {
	const url = new URL(req.url, `http://${req.headers.host}`);
	return url.pathname; // Returns path without query string
}

/**
 * Get payment context from request and chain config
 */
function createPaymentContext(
	chain: ChainConfig,
	resource: string,
	scheme: string = "x402-exact"
): PaymentContext {
	return {
		scheme: scheme as any,
		chainId: chain.chainId,
		chainSlug: chain.networkSlug,
		token: chain.usdc,
		seller: SELLER_ADDRESS!,
		resource,
		mode: scheme === "x402-exact" ? "synchronous" : "deferred",
	};
}

/**
 * Create protected endpoint handler for a specific chain
 */
function createChainEndpoint(chain: ChainConfig) {
	return async (req: express.Request, res: express.Response) => {
		// Get canonical resource (scheme-independent)
		const canonicalResource = getCanonicalResource(req);
		
		// Determine scheme from query parameter (default to exact for MVP)
		const schemeParam = (req.query.scheme as string) || "x402-exact";
		const strategy = strategyRegistry.get(schemeParam);

		if (!strategy) {
			logger.warn(`Unknown scheme: ${schemeParam}`);
			return res.status(400).json({
				error: `Unknown payment scheme: ${schemeParam}. Supported: ${strategyRegistry.getSchemes().join(", ")}`,
			});
		}

		// Create payment context
		const context = createPaymentContext(chain, canonicalResource, schemeParam);

		// Check for payment header
		const paymentHeader = req.headers["x-payment"];

		if (!paymentHeader) {
			// No payment provided → return 402 with requirements for this scheme
			const requirements = strategy.generateRequirements(canonicalResource, context);

			logger.info(`402 Payment Required for: ${canonicalResource} on ${chain.name} (scheme: ${schemeParam})`);

			return res.status(402).json({
				error: "Payment required",
				PaymentRequirements: [requirements],
			});
		}

		// Parse payment payload
		let payload: PaymentPayload;
		try {
			payload = typeof paymentHeader === "string"
				? JSON.parse(paymentHeader)
				: paymentHeader;
		} catch (error) {
			logger.warn("Invalid payment payload format");
			return res.status(400).json({ error: "Invalid x-payment header format" });
		}

		// Get requirements for validation
		const requirements = strategy.generateRequirements(canonicalResource, context);

		// Validate payment using strategy
		logger.info(`Processing payment from buyer: ${payload.data.intent.buyer} on ${chain.name} (scheme: ${schemeParam})`);

		const validation = await strategy.validatePayment(payload, requirements, context);

		if (!validation.valid) {
			logger.warn(`Payment validation failed: ${validation.error}`);
			return res.status(400).json({
				error: validation.error || "Payment validation failed",
			});
		}

		// Payment successful → deliver content
		const receipt = validation.receipt!;
		logger.success(`Payment validated on ${chain.name} (scheme: ${schemeParam})`);
		
		if (receipt.status === "settled") {
			logger.info(`Transaction: ${receipt.txHash}`);
		} else {
			logger.info(`Status: ${receipt.status} (mode: ${context.mode})`);
		}

		return res.status(200)
			.header("x-payment-response", JSON.stringify(receipt))
			.json({
				content: PREMIUM_CONTENT,
				payment: {
					txHash: receipt.txHash,
					status: receipt.status,
					amount: receipt.amount,
					chain: chain.name,
					chainId: chain.chainId,
					scheme: schemeParam,
				},
			});
	};
}

// Register endpoints for each enabled chain
enabledChains.forEach(chain => {
	const endpoint = `/api/content/premium/${chain.networkSlug}`;
	app.get(endpoint, createChainEndpoint(chain));
	logger.info(`Registered endpoint: ${endpoint} (${chain.name})`);
});

// Legacy endpoint (defaults to Base Sepolia for backwards compatibility)
const baseChain = enabledChains.find(c => c.chainId === 84532);
if (baseChain) {
	app.get("/api/content/premium", createChainEndpoint(baseChain));
	logger.info(`Registered legacy endpoint: /api/content/premium (defaults to Base Sepolia)`);
}

/**
 * GET /health
 */
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		seller: SELLER_ADDRESS,
		facilitator: FACILITATOR_URL,
		paymentAmount: PAYMENT_AMOUNT_DISPLAY,
		schemes: strategyRegistry.getSchemes(),
		chains: enabledChains.map(c => ({ name: c.name, chainId: c.chainId, endpoint: `/api/content/premium/${c.networkSlug}` })),
	});
});

/**
 * Start server
 */
app.listen(PORT, () => {
	logger.success(`Seller server running on port ${PORT}`);
	logger.info(`Multi-chain seller - Accepting payments on:`);
	enabledChains.forEach(chain => {
		logger.info(`  • ${chain.name} (${chain.chainId}): /api/content/premium/${chain.networkSlug}`);
	});
	logger.info(`Seller address: ${SELLER_ADDRESS}`);
	logger.info(`Facilitator: ${FACILITATOR_URL}`);
	logger.info(`Payment amount: ${PAYMENT_AMOUNT_DISPLAY} USDC per request`);
	logger.info(`Supported schemes: ${strategyRegistry.getSchemes().join(", ")}`);
});

