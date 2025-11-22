/**
 * TEE Ledger Manager
 * 
 * File-based accounting system for TEE facilitator scheme.
 * Maintains private buyer balances and spending history in sealed TEE storage.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import { ethers } from "ethers";
import { createLogger } from "../../shared/logger.js";

const logger = createLogger("tee-ledger");

export interface DepositRecord {
	amount: string;
	timestamp: number;
	chain: number;
	txHash: string;
}

export interface SpendRecord {
	seller: string;
	amount: string;
	resource: string;
	timestamp: number;
	chain: number;
	txHash: string;
	intentHash: string;
}

export interface ChainAccount {
	balance: string;
	nonce: number;
	deposits: DepositRecord[];
	spends: SpendRecord[];
}

export interface BuyerAccount {
	chains: Record<number, ChainAccount>;
}

export interface ActivityLogEntry {
	timestamp: number;
	type: "deposit" | "spend";
	buyer: string;
	chain: number;
	amount: string;
	txHash: string;
	ledgerHash: string;
	seller?: string;
	resource?: string;
	intentHash?: string;
}

export interface Ledger {
	buyers: Record<string, BuyerAccount>;
	activityLog: ActivityLogEntry[];
	metadata: {
		lastUpdated: number;
		totalDeposits: string;
		totalSpends: string;
		ledgerHash: string;
	};
}

export class TEELedgerManager {
	private ledgerPath: string;
	private ledger: Ledger;

	constructor(ledgerPath: string = "/data/tee-ledger.json") {
		this.ledgerPath = ledgerPath;
		this.ledger = this.loadLedger();
	}

	/**
	 * Load ledger from file or create new if doesn't exist
	 */
	private loadLedger(): Ledger {
		if (existsSync(this.ledgerPath)) {
			try {
				const data = readFileSync(this.ledgerPath, "utf-8");
				const ledger = JSON.parse(data);
				logger.info(`Loaded ledger from ${this.ledgerPath}`);
				logger.info(`Buyers: ${Object.keys(ledger.buyers).length}`);
				return ledger;
			} catch (error) {
				logger.error(`Failed to load ledger: ${error}`);
				logger.warn("Creating new ledger");
			}
		}

		// Create new ledger
		return {
			buyers: {},
			activityLog: [],
			metadata: {
				lastUpdated: Date.now(),
				totalDeposits: "0",
				totalSpends: "0",
				ledgerHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
			},
		};
	}

	/**
	 * Save ledger to file (atomic write)
	 */
	private saveLedger(): void {
		try {
			// Update metadata
			this.ledger.metadata.lastUpdated = Date.now();
			this.ledger.metadata.ledgerHash = this.computeLedgerHash();

			// Atomic write: write to temp file, then rename
			const tempPath = `${this.ledgerPath}.tmp`;
			writeFileSync(tempPath, JSON.stringify(this.ledger, null, 2), "utf-8");
			renameSync(tempPath, this.ledgerPath);

			logger.info(`Ledger saved to ${this.ledgerPath}`);
		} catch (error) {
			logger.error(`Failed to save ledger: ${error}`);
			throw error;
		}
	}

	/**
	 * Record deposit from on-chain event
	 */
	public recordDeposit(
		buyer: string,
		amount: string,
		chain: number,
		txHash: string
	): void {
		// Initialize buyer account if doesn't exist
		if (!this.ledger.buyers[buyer]) {
			this.ledger.buyers[buyer] = {
				chains: {},
			};
		}

		const buyerAccount = this.ledger.buyers[buyer];

		// Initialize chain account if doesn't exist
		if (!buyerAccount.chains[chain]) {
			buyerAccount.chains[chain] = {
				balance: "0",
				nonce: 0,
				deposits: [],
				spends: [],
			};
		}

		const chainAccount = buyerAccount.chains[chain];

		// Add deposit record
		chainAccount.deposits.push({
			amount,
			timestamp: Date.now(),
			chain,
			txHash,
		});

		// Update balance for this chain
		chainAccount.balance = (
			BigInt(chainAccount.balance) + BigInt(amount)
		).toString();

		// Update metadata
		this.ledger.metadata.totalDeposits = (
			BigInt(this.ledger.metadata.totalDeposits) + BigInt(amount)
		).toString();

		// Add to activity log
		this.ledger.activityLog.push({
			timestamp: Date.now(),
			type: "deposit",
			buyer,
			chain,
			amount,
			txHash,
			ledgerHash: this.computeLedgerHash(),
		});

		this.saveLedger();

		logger.info(
			`Deposit recorded: ${buyer} deposited ${amount} on chain ${chain}`
		);
		logger.info(`New balance on chain ${chain}: ${chainAccount.balance}`);
	}

	/**
	 * Record spend (deduct from buyer balance on specific chain)
	 */
	public recordSpend(
		buyer: string,
		seller: string,
		amount: string,
		resource: string,
		chain: number,
		txHash: string,
		intentHash: string
	): void {
		const buyerAccount = this.ledger.buyers[buyer];
		if (!buyerAccount) {
			throw new Error(`Buyer ${buyer} not found in ledger`);
		}

		const chainAccount = buyerAccount.chains[chain];
		if (!chainAccount) {
			throw new Error(`Buyer ${buyer} has no balance on chain ${chain}`);
		}

		// Check sufficient balance on this chain
		if (BigInt(chainAccount.balance) < BigInt(amount)) {
			throw new Error(
				`Insufficient balance on chain ${chain}: ${chainAccount.balance} < ${amount}`
			);
		}

		// Add spend record
		chainAccount.spends.push({
			seller,
			amount,
			resource,
			timestamp: Date.now(),
			chain,
			txHash,
			intentHash,
		});

		// Update balance for this chain
		chainAccount.balance = (
			BigInt(chainAccount.balance) - BigInt(amount)
		).toString();

		// Increment nonce for this chain
		chainAccount.nonce++;

		// Update metadata
		this.ledger.metadata.totalSpends = (
			BigInt(this.ledger.metadata.totalSpends) + BigInt(amount)
		).toString();

		// Add to activity log
		this.ledger.activityLog.push({
			timestamp: Date.now(),
			type: "spend",
			buyer,
			chain,
			amount,
			txHash,
			ledgerHash: this.computeLedgerHash(),
			seller,
			resource,
			intentHash,
		});

		this.saveLedger();

		logger.info(
			`Spend recorded: ${buyer} paid ${seller} ${amount} on chain ${chain}`
		);
		logger.info(`New balance on chain ${chain}: ${chainAccount.balance}, nonce: ${chainAccount.nonce}`);
	}

	/**
	 * Get buyer balance on specific chain
	 */
	public getBalance(buyer: string, chain: number): bigint {
		const account = this.ledger.buyers[buyer];
		if (!account || !account.chains[chain]) {
			return 0n;
		}
		return BigInt(account.chains[chain].balance);
	}

	/**
	 * Get buyer account details (all chains)
	 */
	public getAccount(buyer: string): BuyerAccount | null {
		return this.ledger.buyers[buyer] || null;
	}

	/**
	 * Get buyer account details for specific chain
	 */
	public getChainAccount(buyer: string, chain: number): ChainAccount | null {
		const account = this.ledger.buyers[buyer];
		return account?.chains[chain] || null;
	}

	/**
	 * Get all buyer addresses
	 */
	public getBuyers(): string[] {
		return Object.keys(this.ledger.buyers);
	}

	/**
	 * Get ledger statistics
	 */
	public getStats() {
		return {
			totalBuyers: Object.keys(this.ledger.buyers).length,
			totalDeposits: this.ledger.metadata.totalDeposits,
			totalSpends: this.ledger.metadata.totalSpends,
			remainingBalance: (
				BigInt(this.ledger.metadata.totalDeposits) -
				BigInt(this.ledger.metadata.totalSpends)
			).toString(),
			lastUpdated: this.ledger.metadata.lastUpdated,
			ledgerHash: this.ledger.metadata.ledgerHash,
		};
	}

	/**
	 * Compute ledger hash for auditability
	 */
	public computeLedgerHash(): string {
		// Create deterministic hash of ledger state
		const buyerAddresses = Object.keys(this.ledger.buyers).sort();
		
		const buyerChainHashes = buyerAddresses.flatMap((address) => {
			const account = this.ledger.buyers[address];
			const chainIds = Object.keys(account.chains).sort();
			
			return chainIds.map((chainId) => {
				const chainAccount = account.chains[Number(chainId)];
				return ethers.keccak256(
					ethers.AbiCoder.defaultAbiCoder().encode(
						["address", "uint256", "uint256", "uint256"],
						[address, chainId, chainAccount.balance, chainAccount.nonce]
					)
				);
			});
		});

		if (buyerChainHashes.length === 0) {
			return "0x0000000000000000000000000000000000000000000000000000000000000000";
		}

		// Hash all buyer-chain hashes together
		const combinedHash = ethers.keccak256(
			ethers.concat(buyerChainHashes.map((h) => ethers.getBytes(h)))
		);

		return combinedHash;
	}

	/**
	 * Check if buyer has sufficient balance on specific chain
	 */
	public hasSufficientBalance(buyer: string, chain: number, amount: string): boolean {
		const balance = this.getBalance(buyer, chain);
		return balance >= BigInt(amount);
	}

	/**
	 * Get buyer nonce for specific chain
	 */
	public getNonce(buyer: string, chain: number): number {
		const account = this.ledger.buyers[buyer];
		return account?.chains[chain]?.nonce || 0;
	}

	/**
	 * Get activity log (all activities)
	 */
	public getActivityLog(): ActivityLogEntry[] {
		return this.ledger.activityLog;
	}

	/**
	 * Get activity log for specific buyer
	 */
	public getBuyerActivityLog(buyer: string): ActivityLogEntry[] {
		return this.ledger.activityLog.filter((entry) => entry.buyer === buyer);
	}

	/**
	 * Get recent activity (last N entries)
	 */
	public getRecentActivity(limit: number = 50): ActivityLogEntry[] {
		return this.ledger.activityLog.slice(-limit);
	}
}

