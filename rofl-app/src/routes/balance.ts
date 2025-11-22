/**
 * Balance Query Route (runs inside ROFL)
 */

import express from "express";
import { ethers } from "ethers";
import { createLogger } from "../utils/logger.js";
import { TEELedgerManager } from "../services/TEELedgerManager.js";

const logger = createLogger("rofl-balance");

export function createBalanceRouter(ledger: TEELedgerManager) {
	const router = express.Router();

	/**
	 * Get buyer balance
	 * Query params: ?chain=84532 (optional)
	 */
	router.get("/:address", async (req, res) => {
		try {
			const address = req.params.address;
			const chainId = req.query.chain ? Number(req.query.chain) : null;

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

			// Specific chain
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

			// All chains
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

	return router;
}

