/**
 * TEE Proxy Route
 * 
 * Proxies TEE facilitator requests from main facilitator to ROFL instance.
 * Main facilitator acts as unified API surface for all schemes.
 */

import express from "express";
import axios from "axios";
import { createLogger } from "../../shared/logger.js";

const logger = createLogger("tee-proxy");

export function createTEEProxyRouter() {
	const router = express.Router();
	
	const roflUrl = process.env.ROFL_INSTANCE_URL || "http://localhost:8080";

	logger.info(`TEE Proxy configured: ${roflUrl}`);

	/**
	 * Proxy settlement requests to ROFL instance
	 */
	router.post("/", async (req, res) => {
		try {
			logger.info(`Proxying TEE settlement to ${roflUrl}/settle`);
			logger.info(`Buyer: ${req.body.intentStruct?.buyer}, Chain: ${req.body.intentStruct?.chainId}`);
			
			const response = await axios.post(`${roflUrl}/settle`, req.body, {
				timeout: 60000, // 60s timeout
			});
			
			logger.info(`TEE settlement successful: ${response.data.success}`);
			logger.info(`Transaction: ${response.data.txHash}`);
			
			return res.status(response.status).json(response.data);
		} catch (error: any) {
			logger.error(`TEE proxy error: ${error.message}`);
			
			if (error.response) {
				// ROFL returned an error
				return res.status(error.response.status).json(error.response.data);
			}
			
			// Network error or timeout
			return res.status(503).json({
				error: "TEE facilitator unreachable",
				details: error.message,
				roflUrl: roflUrl,
			});
		}
	});

	return router;
}
