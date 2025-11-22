/**
 * Escrow-Deferred Validation Service
 * 
 * Handles validation for x402-escrow-deferred scheme (deferred settlement)
 */

import { ethers } from "ethers";
import { createLogger } from "../../shared/logger.js";
import type {
	PaymentPayload,
	PaymentContext,
	PaymentResponse,
	PaymentRequirements,
} from "../../shared/types.js";
import queue from "./SettlementQueue.js";

const logger = createLogger("facilitator:escrow-deferred-validation");

// Vault ABI for checking deposits
const VAULT_ABI = [
	"function deposits(address) view returns (uint256)",
	"function usedNonces(address, bytes32) view returns (bool)",
	"function DOMAIN_SEPARATOR() view returns (bytes32)",
];

// Nonce tracking (in-memory for now, should be persistent in production)
const usedNonces = new Set<string>();

export interface EscrowDeferredConfig {
	getProvider: (chainId: number) => ethers.JsonRpcProvider;
	getChainConfig: (chainId: number) => { rpc: string; usdc: string; name: string };
}

/**
 * Validate escrow-deferred payment intent
 */
export async function validateEscrowDeferredIntent(
	payload: PaymentPayload,
	requirements: PaymentRequirements,
	context: PaymentContext,
	config: EscrowDeferredConfig
): Promise<{
	valid: boolean;
	error?: string;
	buyer?: string;
}> {
	const { intent, x402Signature } = payload.data;

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

	// Check vault address
	if (!context.vault) {
		return { valid: false, error: "Vault address required for escrow-deferred" };
	}

	// Check nonce uniqueness (off-chain tracking)
	const nonceKey = `${intent.buyer}-${intent.nonce}`;
	if (usedNonces.has(nonceKey)) {
		return { valid: false, error: "Nonce already used (replay attack prevented)" };
	}

	// Verify vault-domain signature
	logger.info(`Verifying vault-domain signature for chain ${intent.chainId} (${chainConfig.name})...`);
	const chainProvider = config.getProvider(intent.chainId);
	
	try {
		// Reconstruct vault domain
		const vaultDomain = {
			name: "x402-Vault",
			version: "1",
			chainId: intent.chainId,
			verifyingContract: context.vault,
		};

		// Verify signature
		const PAYMENT_INTENT_TYPES = {
			PaymentIntent: [
				{ name: "seller", type: "address" },
				{ name: "buyer", type: "address" },
				{ name: "amount", type: "uint256" },
				{ name: "token", type: "address" },
				{ name: "nonce", type: "bytes32" },
				{ name: "expiry", type: "uint256" },
				{ name: "resource", type: "string" },
				{ name: "chainId", type: "uint256" },
			],
		};

		const digest = ethers.TypedDataEncoder.hash(vaultDomain, PAYMENT_INTENT_TYPES, intent);
		const recoveredAddress = ethers.recoverAddress(digest, x402Signature);

		if (recoveredAddress.toLowerCase() !== intent.buyer.toLowerCase()) {
			return {
				valid: false,
				error: `Vault signature mismatch. Expected ${intent.buyer}, got ${recoveredAddress}`,
			};
		}

		logger.success("✓ Vault-domain signature valid");
	} catch (error: any) {
		return { valid: false, error: `Signature verification failed: ${error.message}` };
	}

	// Check vault deposit balance
	logger.info("Checking vault deposit balance...");
	try {
		const vaultContract = new ethers.Contract(context.vault, VAULT_ABI, chainProvider);
		const depositBalance = await vaultContract.deposits(intent.buyer);
		
		if (depositBalance < BigInt(intent.amount)) {
			return {
				valid: false,
				error: `Insufficient vault deposit. Has: ${depositBalance}, needs: ${intent.amount}`,
			};
		}

		logger.success(`✓ Sufficient deposit: ${depositBalance} >= ${intent.amount}`);
	} catch (error: any) {
		return { valid: false, error: `Vault query failed: ${error.message}` };
	}

	// Mark nonce as used (off-chain tracking)
	usedNonces.add(nonceKey);

	logger.success("✓ Payment intent validated (pending settlement)");
	return { valid: true, buyer: intent.buyer };
}

/**
 * Process escrow-deferred payment: validate and queue
 */
export async function processEscrowDeferredPayment(
	payload: PaymentPayload,
	requirements: PaymentRequirements,
	context: PaymentContext,
	config: EscrowDeferredConfig
): Promise<PaymentResponse> {
	// Validate payment intent
	const validation = await validateEscrowDeferredIntent(payload, requirements, context, config);

	if (!validation.valid) {
		return {
			scheme: "x402-escrow-deferred",
			status: "failed",
			error: validation.error,
			seller: payload.data.intent.seller,
			buyer: payload.data.intent.buyer,
			amount: payload.data.intent.amount,
			token: payload.data.intent.token,
		};
	}

	// Add to settlement queue
	const recordId = queue.add({
		scheme: "x402-escrow-deferred",
		chainId: context.chainId,
		vault: context.vault!,
		buyer: payload.data.intent.buyer,
		seller: payload.data.intent.seller,
		amount: payload.data.intent.amount,
		token: payload.data.intent.token,
		nonce: payload.data.intent.nonce,
		resource: payload.data.intent.resource,
		intent: payload.data.intent,
		signature: payload.data.x402Signature,
	});

	logger.info(`Intent queued for batch settlement. ID: ${recordId}, Nonce: ${payload.data.intent.nonce}`);

	// Success (pending settlement)
	return {
		scheme: "x402-escrow-deferred",
		status: "pending",
		mode: "deferred",
		intentNonce: payload.data.intent.nonce,
		seller: payload.data.intent.seller,
		buyer: payload.data.intent.buyer,
		amount: payload.data.intent.amount,
		token: payload.data.intent.token,
	};
}

