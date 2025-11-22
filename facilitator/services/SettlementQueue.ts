/**
 * Settlement Queue
 * 
 * Manages pending payment intents for batch settlement.
 * For MVP: In-memory queue. For production: Use database or persistent storage.
 */

import { createLogger } from "../../shared/logger.js";
import type { PaymentIntent } from "../../shared/types.js";

const logger = createLogger("facilitator:queue");

/**
 * Queue record for a payment intent awaiting settlement
 */
export interface QueueRecord {
	// Core identification
	id: string; // Unique ID for this record
	
	// Payment details
	scheme: "x402-escrow-deferred";
	chainId: number;
	vault: string;
	buyer: string;
	seller: string;
	amount: string;
	token: string;
	nonce: string;
	resource: string;
	
	// Original intent and signature
	intent: PaymentIntent;
	signature: string;
	
	// Status tracking
	status: "pending" | "settled" | "failed";
	txHash?: string;
	error?: string;
	
	// Timestamps
	createdAt: number;
	settledAt?: number;
}

/**
 * In-memory queue storage
 */
class SettlementQueue {
	private queue: Map<string, QueueRecord> = new Map();
	private recordCounter = 0;

	/**
	 * Add a payment intent to the queue
	 */
	add(record: Omit<QueueRecord, "id" | "createdAt" | "status">): string {
		const id = `intent-${++this.recordCounter}-${Date.now()}`;
		const queueRecord: QueueRecord = {
			...record,
			id,
			status: "pending",
			createdAt: Date.now(),
		};
		
		this.queue.set(id, queueRecord);
		logger.info(`Added to queue: ${id} (${record.buyer} → ${record.seller}: ${record.amount})`);
		
		return id;
	}

	/**
	 * Get a record by ID
	 */
	get(id: string): QueueRecord | undefined {
		return this.queue.get(id);
	}

	/**
	 * Get all pending records
	 */
	getPending(): QueueRecord[] {
		return Array.from(this.queue.values()).filter(r => r.status === "pending");
	}

	/**
	 * Get pending records for a specific vault and chain
	 */
	getPendingForVault(vault: string, chainId: number): QueueRecord[] {
		return this.getPending().filter(
			r => r.vault.toLowerCase() === vault.toLowerCase() && r.chainId === chainId
		);
	}

	/**
	 * Mark a record as settled
	 */
	markSettled(id: string, txHash: string): void {
		const record = this.queue.get(id);
		if (record) {
			record.status = "settled";
			record.txHash = txHash;
			record.settledAt = Date.now();
			logger.success(`Marked as settled: ${id} (tx: ${txHash})`);
		}
	}

	/**
	 * Mark a record as failed
	 */
	markFailed(id: string, error: string): void {
		const record = this.queue.get(id);
		if (record) {
			record.status = "failed";
			record.error = error;
			logger.error(`Marked as failed: ${id} (${error})`);
		}
	}

	/**
	 * Get queue statistics
	 */
	getStats(): {
		total: number;
		pending: number;
		settled: number;
		failed: number;
	} {
		const records = Array.from(this.queue.values());
		return {
			total: records.length,
			pending: records.filter(r => r.status === "pending").length,
			settled: records.filter(r => r.status === "settled").length,
			failed: records.filter(r => r.status === "failed").length,
		};
	}

	/**
	 * Clear old records (optional cleanup)
	 */
	cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
		const now = Date.now();
		let cleaned = 0;
		
		for (const [id, record] of this.queue.entries()) {
			if (record.status !== "pending" && now - record.createdAt > maxAgeMs) {
				this.queue.delete(id);
				cleaned++;
			}
		}
		
		if (cleaned > 0) {
			logger.info(`Cleaned up ${cleaned} old records`);
		}
		
		return cleaned;
	}
}

// Singleton queue instance
const queue = new SettlementQueue();

export default queue;

