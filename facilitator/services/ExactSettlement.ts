/**
 * Exact Settlement Service
 * 
 * Handles validation and settlement for x402-exact scheme (synchronous EIP-3009)
 */

import { ethers } from "ethers";
import { createLogger } from "../../shared/logger.js";
import {
	verifyTransferAuthorizationWithProvider,
	verifyX402PaymentIntent,
} from "../../shared/eip712.js";
import type {
	PaymentPayload,
	PaymentContext,
	PaymentResponse,
	SettlementResult,
} from "../../shared/types.js";

const logger = createLogger("facilitator:exact-settlement");

// USDC EIP-3009 ABI
const USDC_ABI = [
	"function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
	"function balanceOf(address account) view returns (uint256)",
	"function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
];

// Nonce tracking (in-memory for now, should be persistent in production)
const usedNonces = new Set<string>();

export interface ExactSettlementConfig {
	getProvider: (chainId: number) => ethers.JsonRpcProvider;
	getWallet: (chainId: number) => ethers.Wallet;
	getChainConfig: (chainId: number) => { rpc: string; usdc: string; name: string };
}

/**
 * Validate payment intent for exact scheme
 */
export async function validateExactPaymentIntent(
	payload: PaymentPayload,
	context: PaymentContext,
	config: ExactSettlementConfig
): Promise<{
	valid: boolean;
	error?: string;
	buyer?: string;
}> {
	const { intent, x402Signature, transferAuth, eip3009Signature } = payload.data;

	// Check expiry
	if (intent.expiry < Math.floor(Date.now() / 1000)) {
		return { valid: false, error: "Payment intent expired" };
	}

	// Get chain configuration
	const chainConfig = config.getChainConfig(intent.chainId);

	// Check token address matches chain's USDC
	if (intent.token.toLowerCase() !== chainConfig.usdc.toLowerCase()) {
		return {
			valid: false,
			error: `Invalid token address for chain ${intent.chainId}. Expected ${chainConfig.usdc}`,
		};
	}

	// Check nonce uniqueness
	const nonceKey = `${intent.buyer}-${intent.nonce}`;
	if (usedNonces.has(nonceKey)) {
		return { valid: false, error: "Nonce already used (replay attack prevented)" };
	}

	// STEP 1: Verify x402 signature (HTTP layer, resource binding)
	logger.info(`Verifying x402 signature for chain ${intent.chainId} (${chainConfig.name})...`);
	let x402RecoveredAddress: string;
	try {
		x402RecoveredAddress = verifyX402PaymentIntent(intent, x402Signature, intent.chainId);
	} catch (error) {
		return { valid: false, error: "Invalid x402 signature" };
	}

	// Check that x402 signature matches buyer
	if (x402RecoveredAddress.toLowerCase() !== intent.buyer.toLowerCase()) {
		return {
			valid: false,
			error: `x402 signature mismatch. Expected ${intent.buyer}, got ${x402RecoveredAddress}`,
		};
	}

	logger.success("✓ x402 signature valid (resource binding verified)");

	// STEP 2: Verify EIP-3009 signature (settlement layer)
	logger.info("Verifying EIP-3009 signature for settlement...");
	const chainProvider = config.getProvider(intent.chainId);
	let eip3009RecoveredAddress: string;
	try {
		// Query USDC contract for correct EIP-712 domain (cross-chain compatible)
		eip3009RecoveredAddress = await verifyTransferAuthorizationWithProvider(
			transferAuth,
			eip3009Signature,
			chainConfig.usdc,
			intent.chainId,
			chainProvider,
		);
	} catch (error) {
		return { valid: false, error: "Invalid EIP-3009 signature" };
	}

	// Check that EIP-3009 signature matches buyer
	if (eip3009RecoveredAddress.toLowerCase() !== intent.buyer.toLowerCase()) {
		return {
			valid: false,
			error: `EIP-3009 signature mismatch. Expected ${intent.buyer}, got ${eip3009RecoveredAddress}`,
		};
	}

	// Verify same nonce in both
	if (transferAuth.nonce !== intent.nonce) {
		return { valid: false, error: "Nonce mismatch between x402 and EIP-3009" };
	}

	logger.success("✓ EIP-3009 signature valid (settlement authorized)");

	return { valid: true, buyer: x402RecoveredAddress };
}

/**
 * Execute on-chain settlement using EIP-3009 transferWithAuthorization
 * 
 * NO APPROVAL NEEDED - signature serves as authorization
 */
export async function settleExactPayment(
	payload: PaymentPayload,
	context: PaymentContext,
	config: ExactSettlementConfig
): Promise<SettlementResult> {
	const { intent, transferAuth, eip3009Signature } = payload.data;
	const chainConfig = config.getChainConfig(intent.chainId);
	const chainWallet = config.getWallet(intent.chainId);
	const usdcContract = new ethers.Contract(chainConfig.usdc, USDC_ABI, chainWallet);

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

		// Split EIP-3009 signature into v, r, s components
		const sig = ethers.Signature.from(eip3009Signature);

		// Execute EIP-3009 transferWithAuthorization
		logger.info(
			`Executing EIP-3009 transfer: ${transferAuth.from} → ${transferAuth.to} (${transferAuth.value} USDC)`
		);
		const tx = await usdcContract.transferWithAuthorization(
			transferAuth.from, // from
			transferAuth.to, // to
			BigInt(transferAuth.value), // value
			transferAuth.validAfter, // validAfter
			transferAuth.validBefore, // validBefore
			intent.nonce, // nonce
			sig.v, // v
			sig.r, // r
			sig.s // s
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
 * Process exact payment: validate and settle synchronously
 */
export async function processExactPayment(
	payload: PaymentPayload,
	context: PaymentContext,
	config: ExactSettlementConfig
): Promise<PaymentResponse> {
	// Validate payment intent
	const validation = await validateExactPaymentIntent(payload, context, config);

	if (!validation.valid) {
		return {
			scheme: "intent",
			status: "failed",
			error: validation.error,
			seller: payload.data.intent.seller,
			buyer: payload.data.intent.buyer,
			amount: payload.data.intent.amount,
			token: payload.data.intent.token,
		};
	}

	// Settle on-chain
	const settlement = await settleExactPayment(payload, context, config);

	if (!settlement.success) {
		return {
			scheme: "intent",
			status: "failed",
			error: settlement.error,
			seller: payload.data.intent.seller,
			buyer: payload.data.intent.buyer,
			amount: payload.data.intent.amount,
			token: payload.data.intent.token,
		};
	}

	// Success
	return {
		scheme: "intent",
		status: "settled",
		txHash: settlement.txHash,
		settledAt: new Date().toISOString(),
		seller: payload.data.intent.seller,
		buyer: payload.data.intent.buyer,
		amount: payload.data.intent.amount,
		token: payload.data.intent.token,
	};
}

