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
import type {
	PaymentRequirements,
	PaymentPayload,
	PaymentResponse,
} from "../shared/types.js";
import { createDefaultRegistry } from "./strategies/SchemeRegistry.js";
import type { SchemeStrategy } from "./strategies/SchemeStrategy.js";

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

// Initialize scheme registry
const schemeRegistry = createDefaultRegistry();

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
 * Create payment payload using appropriate scheme strategy
 */
async function createPaymentPayload(
	requirements: PaymentRequirements,
): Promise<PaymentPayload> {
	// Determine scheme from requirements (default to "intent" for exact)
	const scheme = requirements.scheme || "intent";
	const strategy = schemeRegistry.get(scheme);

	if (!strategy) {
		throw new Error(`Unsupported payment scheme: ${scheme}. Supported: ${schemeRegistry.getSchemes().join(", ")}`);
	}

	logger.info(`Using scheme strategy: ${scheme}`);

	// Check preconditions (e.g., balance, vault deposit)
	const preconditions = await strategy.checkPreconditions(requirements, buyerWallet, provider);
	if (!preconditions.ready) {
		throw new Error(`Preconditions not met: ${preconditions.action}`);
	}

	// Create payload using strategy
	return await strategy.createPayload(requirements, buyerWallet, provider);
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
				"x-payment": JSON.stringify(payload),
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
 * Check balance using scheme strategy
 */
async function checkBalance(requirements?: PaymentRequirements): Promise<void> {
	if (!requirements) {
		// Fallback: check Base Sepolia USDC if no requirements yet
		const ERC20_ABI = [
			"function balanceOf(address account) view returns (uint256)",
			"function decimals() view returns (uint8)",
		];

		const usdcAddress = process.env.USDC_BASE_SEPOLIA!;
		if (!usdcAddress) {
			logger.warn("Cannot check balance: USDC address not configured");
			return;
		}

		const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
		const balance = await usdcContract.balanceOf(BUYER_ADDRESS);
		const decimals = await usdcContract.decimals();
		const balanceFormatted = Number(balance) / 10 ** Number(decimals);

		logger.info(`USDC Balance: ${balanceFormatted} USDC`);
		logger.info(`✅ NO APPROVAL NEEDED (using EIP-3009)`);

		if (balance === 0n) {
			logger.error("⚠️  Buyer has no USDC balance!");
			logger.error("Run: npm run fund");
		}
		return;
	}

	// Use scheme strategy to check preconditions
	const scheme = requirements.scheme || "intent";
	const strategy = schemeRegistry.get(scheme);
	if (strategy) {
		const preconditions = await strategy.checkPreconditions(requirements, buyerWallet, provider);
		if (preconditions.ready) {
			logger.info(`✅ Preconditions met for scheme: ${scheme}`);
		} else {
			logger.warn(`⚠️  ${preconditions.action}`);
		}
	}
}

/**
 * Main flow
 */
async function main() {
	const chainSlug = process.env.CHAIN || "base-sepolia";
	const requestedScheme = process.env.SCHEME || "x402-exact"; // Default to 'x402-exact'
	const endpoint = `/api/content/premium/${chainSlug}`;

	logger.info("===== x402 Buyer Agent =====");
	logger.info(`Buyer address: ${BUYER_ADDRESS}`);
	logger.info(`Seller URL: ${SELLER_URL}`);
	logger.info(`Requesting: ${endpoint} (Scheme: ${requestedScheme})`);
	logger.info("");

	// Step 1: Request content (will receive 402)
	logger.info("Step 1: Requesting content...");
	const { requirements, error } = await requestContent(`${endpoint}?scheme=${requestedScheme}`);

	if (error) {
		logger.error(`Failed: ${error}`);
		process.exit(1);
	}

	if (!requirements) {
		logger.info("Content is freely available");
		process.exit(0);
	}

	logger.info("Payment required:");
	logger.info(`  Scheme: ${requirements.scheme || "intent"}`);
	logger.info(`  Amount: ${requirements.amount} ${requirements.token}`);
	logger.info(`  Seller: ${requirements.seller}`);
	logger.info(`  Facilitator: ${requirements.facilitator}`);
	logger.info("");

	// Check balance/preconditions
	await checkBalance(requirements);
	logger.info("");

	// Step 2: Create and sign payment payload
	logger.info("Step 2: Creating payment payload...");
	const payload = await createPaymentPayload(requirements);
	logger.info("");

	// Step 3: Submit payment and request content
	logger.info("Step 3: Submitting payment (waiting for on-chain settlement)...");
	try {
		const content = await requestContentWithPayment(`${endpoint}?scheme=${requestedScheme}`, payload);
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

