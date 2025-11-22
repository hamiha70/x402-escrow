/**
 * x402 Facilitator - Synchronous Settlement
 * 
 * Validates payment intents and executes immediate on-chain settlement
 * before confirming to the seller.
 * 
 * Flow:
 * 1. Seller forwards payment from buyer
 * 2. Facilitator verifies EIP-712 signature
 * 3. Facilitator executes transferFrom (requires prior approval)
 * 4. Facilitator returns settlement confirmation
 * 5. Seller delivers content
 */

import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { createLogger } from "../shared/logger.js";
import { verifyTransferAuthorizationWithProvider, paymentIntentToTransferAuth } from "../shared/eip712.js";
import type {
	PaymentPayload,
	PaymentResponse,
	SettlementResult,
} from "../shared/types.js";

dotenv.config();

const logger = createLogger("facilitator");
const app = express();
app.use(express.json());

// Environment configuration
const PORT = process.env.FACILITATOR_PORT || 4023;
const RPC_URL = process.env.BASE_SEPOLIA_RPC;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY;
const FACILITATOR_ADDRESS = process.env.FACILITATOR_WALLET_ADDRESS;
const USDC_BASE_SEPOLIA = process.env.USDC_BASE_SEPOLIA;
const CHAIN_ID = 84532; // Base Sepolia

if (!RPC_URL || !FACILITATOR_PRIVATE_KEY || !FACILITATOR_ADDRESS || !USDC_BASE_SEPOLIA) {
	throw new Error("Missing required environment variables");
}

// Setup provider and signer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const facilitatorWallet = new ethers.Wallet(FACILITATOR_PRIVATE_KEY, provider);

// USDC EIP-3009 ABI
const USDC_ABI = [
	"function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
	"function balanceOf(address account) view returns (uint256)",
	"function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
];

// Nonce tracking (in-memory for now, should be persistent in production)
const usedNonces = new Set<string>();

/**
 * Verify payment intent signature and fields
 */
async function validatePaymentIntent(payload: PaymentPayload): Promise<{
	valid: boolean;
	error?: string;
	buyer?: string;
}> {
	const { intent, signature } = payload.data;

	// Check expiry
	if (intent.expiry < Math.floor(Date.now() / 1000)) {
		return { valid: false, error: "Payment intent expired" };
	}

	// Check chain ID
	if (intent.chainId !== CHAIN_ID) {
		return { valid: false, error: `Invalid chain ID. Expected ${CHAIN_ID}` };
	}

	// Check token address
	if (intent.token.toLowerCase() !== USDC_BASE_SEPOLIA!.toLowerCase()) {
		return { valid: false, error: "Invalid token address" };
	}

	// Check nonce uniqueness
	const nonceKey = `${intent.buyer}-${intent.nonce}`;
	if (usedNonces.has(nonceKey)) {
		return { valid: false, error: "Nonce already used (replay attack prevented)" };
	}

	// Verify EIP-3009 signature
	// Convert intent to TransferAuthorization format for verification
	const transferAuth = paymentIntentToTransferAuth(intent);
	let recoveredAddress: string;
	try {
		// Query USDC contract for correct EIP-712 domain (cross-chain compatible)
		recoveredAddress = await verifyTransferAuthorizationWithProvider(
			transferAuth,
			signature,
			USDC_BASE_SEPOLIA!,
			CHAIN_ID,
			provider,
		);
	} catch (error) {
		return { valid: false, error: "Invalid EIP-3009 signature" };
	}

	// Check that signature matches buyer
	if (recoveredAddress.toLowerCase() !== intent.buyer.toLowerCase()) {
		return {
			valid: false,
			error: `Signature mismatch. Expected ${intent.buyer}, got ${recoveredAddress}`,
		};
	}

	return { valid: true, buyer: recoveredAddress };
}

/**
 * Execute on-chain settlement using EIP-3009 transferWithAuthorization
 * 
 * NO APPROVAL NEEDED - signature serves as authorization
 */
async function settlePayment(payload: PaymentPayload): Promise<SettlementResult> {
	const { intent, signature } = payload.data;
	const usdcContract = new ethers.Contract(USDC_BASE_SEPOLIA!, USDC_ABI, facilitatorWallet);

	try {
		// Check buyer's balance
		const balance = await usdcContract.balanceOf(intent.buyer);
		if (balance < BigInt(intent.amount)) {
			return {
				success: false,
				error: `Insufficient balance. Has: ${balance}, needs: ${intent.amount}`,
			};
		}

		// Check if nonce already used on-chain
		const isUsed = await usdcContract.authorizationState(intent.buyer, intent.nonce);
		if (isUsed) {
			return {
				success: false,
				error: "Nonce already used on-chain (replay protection)",
			};
		}

		// Split signature into v, r, s components for EIP-3009
		const sig = ethers.Signature.from(signature);

		// Execute EIP-3009 transferWithAuthorization
		logger.info(`Executing EIP-3009 transfer: ${intent.buyer} → ${intent.seller} (${intent.amount} USDC)`);
		const tx = await usdcContract.transferWithAuthorization(
			intent.buyer,           // from
			intent.seller,          // to
			BigInt(intent.amount),  // value
			0,                      // validAfter (immediately)
			intent.expiry,          // validBefore (expiry)
			intent.nonce,           // nonce
			sig.v,                  // v
			sig.r,                  // r
			sig.s,                  // s
		);

		// Wait for confirmation
		logger.info(`Waiting for transaction confirmation: ${tx.hash}`);
		const receipt = await tx.wait();

		if (!receipt || receipt.status === 0) {
			return {
				success: false,
				error: "Transaction failed",
			};
		}

		logger.success(`EIP-3009 settlement successful: ${tx.hash}`);
		logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

		// Mark nonce as used (redundant with on-chain, but good for local tracking)
		const nonceKey = `${intent.buyer}-${intent.nonce}`;
		usedNonces.add(nonceKey);

		return {
			success: true,
			txHash: tx.hash,
			gasUsed: receipt.gasUsed.toString(),
		};
	} catch (error: any) {
		logger.error("EIP-3009 settlement failed", error.message);
		return {
			success: false,
			error: error.message || "Unknown settlement error",
		};
	}
}

/**
 * POST /settle
 * 
 * Validate and settle a payment intent synchronously
 */
app.post("/settle", async (req, res) => {
	try {
		const payload: PaymentPayload = req.body;

		// Validate payload structure
		if (!payload.scheme || !payload.data || !payload.data.intent || !payload.data.signature) {
			return res.status(400).json({
				error: "Invalid payment payload structure",
			});
		}

		logger.info(`Received settlement request for resource: ${payload.data.intent.resource}`);

		// Step 1: Validate intent
		const validation = await validatePaymentIntent(payload);
		if (!validation.valid) {
			logger.warn(`Validation failed: ${validation.error}`);
			return res.status(400).json({
				scheme: payload.scheme,
				status: "failed",
				error: validation.error,
			} as PaymentResponse);
		}

		logger.info(`Validation successful. Buyer: ${validation.buyer}`);

		// Step 2: Execute settlement
		const settlement = await settlePayment(payload);
		if (!settlement.success) {
			logger.error(`Settlement failed: ${settlement.error}`);
			return res.status(402).json({
				scheme: payload.scheme,
				status: "failed",
				error: settlement.error,
			} as PaymentResponse);
		}

		// Step 3: Return success
		const response: PaymentResponse = {
			scheme: payload.scheme,
			status: "settled",
			txHash: settlement.txHash,
			settledAt: new Date().toISOString(),
			seller: payload.data.intent.seller,
			buyer: payload.data.intent.buyer,
			amount: payload.data.intent.amount,
			token: payload.data.intent.token,
		};

		logger.success(`Payment settled successfully: ${settlement.txHash}`);
		return res.status(200).json(response);
	} catch (error: any) {
		logger.error("Unexpected error", error);
		return res.status(500).json({
			error: "Internal server error",
			details: error.message,
		});
	}
});

/**
 * GET /health
 */
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		facilitator: FACILITATOR_ADDRESS,
		chainId: CHAIN_ID,
		usedNoncesCount: usedNonces.size,
	});
});

/**
 * Start server
 */
app.listen(PORT, () => {
	logger.success(`Facilitator running on port ${PORT}`);
	logger.info(`Chain ID: ${CHAIN_ID} (Base Sepolia)`);
	logger.info(`Facilitator address: ${FACILITATOR_ADDRESS}`);
	logger.info(`USDC address: ${USDC_BASE_SEPOLIA}`);
	logger.info(`Settlement mode: SYNCHRONOUS (EIP-3009 transferWithAuthorization)`);
	logger.info(`✅ NO APPROVAL NEEDED - gasless for buyers!`);
});

