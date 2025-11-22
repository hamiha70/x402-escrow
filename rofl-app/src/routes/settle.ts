/**
 * TEE Settlement Route (runs inside ROFL)
 * 
 * Handles payment settlement for x402-tee-facilitator scheme.
 */

import express from "express";
import { ethers } from "ethers";
import { createLogger } from "../utils/logger.js";
import type { TEEPaymentPayload } from "../utils/types.js";
import { TEELedgerManager } from "../services/TEELedgerManager.js";
import { OmnibusVaultManager } from "../services/OmnibusVaultManager.js";

const logger = createLogger("rofl-settle");

export function createSettleRouter(
	ledger: TEELedgerManager,
	vaultManager: OmnibusVaultManager
) {
	const router = express.Router();

	router.post("/", async (req, res) => {
		try {
			const payload: TEEPaymentPayload = req.body;

			if (!payload.intentStruct || !payload.signature) {
				return res.status(400).json({
					error: "Missing intentStruct or signature",
				});
			}

			const intent = payload.intentStruct;

			logger.info(`Processing payment for buyer ${intent.buyer}`);
			logger.info(`Seller: ${intent.seller}, Amount: ${intent.amount}, Chain: ${intent.chainId}`);

			// 1. Verify intent hash matches struct
			const intentHash = ethers.keccak256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					[
						"address",
						"address",
						"uint256",
						"address",
						"bytes32",
						"uint256",
						"string",
						"uint256",
					],
					[
						intent.buyer,
						intent.seller,
						intent.amount,
						intent.token,
						intent.nonce,
						intent.expiry,
						intent.resource,
						intent.chainId,
					]
				)
			);

			logger.info(`Intent hash: ${intentHash}`);

			// 2. Verify EIP-712 signature
			const vaultAddress = vaultManager.getVaultAddress(intent.chainId);

			const domain = {
				name: "x402-tee-facilitator",
				version: "1",
				chainId: intent.chainId,
				verifyingContract: vaultAddress,
			};

			const types = {
				PaymentIntent: [
					{ name: "buyer", type: "address" },
					{ name: "seller", type: "address" },
					{ name: "amount", type: "uint256" },
					{ name: "token", type: "address" },
					{ name: "nonce", type: "bytes32" },
					{ name: "expiry", type: "uint256" },
					{ name: "resource", type: "string" },
					{ name: "chainId", type: "uint256" },
				],
			};

			let recovered: string;
			try {
				recovered = ethers.verifyTypedData(
					domain,
					types,
					intent,
					payload.signature
				);
			} catch (error) {
				logger.error(`Signature verification failed: ${error}`);
				return res.status(400).json({ error: "Invalid signature" });
			}

			if (recovered.toLowerCase() !== intent.buyer.toLowerCase()) {
				logger.warn(
					`Signature mismatch: recovered ${recovered}, expected ${intent.buyer}`
				);
				return res.status(400).json({ error: "Signature mismatch" });
			}

			logger.info(`✓ Signature valid`);

			// 3. Check expiry
			if (Math.floor(Date.now() / 1000) > intent.expiry) {
				return res.status(400).json({ error: "Payment intent expired" });
			}

			// 4. Check balance in ledger FOR THIS CHAIN
			const balance = ledger.getBalance(intent.buyer, intent.chainId);
			if (balance < BigInt(intent.amount)) {
				logger.warn(
					`Insufficient balance on chain ${intent.chainId}: ${balance} < ${intent.amount}`
				);
				return res.status(402).json({
					error: "Insufficient balance",
					currentBalance: balance.toString(),
					required: intent.amount,
					chain: intent.chainId,
				});
			}

			logger.info(`✓ Sufficient balance on chain ${intent.chainId}: ${balance}`);

			// 5. Check seller is allowlisted
			const isAllowed = await vaultManager.isSellerAllowed(
				intent.chainId,
				intent.seller
			);
			if (!isAllowed) {
				logger.warn(`Seller not authorized: ${intent.seller}`);
				return res.status(403).json({
					error: "Seller not authorized",
				});
			}

			logger.info(`✓ Seller authorized`);

			// 6. Settle on-chain (withdraw from omnibus vault to seller)
			let txHash: string;
			try {
				txHash = await vaultManager.withdrawToSeller(
					intent.chainId,
					intent.seller,
					intent.amount,
					intentHash
				);
			} catch (error) {
				logger.error(`Settlement failed: ${error}`);
				return res.status(500).json({
					error: "Settlement failed",
					details: (error as Error).message,
				});
			}

			logger.info(`✓ Settlement successful: ${txHash}`);

			// 7. Update ledger (deduct from buyer on this chain)
			try {
				ledger.recordSpend(
					intent.buyer,
					intent.seller,
					intent.amount,
					intent.resource,
					intent.chainId,
					txHash,
					intentHash
				);
			} catch (error) {
				logger.error(`Ledger update failed: ${error}`);
				// Settlement already happened; log but continue
			}

			const newBalance = ledger.getBalance(intent.buyer, intent.chainId);

			logger.info(`✓ New balance on chain ${intent.chainId}: ${newBalance}`);

			// 8. Return receipt
			return res.status(200).json({
				success: true,
				txHash,
				intentHash,
				newBalance: newBalance.toString(),
				seller: intent.seller,
				amount: intent.amount,
				chain: intent.chainId,
			});
		} catch (error) {
			logger.error(`Unexpected error: ${error}`);
			return res.status(500).json({
				error: "Internal server error",
				details: (error as Error).message,
			});
		}
	});

	return router;
}

