/**
 * EIP-712 utilities for PaymentIntent signing and verification
 * 
 * Reference: https://eips.ethereum.org/EIPS/eip-712
 */

import { ethers } from "ethers";
import type { PaymentIntent, EIP712Domain } from "./types.js";
import { PAYMENT_INTENT_TYPES } from "./types.js";

/**
 * Get EIP-712 domain for a given network and facilitator
 */
export function getEIP712Domain(
	chainId: number,
	facilitatorAddress: string,
): EIP712Domain {
	return {
		name: "x402-payment",
		version: "1",
		chainId,
		verifyingContract: facilitatorAddress,
	};
}

/**
 * Sign a payment intent using EIP-712
 * 
 * @param intent The payment intent to sign
 * @param domain The EIP-712 domain
 * @param signer The ethers signer (buyer's wallet)
 * @returns The signature (hex string)
 */
export async function signPaymentIntent(
	intent: PaymentIntent,
	domain: EIP712Domain,
	signer: ethers.Signer,
): Promise<string> {
	const signature = await signer.signTypedData(
		domain,
		PAYMENT_INTENT_TYPES,
		intent,
	);
	return signature;
}

/**
 * Verify a payment intent signature
 * 
 * @param intent The payment intent
 * @param signature The signature to verify
 * @param domain The EIP-712 domain
 * @returns The recovered signer address
 */
export function verifyPaymentIntent(
	intent: PaymentIntent,
	signature: string,
	domain: EIP712Domain,
): string {
	const digest = ethers.TypedDataEncoder.hash(
		domain,
		PAYMENT_INTENT_TYPES,
		intent,
	);
	const recoveredAddress = ethers.recoverAddress(digest, signature);
	return recoveredAddress;
}

/**
 * Generate a unique nonce for a payment intent
 * 
 * Uses timestamp + random bytes for uniqueness
 */
export function generateNonce(): string {
	const timestamp = Date.now();
	const random = ethers.hexlify(ethers.randomBytes(24));
	const combined = ethers.concat([
		ethers.toBeHex(timestamp, 8),
		random,
	]);
	return ethers.keccak256(combined);
}

/**
 * Hash a payment intent for tracking
 */
export function hashPaymentIntent(intent: PaymentIntent): string {
	return ethers.keccak256(
		ethers.toUtf8Bytes(JSON.stringify(intent)),
	);
}

