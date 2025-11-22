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

export interface BuyerAccount {
	balance: string;
	nonce: number;
	deposits: DepositRecord[];
	spends: SpendRecord[];
}

export interface Ledger {
	buyers: Record<string, BuyerAccount>;
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
				balance: "0",
				nonce: 0,
				deposits: [],
				spends: [],
			};
		}

		const account = this.ledger.buyers[buyer];

		// Add deposit record
		account.deposits.push({
			amount,
			timestamp: Date.now(),
			chain,
			txHash,
		});

		// Update balance
		account.balance = (
			BigInt(account.balance) + BigInt(amount)
		).toString();

		// Update metadata
		this.ledger.metadata.totalDeposits = (
			BigInt(this.ledger.metadata.totalDeposits) + BigInt(amount)
		).toString();

		this.saveLedger();

		logger.info(
			`Deposit recorded: ${buyer} deposited ${amount} on chain ${chain}`
		);
		logger.info(`New balance: ${account.balance}`);
	}

	/**
	 * Record spend (deduct from buyer balance)
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
		const account = this.ledger.buyers[buyer];
		if (!account) {
			throw new Error(`Buyer ${buyer} not found in ledger`);
		}

		// Check sufficient balance
		if (BigInt(account.balance) < BigInt(amount)) {
			throw new Error(
				`Insufficient balance: ${account.balance} < ${amount}`
			);
		}

		// Add spend record
		account.spends.push({
			seller,
			amount,
			resource,
			timestamp: Date.now(),
			chain,
			txHash,
			intentHash,
		});

		// Update balance
		account.balance = (
			BigInt(account.balance) - BigInt(amount)
		).toString();

		// Increment nonce
		account.nonce++;

		// Update metadata
		this.ledger.metadata.totalSpends = (
			BigInt(this.ledger.metadata.totalSpends) + BigInt(amount)
		).toString();

		this.saveLedger();

		logger.info(
			`Spend recorded: ${buyer} paid ${seller} ${amount} on chain ${chain}`
		);
		logger.info(`New balance: ${account.balance}, nonce: ${account.nonce}`);
	}

	/**
	 * Get buyer balance
	 */
	public getBalance(buyer: string): bigint {
		const account = this.ledger.buyers[buyer];
		if (!account) {
			return 0n;
		}
		return BigInt(account.balance);
	}

	/**
	 * Get buyer account details
	 */
	public getAccount(buyer: string): BuyerAccount | null {
		return this.ledger.buyers[buyer] || null;
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
		
		const buyerHashes = buyerAddresses.map((address) => {
			const account = this.ledger.buyers[address];
			return ethers.keccak256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["address", "uint256", "uint256"],
					[address, account.balance, account.nonce]
				)
			);
		});

		if (buyerHashes.length === 0) {
			return "0x0000000000000000000000000000000000000000000000000000000000000000";
		}

		// Hash all buyer hashes together
		const combinedHash = ethers.keccak256(
			ethers.concat(buyerHashes.map((h) => ethers.getBytes(h)))
		);

		return combinedHash;
	}

	/**
	 * Check if buyer has sufficient balance
	 */
	public hasSufficientBalance(buyer: string, amount: string): boolean {
		const balance = this.getBalance(buyer);
		return balance >= BigInt(amount);
	}

	/**
	 * Get buyer nonce
	 */
	public getNonce(buyer: string): number {
		const account = this.ledger.buyers[buyer];
		return account?.nonce || 0;
	}
}

