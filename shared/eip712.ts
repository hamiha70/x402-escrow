/**
 * EIP-712 utilities for PaymentIntent signing and verification
 * 
 * Two-signature pattern for x402 compliance:
 * 1. x402 signature: HTTP authorization with resource binding
 * 2. EIP-3009 signature: Blockchain settlement
 * 
 * Reference: https://eips.ethereum.org/EIPS/eip-712
 */

import { ethers } from "ethers";
import type { PaymentIntent, EIP712Domain, TransferAuthorization } from "./types.js";
import { PAYMENT_INTENT_TYPES, TRANSFER_WITH_AUTHORIZATION_TYPES } from "./types.js";
import { getKnownUSDCDomain, getCachedUSDCDomain } from "./usdc-config.js";

/**
 * x402 Protocol Constants
 */
const X402_VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000402"; // Symbolic x402 address

/**
 * Get x402 EIP-712 domain for HTTP layer payment authorization
 * 
 * This domain is used for the x402 signature which includes resource binding.
 * It's separate from the EIP-3009 domain used for blockchain settlement.
 */
export function getX402Domain(chainId: number): EIP712Domain {
	return {
		name: "x402-Payment-Intent",
		version: "2",
		chainId,
		verifyingContract: X402_VERIFYING_CONTRACT,
	};
}

/**
 * Get EIP-712 domain for a given network and facilitator (legacy)
 * @deprecated Use getX402Domain() for x402 signatures
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
 * Sign a payment intent using x402 EIP-712 domain
 * 
 * This is the HTTP layer authorization signature with resource binding.
 * 
 * @param intent The payment intent to sign
 * @param chainId The chain ID
 * @param signer The ethers signer (buyer's wallet)
 * @returns The x402 signature (hex string)
 */
export async function signX402PaymentIntent(
	intent: PaymentIntent,
	chainId: number,
	signer: ethers.Signer,
): Promise<string> {
	const domain = getX402Domain(chainId);
	const signature = await signer.signTypedData(
		domain,
		PAYMENT_INTENT_TYPES,
		intent,
	);
	return signature;
}

/**
 * Sign a payment intent using EIP-712 (legacy)
 * @deprecated Use signX402PaymentIntent() for x402 signatures
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
 * Verify an x402 payment intent signature
 * 
 * This verifies the HTTP layer authorization signature with resource binding.
 * 
 * @param intent The payment intent
 * @param signature The x402 signature to verify
 * @param chainId The chain ID
 * @returns The recovered signer address
 */
export function verifyX402PaymentIntent(
	intent: PaymentIntent,
	signature: string,
	chainId: number,
): string {
	const domain = getX402Domain(chainId);
	const digest = ethers.TypedDataEncoder.hash(
		domain,
		PAYMENT_INTENT_TYPES,
		intent,
	);
	const recoveredAddress = ethers.recoverAddress(digest, signature);
	return recoveredAddress;
}

/**
 * Verify a payment intent signature (legacy)
 * @deprecated Use verifyX402PaymentIntent() for x402 signatures
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
	const domain = await getCachedUSDCDomain(tokenAddress, chainId, provider);

	const digest = ethers.TypedDataEncoder.hash(
		domain,
		TRANSFER_WITH_AUTHORIZATION_TYPES,
		auth,
	);
	const recoveredAddress = ethers.recoverAddress(digest, signature);
	return recoveredAddress;
}

/**
 * Get vault EIP-712 domain for escrow-deferred scheme
 * 
 * @param vaultAddress The vault contract address
 * @param chainId The chain ID
 * @param provider Provider to query vault for domain separator
 * @returns EIP-712 domain for vault
 */
export async function getVaultDomain(
	vaultAddress: string,
	chainId: number,
	provider: ethers.Provider,
): Promise<EIP712Domain> {
	// Query vault for DOMAIN_SEPARATOR to get exact domain parameters
	const vaultABI = ["function DOMAIN_SEPARATOR() view returns (bytes32)"];
	const vaultContract = new ethers.Contract(vaultAddress, vaultABI, provider);
	
	try {
		const domainSeparator = await vaultContract.DOMAIN_SEPARATOR();
		// For now, we'll construct domain from known vault structure
		// In production, you might want to decode the domain separator
	} catch (error) {
		// Fallback to standard vault domain
	}

	// Standard vault domain structure (matches Vault.sol)
	return {
		name: "x402-Vault",
		version: "1",
		chainId,
		verifyingContract: vaultAddress,
	};
}

/**
 * Sign payment intent with vault EIP-712 domain (for escrow-deferred)
 * 
 * @param intent The payment intent
 * @param vaultAddress The vault contract address
 * @param chainId The chain ID
 * @param signer The ethers signer (buyer's wallet)
 * @param provider Provider to query vault domain
 * @returns The signature (hex string)
 */
export async function signPaymentIntentWithVaultDomain(
	intent: PaymentIntent,
	vaultAddress: string,
	chainId: number,
	signer: ethers.Signer,
	provider: ethers.Provider,
): Promise<string> {
	const domain = await getVaultDomain(vaultAddress, chainId, provider);
	const signature = await signer.signTypedData(
		domain,
		PAYMENT_INTENT_TYPES,
		intent,
	);
	return signature;
}

