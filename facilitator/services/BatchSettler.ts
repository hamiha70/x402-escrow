/**
 * Batch Settlement Worker
 * 
 * Processes pending payment intents in batches via vault.batchWithdraw()
 */

import { ethers } from "ethers";
import { createLogger } from "../../shared/logger.js";
import queue from "./SettlementQueue.js";
import type { QueueRecord } from "./SettlementQueue.js";

const logger = createLogger("facilitator:batch-settler");

// Vault ABI for batch withdrawal
const VAULT_ABI = [
	`function batchWithdraw(
		tuple(address buyer, address seller, uint256 amount, address token, bytes32 nonce, uint256 expiry, string resource, uint256 chainId)[] intents,
		bytes[] signatures
	) external`,
	"event BatchWithdrawn(uint256 indexed batchId, uint256 totalAmount, uint256 intentCount)",
];

export interface BatchSettlerConfig {
	getProvider: (chainId: number) => ethers.JsonRpcProvider;
	getWallet: (chainId: number) => ethers.Wallet;
	getChainConfig: (chainId: number) => { rpc: string; usdc: string; name: string };
}

/**
 * Settle a batch of intents for a specific vault
 */
export async function settleBatch(
	vault: string,
	chainId: number,
	records: QueueRecord[],
	config: BatchSettlerConfig
): Promise<{
	success: boolean;
	txHash?: string;
	error?: string;
	settledCount: number;
}> {
	if (records.length === 0) {
		return { success: true, settledCount: 0 };
	}

	const chainConfig = config.getChainConfig(chainId);
	const facilitatorWallet = config.getWallet(chainId);
	const vaultContract = new ethers.Contract(vault, VAULT_ABI, facilitatorWallet);

	logger.info(`Processing batch for ${chainConfig.name} vault: ${vault}`);
	logger.info(`  • ${records.length} intents to settle`);

	// Prepare intents and signatures
	const intents = records.map(r => ({
		buyer: r.intent.buyer,
		seller: r.intent.seller,
		amount: r.intent.amount,
		token: r.intent.token,
		nonce: r.intent.nonce,
		expiry: r.intent.expiry,
		resource: r.intent.resource,
		chainId: r.intent.chainId,
	}));

	const signatures = records.map(r => r.signature);

	try {
		// Execute batch withdrawal
		logger.info(`Calling vault.batchWithdraw() with ${intents.length} intents...`);
		const tx = await vaultContract.batchWithdraw(intents, signatures);

		logger.info(`Transaction sent: ${tx.hash}`);
		logger.info(`Waiting for confirmation...`);

		const receipt = await tx.wait();

		if (!receipt || receipt.status === 0) {
			logger.error(`Transaction failed: ${tx.hash}`);
			return {
				success: false,
				error: "Transaction reverted",
				settledCount: 0,
			};
		}

		logger.success(`Batch settled successfully: ${tx.hash}`);
		logger.info(`  • Block: ${receipt.blockNumber}`);
		logger.info(`  • Gas used: ${receipt.gasUsed.toString()}`);
		logger.info(`  • Settled ${records.length} intents`);

		// Mark all records as settled
		for (const record of records) {
			queue.markSettled(record.id, tx.hash);
		}

		return {
			success: true,
			txHash: tx.hash,
			settledCount: records.length,
		};
	} catch (error: any) {
		logger.error(`Batch settlement failed: ${error.message}`);
		
		// Mark all records as failed
		for (const record of records) {
			queue.markFailed(record.id, error.message);
		}

		return {
			success: false,
			error: error.message,
			settledCount: 0,
		};
	}
}

/**
 * Process all pending intents (grouped by vault and chain)
 */
export async function processAllPending(config: BatchSettlerConfig): Promise<{
	totalBatches: number;
	totalSettled: number;
	errors: string[];
}> {
	const pending = queue.getPending();
	
	if (pending.length === 0) {
		logger.info("No pending intents to settle");
		return { totalBatches: 0, totalSettled: 0, errors: [] };
	}

	logger.info(`Found ${pending.length} pending intents`);

	// Group by vault + chainId
	const groups = new Map<string, QueueRecord[]>();
	for (const record of pending) {
		const key = `${record.vault}-${record.chainId}`;
		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)!.push(record);
	}

	logger.info(`Grouped into ${groups.size} batches`);

	// Process each batch
	let totalSettled = 0;
	const errors: string[] = [];

	for (const [key, records] of groups.entries()) {
		const [vault, chainIdStr] = key.split("-");
		const chainId = parseInt(chainIdStr);
		
		logger.info(`Processing batch: ${key} (${records.length} intents)`);
		
		const result = await settleBatch(vault, chainId, records, config);
		
		if (result.success) {
			totalSettled += result.settledCount;
		} else {
			errors.push(`${key}: ${result.error}`);
		}
	}

	const stats = queue.getStats();
	logger.info(`Batch processing complete:`);
	logger.info(`  • Batches processed: ${groups.size}`);
	logger.info(`  • Intents settled: ${totalSettled}`);
	logger.info(`  • Queue stats: ${stats.pending} pending, ${stats.settled} settled, ${stats.failed} failed`);

	return {
		totalBatches: groups.size,
		totalSettled,
		errors,
	};
}

