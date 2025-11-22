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
	 */
	router.get("/:address", async (req, res) => {
		try {
			const address = req.params.address;

			// Validate address format
			if (!ethers.isAddress(address)) {
				return res.status(400).json({ error: "Invalid address format" });
			}

			logger.info(`Balance query for ${address}`);

			const account = ledger.getAccount(address);

			if (!account) {
				return res.status(404).json({
					address,
					balance: "0",
					nonce: 0,
					deposits: [],
					spends: [],
				});
			}

			return res.status(200).json({
				address,
				balance: account.balance,
				nonce: account.nonce,
				deposits: account.deposits,
				spends: account.spends,
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

