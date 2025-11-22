/**
 * Omnibus Vault Manager
 * 
 * Handles interactions with OmnibusVault contracts across multiple chains.
 */

import { ethers } from "ethers";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("omnibus-vault");

const OMNIBUS_VAULT_ABI = [
	"function deposit(uint256 amount) external",
	"function withdrawToSeller(address seller, uint256 amount, bytes32 intentHash) external",
	"function allowedSellers(address) view returns (bool)",
	"function authorizeSeller(address seller, bool status) external",
	"function getBalance() view returns (uint256)",
	"function totalDeposited(address) view returns (uint256)",
	"function totalWithdrawn(address) view returns (uint256)",
	"function publishLedgerHash(bytes32 ledgerHash) external",
	"event Deposited(address indexed buyer, uint256 amount, uint256 totalDeposited)",
	"event Withdrawn(address indexed seller, uint256 amount, bytes32 indexed intentHash)",
];

export interface OmnibusVaultConfig {
	getProvider: (chainId: number) => ethers.JsonRpcProvider;
	getWallet: (chainId: number) => ethers.Wallet;
	getVaultAddress: (chainId: number) => string;
}

export class OmnibusVaultManager {
	private config: OmnibusVaultConfig;
	private vaultCache: Map<number, ethers.Contract>;

	constructor(config: OmnibusVaultConfig) {
		this.config = config;
		this.vaultCache = new Map();
	}

	/**
	 * Get vault address for chain
	 */
	public getVaultAddress(chainId: number): string {
		return this.config.getVaultAddress(chainId);
	}

	/**
	 * Get OmnibusVault contract instance for chain
	 */
	private getVault(chainId: number): ethers.Contract {
		if (!this.vaultCache.has(chainId)) {
			const address = this.config.getVaultAddress(chainId);
			const wallet = this.config.getWallet(chainId);
			const vault = new ethers.Contract(address, OMNIBUS_VAULT_ABI, wallet);
			this.vaultCache.set(chainId, vault);
		}
		return this.vaultCache.get(chainId)!;
	}

	/**
	 * Withdraw USDC to seller (only callable by facilitator)
	 */
	public async withdrawToSeller(
		chainId: number,
		seller: string,
		amount: string,
		intentHash: string
	): Promise<string> {
		const vault = this.getVault(chainId);

		logger.info(
			`Withdrawing ${amount} to seller ${seller} on chain ${chainId}`
		);
		logger.info(`Intent hash: ${intentHash}`);

		// Check seller is allowlisted
		const isAllowed = await vault.allowedSellers(seller);
		if (!isAllowed) {
			throw new Error(`Seller ${seller} not authorized on chain ${chainId}`);
		}

		// Execute withdrawal
		const tx = await vault.withdrawToSeller(seller, amount, intentHash);
		const receipt = await tx.wait();

		logger.info(`Withdrawal successful: ${tx.hash}`);
		logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

		return tx.hash;
	}

	/**
	 * Check if seller is allowlisted
	 */
	public async isSellerAllowed(
		chainId: number,
		seller: string
	): Promise<boolean> {
		const vault = this.getVault(chainId);
		return await vault.allowedSellers(seller);
	}

	/**
	 * Get vault balance
	 */
	public async getVaultBalance(chainId: number): Promise<bigint> {
		const vault = this.getVault(chainId);
		return await vault.getBalance();
	}

	/**
	 * Publish ledger hash on-chain (for auditability)
	 */
	public async publishLedgerHash(
		chainId: number,
		ledgerHash: string
	): Promise<string> {
		const vault = this.getVault(chainId);

		logger.info(`Publishing ledger hash on chain ${chainId}: ${ledgerHash}`);

		const tx = await vault.publishLedgerHash(ledgerHash);
		const receipt = await tx.wait();

		logger.info(`Ledger hash published: ${tx.hash}`);

		return tx.hash;
	}

	/**
	 * Authorize seller (owner only)
	 */
	public async authorizeSeller(
		chainId: number,
		seller: string,
		status: boolean
	): Promise<string> {
		const vault = this.getVault(chainId);

		logger.info(
			`${status ? "Authorizing" : "Deauthorizing"} seller ${seller} on chain ${chainId}`
		);

		const tx = await vault.authorizeSeller(seller, status);
		const receipt = await tx.wait();

		logger.info(`Seller authorization updated: ${tx.hash}`);

		return tx.hash;
	}
}

