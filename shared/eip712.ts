/**
 * EIP-712 utilities for PaymentIntent signing and verification
 * 
 * Reference: https://eips.ethereum.org/EIPS/eip-712
 */

import { ethers } from "ethers";
import type { PaymentIntent, EIP712Domain, TransferAuthorization } from "./types.js";
import { PAYMENT_INTENT_TYPES, TRANSFER_WITH_AUTHORIZATION_TYPES } from "./types.js";

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

/**
 * Convert PaymentIntent to EIP-3009 TransferWithAuthorization format
 * 
 * This maps our x402 payment intent to the format required by USDC's
 * transferWithAuthorization function.
 */
export function paymentIntentToTransferAuth(
	intent: PaymentIntent,
): TransferAuthorization {
	return {
		from: intent.buyer,
		to: intent.seller,
		value: intent.amount,
		validAfter: 0, // valid immediately
		validBefore: intent.expiry,
		nonce: intent.nonce,
	};
}

/**
 * Sign EIP-3009 TransferWithAuthorization
 * 
 * NOTE: This function uses a synchronous domain lookup. For best results,
 * use signTransferAuthorizationWithProvider() which queries the contract.
 * 
 * @param auth The transfer authorization parameters
 * @param tokenAddress The USDC token address (verifying contract)
 * @param chainId The chain ID
 * @param signer The ethers signer (buyer's wallet)
 * @returns The signature (hex string)
 */
export async function signTransferAuthorization(
	auth: TransferAuthorization,
	tokenAddress: string,
	chainId: number,
	signer: ethers.Signer,
): Promise<string> {
	// Import here to avoid circular dependency
	const { getKnownUSDCDomain } = await import("./usdc-config.js");
	const domain = getKnownUSDCDomain(tokenAddress, chainId);

	const signature = await signer.signTypedData(
		domain,
		TRANSFER_WITH_AUTHORIZATION_TYPES,
		auth,
	);
	return signature;
}

/**
 * Sign EIP-3009 TransferWithAuthorization (with contract query)
 * 
 * This is the preferred method as it queries the USDC contract for its
 * actual EIP-712 domain, ensuring cross-chain compatibility.
 * 
 * @param auth The transfer authorization parameters
 * @param tokenAddress The USDC token address (verifying contract)
 * @param chainId The chain ID
 * @param signer The ethers signer (buyer's wallet)
 * @param provider The ethers provider for querying the contract
 * @returns The signature (hex string)
 */
export async function signTransferAuthorizationWithProvider(
	auth: TransferAuthorization,
	tokenAddress: string,
	chainId: number,
	signer: ethers.Signer,
	provider: ethers.Provider,
): Promise<string> {
	const { getCachedUSDCDomain } = await import("./usdc-config.js");
	const domain = await getCachedUSDCDomain(tokenAddress, chainId, provider);

	const signature = await signer.signTypedData(
		domain,
		TRANSFER_WITH_AUTHORIZATION_TYPES,
		auth,
	);
	return signature;
}

/**
 * Verify EIP-3009 TransferWithAuthorization signature
 * 
 * NOTE: This function uses a synchronous domain lookup. For best results,
 * use verifyTransferAuthorizationWithProvider() which queries the contract.
 * 
 * @param auth The transfer authorization
 * @param signature The signature to verify
 * @param tokenAddress The USDC token address
 * @param chainId The chain ID
 * @returns The recovered signer address
 */
export async function verifyTransferAuthorization(
	auth: TransferAuthorization,
	signature: string,
	tokenAddress: string,
	chainId: number,
): Promise<string> {
	const { getKnownUSDCDomain } = await import("./usdc-config.js");
	const domain = getKnownUSDCDomain(tokenAddress, chainId);

	const digest = ethers.TypedDataEncoder.hash(
		domain,
		TRANSFER_WITH_AUTHORIZATION_TYPES,
		auth,
	);
	const recoveredAddress = ethers.recoverAddress(digest, signature);
	return recoveredAddress;
}

/**
 * Verify EIP-3009 TransferWithAuthorization signature (with contract query)
 * 
 * This is the preferred method as it queries the USDC contract for its
 * actual EIP-712 domain, ensuring cross-chain compatibility.
 * 
 * @param auth The transfer authorization
 * @param signature The signature to verify
 * @param tokenAddress The USDC token address
 * @param chainId The chain ID
 * @param provider The ethers provider for querying the contract
 * @returns The recovered signer address
 */
export async function verifyTransferAuthorizationWithProvider(
	auth: TransferAuthorization,
	signature: string,
	tokenAddress: string,
	chainId: number,
	provider: ethers.Provider,
): Promise<string> {
	const { getCachedUSDCDomain } = await import("./usdc-config.js");
	const domain = await getCachedUSDCDomain(tokenAddress, chainId, provider);

	const digest = ethers.TypedDataEncoder.hash(
		domain,
		TRANSFER_WITH_AUTHORIZATION_TYPES,
		auth,
	);
	const recoveredAddress = ethers.recoverAddress(digest, signature);
	return recoveredAddress;
}

