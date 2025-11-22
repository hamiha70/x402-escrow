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
import { verifyTransferAuthorizationWithProvider, paymentIntentToTransferAuth, verifyX402PaymentIntent } from "../shared/eip712.js";
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
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY;
const FACILITATOR_ADDRESS = process.env.FACILITATOR_WALLET_ADDRESS;

if (!FACILITATOR_PRIVATE_KEY || !FACILITATOR_ADDRESS) {
	throw new Error("Missing required environment variables: FACILITATOR_PRIVATE_KEY, FACILITATOR_WALLET_ADDRESS");
}

// Multi-chain configuration
const CHAIN_CONFIG: Record<number, { rpc: string; usdc: string; name: string }> = {
	84532: { rpc: process.env.BASE_SEPOLIA_RPC!, usdc: process.env.USDC_BASE_SEPOLIA!, name: "Base Sepolia" },
	80002: { rpc: process.env.POLYGON_AMOY_RPC!, usdc: process.env.USDC_POLYGON_AMOY!, name: "Polygon Amoy" },
	421614: { rpc: process.env.ARBITRUM_SEPOLIA_RPC!, usdc: process.env.USDC_ARBITRUM_SEPOLIA!, name: "Arbitrum Sepolia" },
	11155420: { rpc: process.env.OPTIMISM_SEPOLIA_RPC!, usdc: process.env.USDC_OPTIMISM_SEPOLIA!, name: "Optimism Sepolia" },
	1243: { rpc: process.env.ARC_TESTNET_RPC!, usdc: process.env.USDC_ARC_TESTNET!, name: "Arc Testnet" },
	11155111: { rpc: process.env.ETHEREUM_SEPOLIA_RPC!, usdc: process.env.USDC_ETHEREUM_SEPOLIA!, name: "Ethereum Sepolia" }
};

// Provider and wallet cache (one per chain)
const providerCache = new Map<number, ethers.JsonRpcProvider>();
const walletCache = new Map<number, ethers.Wallet>();

function getProvider(chainId: number): ethers.JsonRpcProvider {
	if (!providerCache.has(chainId)) {
		const config = CHAIN_CONFIG[chainId];
		if (!config || !config.rpc) {
			throw new Error(`Chain ${chainId} not configured or RPC URL missing`);
		}
		providerCache.set(chainId, new ethers.JsonRpcProvider(config.rpc));
	}
	return providerCache.get(chainId)!;
}

function getWallet(chainId: number): ethers.Wallet {
	if (!walletCache.has(chainId)) {
		const provider = getProvider(chainId);
		walletCache.set(chainId, new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider));
	}
	return walletCache.get(chainId)!;
}

function getChainConfig(chainId: number) {
	const config = CHAIN_CONFIG[chainId];
	if (!config) {
		throw new Error(`Chain ${chainId} not supported`);
	}
	return config;
}

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
	const { intent, x402Signature, transferAuth, eip3009Signature } = payload.data;

	// Check expiry
	if (intent.expiry < Math.floor(Date.now() / 1000)) {
		return { valid: false, error: "Payment intent expired" };
	}

	// Get chain configuration
	const chainConfig = getChainConfig(intent.chainId);
	
	// Check token address matches chain's USDC
	if (intent.token.toLowerCase() !== chainConfig.usdc.toLowerCase()) {
		return { valid: false, error: `Invalid token address for chain ${intent.chainId}. Expected ${chainConfig.usdc}` };
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
		x402RecoveredAddress = verifyX402PaymentIntent(
			intent,
			x402Signature,
			intent.chainId,
		);
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
	const chainProvider = getProvider(intent.chainId);
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
async function settlePayment(payload: PaymentPayload): Promise<SettlementResult> {
	const { intent, transferAuth, eip3009Signature } = payload.data;
	const chainConfig = getChainConfig(intent.chainId);
	const chainWallet = getWallet(intent.chainId);
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
		logger.info(`Executing EIP-3009 transfer: ${transferAuth.from} → ${transferAuth.to} (${transferAuth.value} USDC)`);
		const tx = await usdcContract.transferWithAuthorization(
			transferAuth.from,             // from
			transferAuth.to,               // to
			BigInt(transferAuth.value),    // value
			transferAuth.validAfter,       // validAfter
			transferAuth.validBefore,      // validBefore
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

		// Validate payload structure (two-signature pattern)
		if (!payload.scheme || !payload.data || !payload.data.intent || 
		    !payload.data.x402Signature || !payload.data.transferAuth || !payload.data.eip3009Signature) {
			return res.status(400).json({
				error: "Invalid payment payload structure (requires x402Signature, transferAuth, eip3009Signature)",
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
	logger.info(`Multi-chain facilitator - Supports:`);
	Object.entries(CHAIN_CONFIG).forEach(([chainId, config]) => {
		if (config.rpc && config.usdc) {
			logger.info(`  • ${config.name} (${chainId}): ${config.usdc}`);
		}
	});
	logger.info(`Facilitator address: ${FACILITATOR_ADDRESS}`);
	logger.info(`Settlement mode: SYNCHRONOUS (EIP-3009 transferWithAuthorization)`);
	logger.info(`✅ NO APPROVAL NEEDED - gasless for buyers!`);
});

