/**
 * TEE Proxy Route
 * 
 * Proxies x402-tee-facilitator requests to the ROFL app running in TEE.
 * This allows the facilitator to provide a unified API surface while
 * delegating TEE operations to the isolated ROFL instance.
 */

import express from "express";
import axios from "axios";
import { createLogger } from "../../shared/logger.js";

const logger = createLogger("tee-proxy");

const ROFL_INSTANCE_URL = process.env.ROFL_INSTANCE_URL || "http://localhost:8080";

export function createTEEProxyRouter() {
	const router = express.Router();

	/**
	 * POST /tee-settle - Proxy to ROFL /settle
	 */
	router.post("/tee-settle", async (req, res) => {
		try {
			logger.info(`Proxying TEE settlement to ${ROFL_INSTANCE_URL}/settle`);

			const response = await axios.post(
				`${ROFL_INSTANCE_URL}/settle`,
				req.body,
				{
					headers: {
						"Content-Type": "application/json",
					},
					timeout: 30000, // 30s timeout
				}
			);

			return res.status(response.status).json(response.data);
		} catch (error: any) {
			logger.error(`ROFL proxy error: ${error.message}`);
			
			if (error.response) {
				return res.status(error.response.status).json(error.response.data);
			}

			return res.status(503).json({
				error: "TEE facilitator unavailable",
				details: error.message,
			});
		}
	});

	/**
	 * GET /balance/:address - Proxy to ROFL /balance/:address
	 */
	router.get("/balance/:address", async (req, res) => {
		try {
			const address = req.params.address;
			const chain = req.query.chain;

			logger.info(`Proxying balance query for ${address}`);

			const url = `${ROFL_INSTANCE_URL}/balance/${address}${
				chain ? `?chain=${chain}` : ""
			}`;

			const response = await axios.get(url, { timeout: 10000 });

			return res.status(response.status).json(response.data);
		} catch (error: any) {
			logger.error(`ROFL proxy error: ${error.message}`);

			if (error.response) {
				return res.status(error.response.status).json(error.response.data);
			}

			return res.status(503).json({
				error: "TEE facilitator unavailable",
			});
		}
	});

	/**
	 * GET /activity - Proxy to ROFL /activity
	 */
	router.get("/activity", async (req, res) => {
		try {
			const limit = req.query.limit;

			logger.info("Proxying activity log query");

			const url = `${ROFL_INSTANCE_URL}/activity${
				limit ? `?limit=${limit}` : ""
			}`;

			const response = await axios.get(url, { timeout: 10000 });

			return res.status(response.status).json(response.data);
		} catch (error: any) {
			logger.error(`ROFL proxy error: ${error.message}`);

			if (error.response) {
				return res.status(error.response.status).json(error.response.data);
			}

			return res.status(503).json({
				error: "TEE facilitator unavailable",
			});
		}
	});

	/**
	 * GET /activity/:address - Proxy to ROFL /activity/:address
	 */
	router.get("/activity/:address", async (req, res) => {
		try {
			const address = req.params.address;

			logger.info(`Proxying activity query for ${address}`);

			const response = await axios.get(
				`${ROFL_INSTANCE_URL}/activity/${address}`,
				{ timeout: 10000 }
			);

			return res.status(response.status).json(response.data);
		} catch (error: any) {
			logger.error(`ROFL proxy error: ${error.message}`);

			if (error.response) {
				return res.status(error.response.status).json(error.response.data);
			}

			return res.status(503).json({
				error: "TEE facilitator unavailable",
			});
		}
	});

	/**
	 * GET /attestation - Proxy to ROFL /attestation
	 */
	router.get("/attestation", async (req, res) => {
		try {
			logger.info("Proxying attestation request");

			const response = await axios.get(
				`${ROFL_INSTANCE_URL}/attestation`,
				{ timeout: 10000 }
			);

			return res.status(response.status).json(response.data);
		} catch (error: any) {
			logger.error(`ROFL proxy error: ${error.message}`);

			if (error.response) {
				return res.status(error.response.status).json(error.response.data);
			}

			return res.status(503).json({
				error: "TEE facilitator unavailable",
			});
		}
	});

	return router;
}

