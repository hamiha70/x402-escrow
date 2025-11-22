/**
 * x402 Buyer Agent
 * 
 * Automated buyer that:
 * 1. Requests protected content
 * 2. Receives 402 with payment requirements
 * 3. Signs payment intent (EIP-712)
 * 4. Retries request with payment
 * 5. Receives content after synchronous settlement
 * 
 * NOTE: Buyer must have approved facilitator to spend USDC before running
 */

import axios from "axios";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { createLogger } from "../shared/logger.js";
import {
	generateNonce,
	paymentIntentToTransferAuth,
	signTransferAuthorization,
} from "../shared/eip712.js";
import type {
	PaymentRequirements,
	PaymentIntent,
	PaymentPayload,
	PaymentResponse,
} from "../shared/types.js";

dotenv.config();

const logger = createLogger("buyer");

// Environment configuration
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const BUYER_ADDRESS = process.env.BUYER_WALLET_ADDRESS;
const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
const RPC_URL = process.env.BASE_SEPOLIA_RPC;

if (!BUYER_PRIVATE_KEY || !BUYER_ADDRESS || !RPC_URL) {
	throw new Error("Missing required environment variables");
}

// Setup provider and signer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);

/**
 * Request content from seller (first attempt - will receive 402)
 */
async function requestContent(
	endpoint: string,
): Promise<{ requirements?: PaymentRequirements; error?: string }> {
	try {
		const response = await axios.get(`${SELLER_URL}${endpoint}`);
		// If we get 200, content is free or already paid
		logger.info("Content received without payment");
		return {};
	} catch (error: any) {
		if (error.response?.status === 402) {
			// Payment required
			const requirements = error.response.data.PaymentRequirements?.[0];
			if (!requirements) {
				throw new Error("Invalid 402 response: missing PaymentRequirements");
			}
			logger.info("Received 402 Payment Required");
			return { requirements };
		}
		throw error;
	}
}

/**
 * Create and sign payment intent
 */
async function createPaymentIntent(
	requirements: PaymentRequirements,
): Promise<PaymentPayload> {
	const nonce = generateNonce();
	const expiry = Math.floor(Date.now() / 1000) + 180; // 3 minutes

	const intent: PaymentIntent = {
		seller: requirements.seller,
		buyer: BUYER_ADDRESS!,
		amount: String(Number(requirements.amount) * 10 ** requirements.decimals), // Convert to wei
		token: requirements.tokenAddress,
		nonce,
		expiry,
		resource: requirements.resource,
		chainId: requirements.chainId,
	};

	logger.info("Created payment intent", {
		seller: intent.seller,
		amount: `${requirements.amount} ${requirements.token}`,
		resource: intent.resource,
	});

	// Convert to EIP-3009 format and sign with USDC's domain
	const transferAuth = paymentIntentToTransferAuth(intent);
	
	logger.info("Signing EIP-3009 TransferWithAuthorization...");
	const signature = await signTransferAuthorization(
		transferAuth,
		requirements.tokenAddress,  // USDC address is the verifying contract
		requirements.chainId,
		buyerWallet,
	);
	logger.success("Signed EIP-3009 authorization (NO APPROVAL NEEDED!)");

	const payload: PaymentPayload = {
		scheme: "intent",
		data: {
			intent,
			signature,
		},
		metadata: {
			network: requirements.network,
			token: requirements.token,
			amount: requirements.amount,
		},
	};

	return payload;
}

/**
 * Submit payment and request content
 */
async function requestContentWithPayment(
	endpoint: string,
	payload: PaymentPayload,
): Promise<any> {
	try {
		logger.info("Submitting payment and requesting content...");

		const response = await axios.get(`${SELLER_URL}${endpoint}`, {
			headers: {
				"X-PAYMENT": JSON.stringify(payload),
			},
			timeout: 35000, // 35s (settlement takes time)
		});

		const paymentResponseHeader = response.headers["x-payment-response"];
		const paymentResponse: PaymentResponse | undefined = paymentResponseHeader
			? JSON.parse(paymentResponseHeader)
			: undefined;

		if (paymentResponse) {
			logger.success("Payment settled successfully");
			logger.info(`Transaction hash: ${paymentResponse.txHash}`);
			logger.info(`Amount: ${Number(paymentResponse.amount) / 1e6} USDC`);
		}

		logger.success("Content received!");
		return response.data;
	} catch (error: any) {
		if (error.response?.status === 402) {
			logger.error("Payment failed", error.response.data);
			throw new Error(`Payment failed: ${error.response.data.error}`);
		}
		throw error;
	}
}

/**
 * Check USDC balance (no approval needed with EIP-3009!)
 */
async function checkBalance(): Promise<void> {
	const ERC20_ABI = [
		"function balanceOf(address account) view returns (uint256)",
		"function decimals() view returns (uint8)",
	];

	const usdcContract = new ethers.Contract(
		process.env.USDC_BASE_SEPOLIA!,
		ERC20_ABI,
		provider,
	);

	const balance = await usdcContract.balanceOf(BUYER_ADDRESS);
	const decimals = await usdcContract.decimals();

	const balanceFormatted = Number(balance) / 10 ** Number(decimals);

	logger.info(`USDC Balance: ${balanceFormatted} USDC`);
	logger.info(`✅ NO APPROVAL NEEDED (using EIP-3009)`);

	if (balance === 0n) {
		logger.error("⚠️  Buyer has no USDC balance!");
		logger.error("Run: npm run fund");
	}
}

/**
 * Main flow
 */
async function main() {
	const endpoint = "/api/content/premium";

	logger.info("===== x402 Buyer Agent =====");
	logger.info(`Buyer address: ${BUYER_ADDRESS}`);
	logger.info(`Seller URL: ${SELLER_URL}`);
	logger.info(`Requesting: ${endpoint}`);
	logger.info("");

	// Check balance (no approval needed!)
	await checkBalance();
	logger.info("");

	// Step 1: Request content (will receive 402)
	logger.info("Step 1: Requesting content...");
	const { requirements, error } = await requestContent(endpoint);

	if (error) {
		logger.error(`Failed: ${error}`);
		process.exit(1);
	}

	if (!requirements) {
		logger.info("Content is freely available");
		process.exit(0);
	}

	logger.info("Payment required:");
	logger.info(`  Amount: ${requirements.amount} ${requirements.token}`);
	logger.info(`  Seller: ${requirements.seller}`);
	logger.info(`  Facilitator: ${requirements.facilitator}`);
	logger.info("");

	// Step 2: Create and sign payment intent
	logger.info("Step 2: Creating payment intent...");
	const payload = await createPaymentIntent(requirements);
	logger.info("");

	// Step 3: Submit payment and request content
	logger.info("Step 3: Submitting payment (waiting for on-chain settlement)...");
	try {
		const content = await requestContentWithPayment(endpoint, payload);
		logger.info("");
		logger.success("===== SUCCESS =====");
		logger.info("Content received:", content);
	} catch (error: any) {
		logger.error("===== FAILED =====");
		logger.error(error.message);
		process.exit(1);
	}
}

// Run
main().catch((error) => {
	logger.error("Unexpected error", error);
	process.exit(1);
});

