/**
 * Payment Strategy Interface
 * 
 * Defines the contract for different payment schemes (exact, escrow-deferred, etc.)
 */

import type { PaymentRequirements, PaymentPayload, PaymentResponse, PaymentContext } from "../../shared/types.js";

/**
 * Validation result from strategy
 */
export interface StrategyValidationResult {
	valid: boolean;
	error?: string;
	receipt?: PaymentResponse;
}

/**
 * Payment Strategy Interface
 * 
 * Each scheme (exact, escrow-deferred, etc.) implements this interface.
 */
export interface PaymentStrategy {
	/** Scheme identifier (e.g., "x402-exact", "x402-escrow-deferred") */
	scheme: string;

	/**
	 * Generate payment requirements for 402 response
	 * 
	 * @param resource Canonical resource path (scheme-independent)
	 * @param context Payment context with chain and scheme info
	 * @returns PaymentRequirements for this scheme
	 */
	generateRequirements(resource: string, context: PaymentContext): PaymentRequirements;

	/**
	 * Validate payment payload
	 * 
	 * For exact scheme: validates and settles synchronously
	 * For escrow-deferred: validates and queues for deferred settlement
	 * 
	 * @param payload Payment payload from buyer
	 * @param requirements Payment requirements from 402 response
	 * @param context Payment context
	 * @returns Validation result with receipt if valid
	 */
	validatePayment(
		payload: PaymentPayload,
		requirements: PaymentRequirements,
		context: PaymentContext
	): Promise<StrategyValidationResult>;

	/**
	 * Whether this scheme requires immediate settlement
	 * 
	 * @returns true for synchronous schemes (exact), false for deferred (escrow-deferred)
	 */
	shouldSettleImmediately(): boolean;
}

