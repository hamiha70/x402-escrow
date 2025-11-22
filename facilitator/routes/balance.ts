/**
 * Balance Query Route
 * 
 * Allows buyers to query their balance in the TEE ledger.
 */

import express from "express";
import { ethers } from "ethers";
import { createLogger } from "../../shared/logger.js";
import { TEELedgerManager } from "../services/TEELedgerManager.js";

const logger = createLogger("balance");

export function createBalanceRouter(ledger: TEELedgerManager) {
	const router = express.Router();

	/**
	 * Get buyer balance and transaction history
	 * Query params: ?chain=84532 (optional, returns all chains if not specified)
	 */
	router.get("/:address", async (req, res) => {
		try {
			const address = req.params.address;
			const chainId = req.query.chain ? Number(req.query.chain) : null;

			// Validate address format
			if (!ethers.isAddress(address)) {
				return res.status(400).json({ error: "Invalid address format" });
			}

			logger.info(`Balance query for ${address}${chainId ? ` on chain ${chainId}` : " (all chains)"}`);

			const account = ledger.getAccount(address);

			if (!account) {
				return res.status(404).json({
					address,
					chains: {},
					totalBalance: "0",
				});
			}

			// If specific chain requested, return just that chain
			if (chainId !== null) {
				const chainAccount = account.chains[chainId];
				if (!chainAccount) {
					return res.status(404).json({
						address,
						chain: chainId,
						balance: "0",
						nonce: 0,
						deposits: [],
						spends: [],
					});
				}

				return res.status(200).json({
					address,
					chain: chainId,
					balance: chainAccount.balance,
					nonce: chainAccount.nonce,
					deposits: chainAccount.deposits,
					spends: chainAccount.spends,
				});
			}

			// Return all chains
			const totalBalance = Object.values(account.chains).reduce(
				(sum, chainAccount) => sum + BigInt(chainAccount.balance),
				0n
			);

			return res.status(200).json({
				address,
				chains: account.chains,
				totalBalance: totalBalance.toString(),
			});
		} catch (error) {
			logger.error(`Balance query failed: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	});

	/**
	 * Get ledger statistics
	 */
	router.get("/", async (req, res) => {
		try {
			const stats = ledger.getStats();
			return res.status(200).json(stats);
		} catch (error) {
			logger.error(`Stats query failed: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	});

	return router;
}

/**
 * Activity log router
 */
export function createActivityRouter(ledger: TEELedgerManager) {
	const router = express.Router();

	/**
	 * Get all activity (for demo)
	 * Query params: ?limit=50 (optional, default 50)
	 */
	router.get("/", async (req, res) => {
		try {
			const limit = req.query.limit ? Number(req.query.limit) : 50;
			const activity = ledger.getRecentActivity(limit);

			return res.status(200).json({
				activities: activity,
				total: activity.length,
			});
		} catch (error) {
			logger.error(`Activity query failed: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	});

	/**
	 * Get activity for specific buyer
	 */
	router.get("/:address", async (req, res) => {
		try {
			const address = req.params.address;

			// Validate address format
			if (!ethers.isAddress(address)) {
				return res.status(400).json({ error: "Invalid address format" });
			}

			const activity = ledger.getBuyerActivityLog(address);

			return res.status(200).json({
				address,
				activities: activity,
				total: activity.length,
			});
		} catch (error) {
			logger.error(`Activity query failed: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	});

	return router;
}

