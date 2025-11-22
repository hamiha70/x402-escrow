/**
 * Multi-Intent Batch Settlement Test
 * 
 * Demonstrates batching benefits:
 * 1. Queue multiple payment intents
 * 2. Trigger batch settlement
 * 3. Measure gas savings vs individual settlements
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import axios from "axios";
import { createLogger } from "../shared/logger.js";
import { generateNonce } from "../shared/eip712.js";
import type { PaymentIntent } from "../shared/types.js";

dotenv.config();

const logger = createLogger("batch-test");

// Configuration
const CHAIN = process.env.CHAIN || "base-sepolia";
const CHAIN_ID = Number(process.env[`${CHAIN.toUpperCase().replace("-", "_")}_CHAIN_ID`]) || 84532;
const RPC_URL = process.env[`${CHAIN.toUpperCase().replace("-", "_")}_RPC`];
const VAULT_ADDRESS = process.env[`VAULT_${CHAIN.toUpperCase().replace("-", "_")}`];
const USDC_ADDRESS = process.env[`USDC_${CHAIN.toUpperCase().replace("-", "_")}`];
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const BUYER_ADDRESS = process.env.BUYER_WALLET_ADDRESS;
const SELLER_ADDRESS = process.env.SELLER_WALLET_ADDRESS;
const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "http://localhost:4023";

if (!RPC_URL || !VAULT_ADDRESS || !USDC_ADDRESS || !BUYER_PRIVATE_KEY || !BUYER_ADDRESS) {
	throw new Error("Missing required environment variables");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);

// Vault ABI
const VAULT_ABI = [
	"function deposits(address) view returns (uint256)",
	"function batchWithdraw(tuple(address buyer, address seller, uint256 amount, address token, bytes32 nonce, uint256 expiry, string resource, uint256 chainId)[] intents, bytes[] signatures) external",
	"event BatchWithdrawn(uint256 indexed batchId, uint256 totalAmount, uint256 intentCount)",
];

async function queueMultipleIntents(count: number): Promise<void> {
	logger.info(`\n=== Queueing ${count} Payment Intents ===`);
	
	const endpoint = `/api/content/premium/${CHAIN}`;
	const scheme = "x402-escrow-deferred";
	
	for (let i = 0; i < count; i++) {
		try {
			// Request content with unique nonce
			const response = await axios.get(`${SELLER_URL}${endpoint}?scheme=${scheme}`, {
				headers: {
					"x-payment": JSON.stringify({
						scheme: scheme,
						data: {
							intent: {
								buyer: BUYER_ADDRESS,
								seller: SELLER_ADDRESS,
								amount: "10000", // 0.01 USDC
								token: USDC_ADDRESS,
								nonce: generateNonce(),
								expiry: Math.floor(Date.now() / 1000) + 300,
								resource: endpoint,
								chainId: CHAIN_ID,
							},
							x402Signature: await signMockIntent(i), // Mock signature for testing
							transferAuth: {
								from: BUYER_ADDRESS,
								to: SELLER_ADDRESS,
								value: "10000",
								validAfter: 0,
								validBefore: Math.floor(Date.now() / 1000) + 300,
								nonce: generateNonce(),
							},
							eip3009Signature: "0x",
						},
					}),
				},
			});
			
			logger.success(`✓ Intent ${i + 1}/${count} queued`);
		} catch (error: any) {
			if (error.response?.status === 200) {
				logger.success(`✓ Intent ${i + 1}/${count} queued (content delivered)`);
			} else {
				logger.error(`✗ Intent ${i + 1}/${count} failed: ${error.response?.data?.error || error.message}`);
			}
		}
		
		// Small delay to avoid rate limiting
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

async function signMockIntent(index: number): Promise<string> {
	// For testing, we'll use the buyer agent's actual signing logic
	// Import the signing function from buyer/strategies
	const intent: PaymentIntent = {
		buyer: BUYER_ADDRESS!,
		seller: SELLER_ADDRESS!,
		amount: "10000",
		token: USDC_ADDRESS!,
		nonce: generateNonce(),
		expiry: Math.floor(Date.now() / 1000) + 300,
		resource: `/api/content/premium/${CHAIN}`,
		chainId: CHAIN_ID,
	};
	
	// Sign with vault domain
	const domain = {
		name: "x402-Vault",
		version: "1",
		chainId: CHAIN_ID,
		verifyingContract: VAULT_ADDRESS!,
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
	
	return await buyerWallet.signTypedData(domain, types, intent);
}

async function checkQueueStatus(): Promise<any> {
	const response = await axios.get(`${FACILITATOR_URL}/queue`);
	return response.data;
}

async function triggerBatchSettlement(): Promise<any> {
	logger.info("\n=== Triggering Batch Settlement ===");
	const response = await axios.post(`${FACILITATOR_URL}/settle-batch`);
	return response.data;
}

async function checkVaultDeposit(): Promise<string> {
	const vaultContract = new ethers.Contract(VAULT_ADDRESS!, VAULT_ABI, provider);
	const deposit = await vaultContract.deposits(BUYER_ADDRESS);
	return ethers.formatUnits(deposit, 6); // USDC has 6 decimals
}

async function main() {
	logger.info("╔══════════════════════════════════════════════════════════════════╗");
	logger.info("║                                                                  ║");
	logger.info("║           Multi-Intent Batch Settlement Test                    ║");
	logger.info("║                                                                  ║");
	logger.info("╚══════════════════════════════════════════════════════════════════╝");
	logger.info("");
	logger.info(`Chain:  ${CHAIN} (${CHAIN_ID})`);
	logger.info(`Vault:  ${VAULT_ADDRESS}`);
	logger.info(`Buyer:  ${BUYER_ADDRESS}`);
	logger.info(`Seller: ${SELLER_ADDRESS}`);
	logger.info("");
	
	// Check vault deposit
	logger.info("Step 1: Checking vault deposit...");
	const depositBefore = await checkVaultDeposit();
	logger.info(`  Buyer vault deposit: ${depositBefore} USDC`);
	
	if (parseFloat(depositBefore) < 0.1) {
		logger.warn("⚠️  Low vault deposit! You need at least 0.1 USDC for this test.");
		logger.info("Deposit USDC to vault:");
		logger.info(`  cast send ${VAULT_ADDRESS} "deposit(uint256)" 100000 --private-key $BUYER_PRIVATE_KEY --rpc-url $RPC`);
		process.exit(1);
	}
	logger.info("");
	
	// Check initial queue status
	logger.info("Step 2: Checking initial queue status...");
	let queueStatus = await checkQueueStatus();
	logger.info(`  Pending: ${queueStatus.stats.pending}`);
	logger.info(`  Settled: ${queueStatus.stats.settled}`);
	logger.info(`  Failed:  ${queueStatus.stats.failed}`);
	logger.info("");
	
	// Queue multiple intents
	const intentCount = parseInt(process.env.INTENT_COUNT || "5");
	logger.info(`Step 3: Queueing ${intentCount} payment intents...`);
	await queueMultipleIntents(intentCount);
	logger.info("");
	
	// Check queue after queueing
	logger.info("Step 4: Verifying queue status...");
	queueStatus = await checkQueueStatus();
	logger.info(`  Pending: ${queueStatus.stats.pending}`);
	logger.info(`  Settled: ${queueStatus.stats.settled}`);
	logger.info(`  Failed:  ${queueStatus.stats.failed}`);
	
	if (queueStatus.stats.pending === 0) {
		logger.error("❌ No intents queued! Something went wrong.");
		process.exit(1);
	}
	logger.info("");
	
	// Trigger batch settlement
	logger.info("Step 5: Triggering batch settlement...");
	const startTime = Date.now();
	
	try {
		const settlementResult = await triggerBatchSettlement();
		const duration = Date.now() - startTime;
		
		logger.info("");
		logger.success("✅ Batch Settlement Complete!");
		logger.info(`  Time taken: ${duration}ms`);
		logger.info(`  Batches processed: ${settlementResult.batchesProcessed}`);
		logger.info(`  Intents settled: ${settlementResult.intentsSettled}`);
		
		if (settlementResult.errors && settlementResult.errors.length > 0) {
			logger.warn(`  Errors: ${settlementResult.errors.length}`);
			settlementResult.errors.forEach((err: string) => {
				logger.error(`    - ${err}`);
			});
		}
		logger.info("");
		
		// Final queue status
		logger.info("Step 6: Final queue status...");
		queueStatus = await checkQueueStatus();
		logger.info(`  Pending: ${queueStatus.stats.pending}`);
		logger.info(`  Settled: ${queueStatus.stats.settled}`);
		logger.info(`  Failed:  ${queueStatus.stats.failed}`);
		logger.info("");
		
		// Check vault deposit after
		const depositAfter = await checkVaultDeposit();
		logger.info(`  Buyer vault deposit: ${depositAfter} USDC (was ${depositBefore} USDC)`);
		logger.info("");
		
		// Gas analysis
		logger.info("╔══════════════════════════════════════════════════════════════════╗");
		logger.info("║                     Gas Analysis                                 ║");
		logger.info("╚══════════════════════════════════════════════════════════════════╝");
		logger.info("");
		logger.info("Estimated Gas Costs:");
		logger.info(`  Individual settlements: ~${intentCount * 85000} gas (${intentCount} × 85k)`);
		logger.info(`  Batch settlement:       ~${100000 + (intentCount - 1) * 3000} gas (100k + ${intentCount - 1} × 3k)`);
		logger.info(`  Savings:                ~${intentCount * 85000 - (100000 + (intentCount - 1) * 3000)} gas`);
		logger.info(`  Efficiency:             ${((1 - (100000 + (intentCount - 1) * 3000) / (intentCount * 85000)) * 100).toFixed(1)}% reduction`);
		logger.info("");
		
		logger.success("✅ Multi-Intent Batch Settlement Test Complete!");
		
	} catch (error: any) {
		logger.error("❌ Batch settlement failed:", error.response?.data || error.message);
		process.exit(1);
	}
}

main().catch((error) => {
	logger.error("Unexpected error", error);
	process.exit(1);
});

