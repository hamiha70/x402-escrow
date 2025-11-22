/**
 * Buyer Scheme Strategy Interface
 * 
 * Defines how buyers create payment payloads for different schemes
 */

import type { PaymentRequirements, PaymentPayload } from "../../shared/types.js";
import type { ethers } from "ethers";

/**
 * Scheme Strategy Interface
 * 
 * Each scheme (exact, escrow-deferred, etc.) implements this interface
 * to create the appropriate payment payload.
 */
export interface SchemeStrategy {
	/**
	 * Create payment payload for this scheme
	 * 
	 * @param requirements Payment requirements from 402 response
	 * @param wallet Buyer's wallet for signing
	 * @param provider Provider for blockchain queries
	 * @returns Payment payload ready to send in x-payment header
	 */
	createPayload(
		requirements: PaymentRequirements,
		wallet: ethers.Wallet,
		provider: ethers.Provider
	): Promise<PaymentPayload>;

	/**
	 * Check if any pre-conditions are met (e.g., vault deposit for escrow-deferred)
	 * 
	 * @param requirements Payment requirements
	 * @param wallet Buyer's wallet
	 * @param provider Provider for blockchain queries
	 * @returns true if ready to proceed, false if action needed (deposit, etc.)
	 */
	checkPreconditions(
		requirements: PaymentRequirements,
		wallet: ethers.Wallet,
		provider: ethers.Provider
	): Promise<{ ready: boolean; action?: string }>;
}

