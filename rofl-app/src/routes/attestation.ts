/**
 * Attestation Route (runs inside ROFL)
 * 
 * Returns TEE measurement for buyer verification.
 */

import express from "express";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("rofl-attestation");

export function createAttestationRouter() {
	const router = express.Router();

	router.get("/", async (req, res) => {
		try {
			// TODO: Get actual TEE measurement from ROFL runtime
			// This is placeholder; actual implementation depends on ROFL SDK

			const attestation = {
				measurement: process.env.ROFL_MEASUREMENT || "0x...",
				timestamp: Date.now(),
				version: "1.0.0",
				codeHash: process.env.ROFL_CODE_HASH || "0x...",
				status: "active",
			};

			logger.info("Attestation requested");

			return res.status(200).json(attestation);
		} catch (error) {
			logger.error(`Attestation failed: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	});

	return router;
}

