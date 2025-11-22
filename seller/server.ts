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
const USDC_BASE_SEPOLIA = process.env.USDC_BASE_SEPOLIA;
const CHAIN_ID = 84532; // Base Sepolia
const PAYMENT_AMOUNT = process.env.PAYMENT_AMOUNT || "10000"; // 0.01 USDC (6 decimals)

if (!SELLER_ADDRESS || !USDC_BASE_SEPOLIA) {
	throw new Error("Missing required environment variables");
}

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
function generatePaymentRequirements(resource: string): PaymentRequirements {
	return {
		network: "base-sepolia",
		token: "USDC",
		tokenAddress: USDC_BASE_SEPOLIA!,
		amount: "0.01",
		decimals: 6,
		seller: SELLER_ADDRESS!,
		resource,
		facilitator: `${FACILITATOR_URL}/settle`,
		chainId: CHAIN_ID,
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
 * GET /api/content/premium
 * 
 * Protected endpoint requiring payment
 */
app.get("/api/content/premium", async (req, res) => {
	const resource = "/api/content/premium";

	// Check for payment header
	const paymentHeader = req.headers["x-payment"];

	if (!paymentHeader) {
		// No payment provided → return 402 with requirements
		const requirements = generatePaymentRequirements(resource);

		logger.info(`402 Payment Required for: ${resource}`);

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
		return res.status(400).json({ error: "Invalid X-PAYMENT header format" });
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

	// Validate amount
	if (payload.data.intent.amount !== PAYMENT_AMOUNT) {
		logger.warn(`Amount mismatch: expected ${PAYMENT_AMOUNT}, got ${payload.data.intent.amount}`);
		return res.status(400).json({
			error: `Invalid payment amount. Expected ${PAYMENT_AMOUNT}`,
		});
	}

	// Forward to facilitator for settlement
	logger.info(`Processing payment from buyer: ${payload.data.intent.buyer}`);

	let paymentResponse: PaymentResponse;
	try {
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
		return res.status(402).json({
			error: "Payment settlement failed",
			details: paymentResponse.error,
		});
	}

	// Payment successful → deliver content
	logger.success(`Payment settled: ${paymentResponse.txHash}`);
	logger.info(`Delivering content to: ${paymentResponse.buyer}`);

	return res.status(200)
		.header("X-PAYMENT-RESPONSE", JSON.stringify(paymentResponse))
		.json({
			content: PREMIUM_CONTENT,
			payment: {
				txHash: paymentResponse.txHash,
				amount: paymentResponse.amount,
			},
		});
});

/**
 * GET /health
 */
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		seller: SELLER_ADDRESS,
		facilitator: FACILITATOR_URL,
		paymentAmount: PAYMENT_AMOUNT,
	});
});

/**
 * Start server
 */
app.listen(PORT, () => {
	logger.success(`Seller server running on port ${PORT}`);
	logger.info(`Seller address: ${SELLER_ADDRESS}`);
	logger.info(`Facilitator: ${FACILITATOR_URL}`);
	logger.info(`Payment amount: ${PAYMENT_AMOUNT} (${Number(PAYMENT_AMOUNT) / 1e6} USDC)`);
	logger.info(`Protected endpoint: GET /api/content/premium`);
});

