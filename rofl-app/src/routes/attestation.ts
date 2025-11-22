/**
 * Attestation Route (ROFL App)
 * 
 * Returns TEE measurement for buyer verification.
 */

import express from "express";
import { logger } from "../utils/logger.js";

export function createAttestationRouter() {
	const router = express.Router();

	router.get("/", async (req, res) => {
		try {
			logger.info("Attestation requested");

			// TODO: Get actual TEE measurement from ROFL SDK
			// For now, return placeholder
			// The ROFL runtime should provide this via environment or SDK

			const attestation = {
				service: "x402-tee-rofl-app",
				version: "1.0.0",
				measurement: process.env.ROFL_MEASUREMENT || "0x...",
				timestamp: Date.now(),
				
				// ROFL-specific fields (to be populated by Oasis team)
				rofl: {
					appId: process.env.ROFL_APP_ID || "",
					instanceId: process.env.ROFL_INSTANCE_ID || "",
					enclaveId: process.env.ROFL_ENCLAVE_ID || "",
				},
				
				// TEE hardware info
				tee: {
					vendor: "Intel",
					technology: process.env.TEE_TECHNOLOGY || "TDX", // SGX or TDX
					version: process.env.TEE_VERSION || "",
				},
			};

			return res.status(200).json(attestation);
		} catch (error) {
			logger.error(`Attestation query failed: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	});

	return router;
}
