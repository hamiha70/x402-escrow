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
import axios from "axios";
import dotenv from "dotenv";
import { createLogger } from "../shared/logger.js";
import type {
	PaymentRequirements,
	PaymentPayload,
	PaymentResponse,
} from "../shared/types.js";

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
 * Generate payment requirements for 402 response
 */
function generatePaymentRequirements(resource: string, chain: ChainConfig): PaymentRequirements {
	return {
		network: chain.networkSlug,
		token: "USDC",
		tokenAddress: chain.usdc,
		amount: PAYMENT_AMOUNT_DISPLAY, // Human-readable (e.g. "0.01")
		decimals: USDC_DECIMALS,
		seller: SELLER_ADDRESS!,
		resource,
		facilitator: `${FACILITATOR_URL}/settle`,
		chainId: chain.chainId,
		schemes: ["intent"],
		expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes
	};
}

/**
 * Verify payment by forwarding to facilitator
 */
async function verifyAndSettlePayment(
	payload: PaymentPayload,
): Promise<PaymentResponse> {
	try {
		logger.info(`Forwarding payment to facilitator: ${FACILITATOR_URL}/settle`);

		const response = await axios.post(`${FACILITATOR_URL}/settle`, payload, {
			headers: { "Content-Type": "application/json" },
			timeout: 30000, // 30s timeout (settlement can take time)
		});

		return response.data as PaymentResponse;
	} catch (error: any) {
		if (error.response) {
			// Facilitator returned an error
			logger.error(`Facilitator error: ${error.response.status}`);
			return error.response.data as PaymentResponse;
		}
		// Network or other error
		logger.error(`Failed to reach facilitator: ${error.message}`);
		throw new Error("Facilitator unavailable");
	}
}

/**
 * Create protected endpoint handler for a specific chain
 */
function createChainEndpoint(chain: ChainConfig) {
	return async (req: express.Request, res: express.Response) => {
		const resource = `/api/content/premium/${chain.networkSlug}`;

		// Check for payment header
		const paymentHeader = req.headers["x-payment"];

		if (!paymentHeader) {
			// No payment provided → return 402 with requirements for this chain
			const requirements = generatePaymentRequirements(resource, chain);

			logger.info(`402 Payment Required for: ${resource} on ${chain.name}`);

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

		// Validate chain ID matches
		if (payload.data.intent.chainId !== chain.chainId) {
			logger.warn(`Chain ID mismatch: expected ${chain.chainId} (${chain.name}), got ${payload.data.intent.chainId}`);
			return res.status(400).json({
				error: `Payment intent for wrong chain. Expected ${chain.name} (${chain.chainId})`,
			});
		}

		// Validate resource matches
		if (payload.data.intent.resource !== resource) {
			logger.warn(`Resource mismatch: expected ${resource}, got ${payload.data.intent.resource}`);
			return res.status(400).json({
				error: "Payment intent resource does not match requested resource",
			});
		}

		// Validate seller matches
		if (payload.data.intent.seller.toLowerCase() !== SELLER_ADDRESS!.toLowerCase()) {
			logger.warn(`Seller mismatch: expected ${SELLER_ADDRESS}, got ${payload.data.intent.seller}`);
			return res.status(400).json({
				error: "Payment intent seller does not match this seller",
			});
		}

		// Validate USDC address matches chain
		if (payload.data.intent.token.toLowerCase() !== chain.usdc.toLowerCase()) {
			logger.warn(`Token mismatch: expected ${chain.usdc} for ${chain.name}, got ${payload.data.intent.token}`);
			return res.status(400).json({
				error: `Invalid USDC address for ${chain.name}`,
			});
		}

		// Validate amount (compare raw units)
		if (payload.data.intent.amount !== PAYMENT_AMOUNT_RAW) {
			logger.warn(`Amount mismatch: expected ${PAYMENT_AMOUNT_RAW} (${PAYMENT_AMOUNT_DISPLAY} USDC), got ${payload.data.intent.amount}`);
			return res.status(400).json({
				error: `Invalid payment amount. Expected ${PAYMENT_AMOUNT_DISPLAY} USDC`,
			});
		}

		// Forward to facilitator for settlement
		logger.info(`Processing payment from buyer: ${payload.data.intent.buyer} on ${chain.name}`);

		let paymentResponse: PaymentResponse;
		try{
			paymentResponse = await verifyAndSettlePayment(payload);
		} catch (error: any) {
			logger.error(`Payment processing failed: ${error.message}`);
			return res.status(503).json({
				error: "Payment processing unavailable",
			});
		}

		// Check settlement result
		if (paymentResponse.status !== "settled") {
			logger.warn(`Payment settlement failed: ${paymentResponse.error}`);
			return res.status(500).json({
				error: "Payment settlement failed",
				details: paymentResponse.error,
			});
		}

		// Payment successful → deliver content
		logger.success(`Payment settled on ${chain.name}: ${paymentResponse.txHash}`);
		logger.info(`Delivering content to: ${paymentResponse.buyer}`);

		return res.status(200)
			.header("x-payment-response", JSON.stringify(paymentResponse))
			.json({
				content: PREMIUM_CONTENT,
				payment: {
					txHash: paymentResponse.txHash,
					amount: paymentResponse.amount,
					chain: chain.name,
					chainId: chain.chainId,
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
});

