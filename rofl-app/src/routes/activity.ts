/**
 * Activity Log Route (runs inside ROFL)
 */

import express from "express";
import { ethers } from "ethers";
import { createLogger } from "../utils/logger.js";
import { TEELedgerManager } from "../services/TEELedgerManager.js";

const logger = createLogger("rofl-activity");

export function createActivityRouter(ledger: TEELedgerManager) {
	const router = express.Router();

	/**
	 * Get all activity (for demo)
	 * Query params: ?limit=50
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

