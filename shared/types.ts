/**
 * Shared types for x402 Payment Protocol
 * 
 * Implements Polygon's x402 specification with immediate/synchronous settlement.
 * Reference: https://agentic-docs.polygon.technology/general/x402/
 */

/**
 * Payment intent structure (EIP-712 signed data)
 * 
 * Core data structure that buyer signs to authorize payment.
 * Settlement happens synchronously before content delivery.
 */
export interface PaymentIntent {
	/** Address of the seller receiving payment */
	seller: string;

	/** Address of the buyer making payment */
	buyer: string;

	/** Payment amount in token's smallest unit (USDC has 6 decimals) */
	amount: string;

	/** Payment token contract address (USDC) */
	token: string;

	/** Unique nonce to prevent replay attacks (32 bytes hex) */
	nonce: string;

	/** Unix timestamp when intent expires */
	expiry: number;

	/** Resource/endpoint being accessed (e.g., "/api/content/premium") */
	resource: string;

	/** Chain ID to prevent cross-chain replay attacks */
	chainId: number;
}

/**
 * Payment payload (sent in x-payment header)
 * 
 * Two-signature pattern for full x402 compliance:
 * 1. x402 signature: HTTP authorization with resource binding
 * 2. EIP-3009 signature: Blockchain settlement authorization
 */
export interface PaymentPayload {
	/** Payment scheme (e.g., "intent", "direct") */
	scheme: "intent";

	/** Scheme-specific payment data */
	data: {
		/** The payment intent (for x402 signature) */
		intent: PaymentIntent;
		
		/** x402 EIP-712 signature (HTTP layer authorization with resource binding) */
		x402Signature: string;
		
		/** EIP-3009 transfer authorization (for blockchain settlement) */
		transferAuth: TransferAuthorization;
		
		/** EIP-3009 signature (blockchain layer settlement) */
		eip3009Signature: string;
	};
}

/**
 * EIP-712 domain for PaymentIntent signing
 */
export interface EIP712Domain {
	name: string;
	version: string;
	chainId: number;
	verifyingContract: string;
}

/**
 * EIP-712 types definition for PaymentIntent
 * 
 * Must match the Solidity struct field order and types exactly
 */
export const PAYMENT_INTENT_TYPES = {
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

/**
 * EIP-3009 TransferWithAuthorization parameters
 * 
 * Used for gasless USDC transfers without approval
 */
export interface TransferAuthorization {
	from: string;          // buyer address
	to: string;            // seller address  
	value: string;         // amount in token units
	validAfter: number;    // unix timestamp
	validBefore: number;   // unix timestamp (expiry)
	nonce: string;         // bytes32 unique nonce
}

/**
 * EIP-712 types for EIP-3009 TransferWithAuthorization
 * 
 * Matches USDC contract's EIP-3009 implementation
 */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
	TransferWithAuthorization: [
		{ name: "from", type: "address" },
		{ name: "to", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "validAfter", type: "uint256" },
		{ name: "validBefore", type: "uint256" },
		{ name: "nonce", type: "bytes32" },
	],
};

/**
 * Validation result from facilitator
 */
export interface ValidationResult {
	valid: boolean;
	error?: string;
	metadata?: {
		verifiedAt: number;
		buyer: string;
		seller: string;
		amount: string;
		resource: string;
	};
}

/**
 * Payment response (sent in X-PAYMENT-RESPONSE header)
 * 
 * Confirms successful payment settlement
 */
export interface PaymentResponse {
	/** Payment scheme used */
	scheme: "intent";

	/** Payment status (settled = completed on-chain) */
	status: "settled" | "failed";

	/** Transaction hash (proof of settlement) */
	txHash?: string;

	/** ISO timestamp when payment was settled */
	settledAt?: string;

	/** Seller address */
	seller: string;

	/** Buyer address */
	buyer: string;

	/** Amount transferred */
	amount: string;

	/** Token address */
	token: string;

	/** Error message if failed */
	error?: string;
}

/**
 * Payment requirements (sent in 402 response)
 * 
 * Matches Polygon's PaymentRequirements structure
 * Reference: https://agentic-docs.polygon.technology/general/x402/how-it-works/
 */
export interface PaymentRequirements {
	/** Network identifier (e.g., "base-sepolia", "polygon-amoy") */
	network: string;

	/** Token symbol (e.g., "USDC") */
	token: string;

	/** Token contract address */
	tokenAddress: string;

	/** Required payment amount (formatted, e.g., "0.01") */
	amount: string;

	/** Token decimals (e.g., 6 for USDC) */
	decimals: number;

	/** Seller address (payment recipient) */
	seller: string;

	/** Resource being accessed */
	resource: string;

	/** Facilitator endpoint URL */
	facilitator: string;

	/** Chain ID */
	chainId: number;

	/** Supported payment schemes */
	schemes: string[];

	/** Optional: Expiry timestamp */
	expiresAt?: number;
}

/**
 * Settlement result (internal)
 */
export interface SettlementResult {
	success: boolean;
	txHash?: string;
	error?: string;
	gasUsed?: string;
}

