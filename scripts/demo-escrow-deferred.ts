/**
 * Demo: x402-escrow-deferred Payment Flow [MOCK_CHAIN]
 * 
 * ⚠️  WARNING: This demo uses MOCK Vault behavior (contract not deployed)
 * ⚠️  TODO: Update after Vault deployment and test against real contract
 * ⚠️  See: TEST_STRATEGY.md for migration plan
 * 
 * Demonstrates deferred settlement with Vault escrow:
 * 1. Buyer requests content → 402 with escrow requirements
 * 2. Buyer signs intent for Vault (not direct USDC transfer)
 * 3. Facilitator validates intent and queues for batch settlement
 * 4. Content delivered immediately (deferred settlement)
 * 5. (Future: Batch settler processes queue and calls Vault.batchWithdraw)
 * 
 * Current Limitations:
 * - Uses mock Vault address (0x0...001)
 * - No actual on-chain settlement
 * - HTTP flow and queue management only
 * - Signature validation uses mock Vault domain
 */

import axios from "axios";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { createLogger } from "../shared/logger.js";
import {
	generateNonce,
	signPaymentIntentWithVaultDomain,
} from "../shared/eip712.js";
import type {
	PaymentRequirements,
	PaymentIntent,
	PaymentPayload,
	PaymentResponse,
} from "../shared/types.js";

dotenv.config();

const logger = createLogger("demo-escrow-deferred");

// Configuration
const CHAIN = process.env.CHAIN || "base-sepolia";
const CHAIN_ID = parseInt(process.env[`${CHAIN.toUpperCase().replace(/-/g, "_")}_CHAIN_ID`] || "84532");
const RPC_URL = process.env[`${CHAIN.toUpperCase().replace(/-/g, "_")}_RPC`];
const USDC_ADDRESS = process.env[`USDC_${CHAIN.toUpperCase().replace(/-/g, "_")}`];
const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY!;
const BUYER_ADDRESS = process.env.BUYER_WALLET_ADDRESS!;

// Mock Vault address (not deployed yet)
const MOCK_VAULT_ADDRESS = "0x0000000000000000000000000000000000000001";

if (!RPC_URL || !USDC_ADDRESS || !BUYER_PRIVATE_KEY) {
	logger.error("Missing required environment variables");
	logger.error("Please ensure .env has RPC_URL, USDC_ADDRESS, and BUYER_PRIVATE_KEY");
	process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);

async function main() {
	logger.info("===== x402-escrow-deferred Demo =====");
	logger.info(`Chain: ${CHAIN} (${CHAIN_ID})`);
	logger.info(`Buyer: ${BUYER_ADDRESS}`);
	logger.info(`Mock Vault: ${MOCK_VAULT_ADDRESS}`);
	logger.info("");

	const endpoint = `/api/content/premium/${CHAIN}`;
	const url = `${SELLER_URL}${endpoint}?scheme=x402-escrow-deferred`;

	// Phase 1: Initial Request (No Payment)
	logger.info("Phase 1: Requesting content without payment...");
	let requirements: PaymentRequirements;

	try {
		await axios.get(url);
		logger.error("Expected 402 Payment Required, but request succeeded");
		process.exit(1);
	} catch (error: any) {
		if (error.response?.status !== 402) {
			logger.error(`Unexpected error: ${error.message}`);
			process.exit(1);
		}

		requirements = error.response.data.PaymentRequirements[0];
		logger.success("✓ Received 402 Payment Required");
		logger.info(`  Scheme: ${requirements.scheme}`);
		logger.info(`  Amount: ${requirements.amount} ${requirements.token}`);
		logger.info(`  Facilitator: ${requirements.facilitator}`);
		logger.info(`  Vault: ${requirements.vault || "NOT PROVIDED"}`);
		logger.info("");

		if (requirements.scheme !== "x402-escrow-deferred") {
			logger.error(`Expected escrow-deferred scheme, got: ${requirements.scheme}`);
			logger.error("Make sure seller is configured with EscrowDeferredStrategy");
			process.exit(1);
		}

		if (!requirements.vault) {
			logger.warn("⚠️  No vault address in requirements - using mock vault");
			requirements.vault = MOCK_VAULT_ADDRESS;
		}
	}

	// Phase 2: Create Payment Intent (for Vault)
	logger.info("Phase 2: Creating payment intent for Vault...");
	const nonce = generateNonce();
	const expiry = Math.floor(Date.now() / 1000) + 180; // 3 minutes

	const intent: PaymentIntent = {
		seller: requirements.seller,
		buyer: BUYER_ADDRESS,
		amount: String(Number(requirements.amount) * 10 ** requirements.decimals),
		token: requirements.tokenAddress,
		nonce,
		expiry,
		resource: requirements.resource,
		chainId: CHAIN_ID,
	};

	logger.info(`  Nonce: ${nonce}`);
	logger.info(`  Expiry: ${new Date(expiry * 1000).toISOString()}`);
	logger.info(`  Amount: ${intent.amount} (raw units)`);
	logger.info("");

	// Phase 3: Sign Intent for Vault (x402 signature)
	logger.info("Phase 3: Signing payment intent for Vault...");
	logger.info("  (This is NOT an EIP-3009 signature - it's for Vault.batchWithdraw)");

	const x402Signature = await signPaymentIntentWithVaultDomain(
		intent,
		requirements.vault,
		CHAIN_ID,
		buyerWallet,
		provider
	);

	logger.success("✓ Signed payment intent for Vault");
	logger.info(`  Signature: ${x402Signature.substring(0, 20)}...`);
	logger.info("");

	// Create payload (no EIP-3009 signature for escrow-deferred)
	const payload: PaymentPayload = {
		scheme: "x402-escrow-deferred",
		data: {
			intent,
			x402Signature,
			transferAuth: {} as any, // Not used for escrow-deferred
			eip3009Signature: "", // Not used for escrow-deferred
		},
	};

	// Phase 4: Submit Payment and Request Content
	logger.info("Phase 4: Submitting payment intent to seller...");
	logger.info("  Seller validates and forwards to facilitator's /validate-intent");
	logger.info("  Facilitator queues intent for batch settlement");
	logger.info("  Content delivered IMMEDIATELY (no on-chain settlement yet)");
	logger.info("");

	const startTime = Date.now();

	try {
		const response = await axios.get(url, {
			headers: {
				"x-payment": JSON.stringify(payload),
			},
			timeout: 15000, // Shorter timeout (no on-chain tx)
		});

		const endTime = Date.now();
		const latency = endTime - startTime;

		if (response.status !== 200) {
			logger.error(`Unexpected status: ${response.status}`);
			process.exit(1);
		}

		logger.success("✓ Content delivered!");
		logger.info(`  Latency: ${latency}ms (no on-chain delay!)`);
		logger.info("");

		// Check payment response header
		const paymentResponseHeader = response.headers["x-payment-response"];
		if (!paymentResponseHeader) {
			logger.warn("⚠️  No x-payment-response header");
		} else {
			const paymentResponse: PaymentResponse = JSON.parse(paymentResponseHeader);
			logger.info("Payment Response:");
			logger.info(`  Status: ${paymentResponse.status}`);
			logger.info(`  Scheme: ${paymentResponse.scheme}`);

			if (paymentResponse.status === "deferred") {
				logger.success("✓ Payment intent validated and queued");
				logger.info("  Settlement will happen later via batch process");
			} else {
				logger.warn(`  Unexpected status: ${paymentResponse.status}`);
			}
		}

		logger.info("");
		logger.info("Content:");
		logger.info(JSON.stringify(response.data, null, 2));
		logger.info("");

		// Phase 5: Check Queue Status
		logger.info("Phase 5: Checking facilitator queue status...");
		try {
			const statsResponse = await axios.get(`${process.env.FACILITATOR_URL || "http://localhost:4023"}/health`);
			const stats = statsResponse.data.queue;
			if (stats) {
				logger.info(`  Total intents in queue: ${stats.total}`);
				logger.info(`  Pending settlement: ${stats.pending}`);
				logger.info(`  Settled: ${stats.settled}`);
				logger.info(`  Failed: ${stats.failed}`);
			}
		} catch (error) {
			logger.warn("  Could not fetch queue stats");
		}

		logger.info("");
		logger.success("===== DEMO COMPLETE =====");
		logger.info("");
		logger.info("Key Differences from x402-exact:");
		logger.info("  ✓ No EIP-3009 signature (uses Vault signature)");
		logger.info("  ✓ No immediate on-chain settlement");
		logger.info("  ✓ Content delivered IMMEDIATELY after validation");
		logger.info("  ✓ Intent queued for batch settlement");
		logger.info("  ✓ Much faster (no waiting for block confirmation)");
		logger.info("");
		logger.info("Next Steps:");
		logger.info("  1. Deploy Vault contract to testnet");
		logger.info("  2. Register Vault address in seller/facilitator config");
		logger.info("  3. Buyer deposits funds to Vault");
		logger.info("  4. Batch settler processes queue → Vault.batchWithdraw");

	} catch (error: any) {
		const endTime = Date.now();
		const latency = endTime - startTime;

		if (error.response) {
			logger.error(`Request failed with status ${error.response.status}`);
			logger.error(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
		} else {
			logger.error(`Request failed: ${error.message}`);
		}
		logger.error(`  Latency: ${latency}ms`);
		process.exit(1);
	}
}

main().catch((error) => {
	logger.error("Fatal error:", error);
	process.exit(1);
});
