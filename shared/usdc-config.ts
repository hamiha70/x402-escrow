/**
 * USDC Token Configuration
 * 
 * Different chains use different EIP-712 domain names for USDC:
 * - Some use "USDC" (Base, Arbitrum, Optimism testnets)
 * - Some use "USD Coin" (Ethereum mainnet)
 * - Version can also vary
 * 
 * This module provides chain-specific configuration and utilities to
 * automatically detect the correct EIP-712 domain from the token contract.
 */

import { ethers } from "ethers";
import type { EIP712Domain } from "./types.js";

/**
 * Known USDC EIP-712 domains for different chains
 * This is a fallback - we should query the contract when possible
 */
export const KNOWN_USDC_DOMAINS: Record<number, { name: string; version: string }> = {
	// Ethereum Mainnet
	1: { name: "USD Coin", version: "2" },
	// Ethereum Sepolia
	11155111: { name: "USD Coin", version: "2" },
	// Base Sepolia (confirmed by contract query)
	84532: { name: "USDC", version: "2" },
	// Base Mainnet
	8453: { name: "USD Coin", version: "2" },
	// Arbitrum Sepolia
	421614: { name: "USDC", version: "2" },
	// Arbitrum One
	42161: { name: "USD Coin", version: "2" },
	// Optimism Sepolia
	11155420: { name: "USDC", version: "2" },
	// Optimism Mainnet
	10: { name: "USD Coin", version: "2" },
	// Polygon Amoy (testnet)
	80002: { name: "USDC", version: "2" },
	// Polygon Mainnet
	137: { name: "USD Coin", version: "2" },
	// Arc Testnet (Circle's L3) - Correct chain ID
	5042002: { name: "USDC", version: "2" },
};

/**
 * ERC-20 + EIP-712 minimal ABI for querying token metadata
 */
const TOKEN_METADATA_ABI = [
	"function name() view returns (string)",
	"function version() view returns (string)",
	"function DOMAIN_SEPARATOR() view returns (bytes32)",
];

/**
 * Query USDC contract for its EIP-712 domain parameters
 * 
 * This is the most reliable way to get the correct domain, as it reads
 * directly from the contract rather than relying on hardcoded values.
 * 
 * @param tokenAddress The USDC token address
 * @param chainId The chain ID
 * @param provider Ethers provider
 * @returns The EIP-712 domain parameters
 */
export async function getUSDCDomain(
	tokenAddress: string,
	chainId: number,
	provider: ethers.Provider,
): Promise<EIP712Domain> {
	const contract = new ethers.Contract(tokenAddress, TOKEN_METADATA_ABI, provider);

	try {
		// Try to query the contract directly
		const name = await contract.name();
		const version = await contract.version();

		return {
			name,
			version,
			chainId,
			verifyingContract: tokenAddress,
		};
	} catch (error) {
		// Fallback to known domains
		console.warn(
			`Failed to query USDC domain from contract on chain ${chainId}, using fallback`,
			error,
		);
		
		const known = KNOWN_USDC_DOMAINS[chainId];
		if (!known) {
			throw new Error(
				`Unknown USDC domain for chain ${chainId} and failed to query contract`,
			);
		}

		return {
			name: known.name,
			version: known.version,
			chainId,
			verifyingContract: tokenAddress,
		};
	}
}

/**
 * Get USDC domain from cache (synchronous)
 * 
 * Only use this if you've already queried the domain using getUSDCDomain()
 * or if you're certain the chain is in KNOWN_USDC_DOMAINS.
 * 
 * @param tokenAddress The USDC token address
 * @param chainId The chain ID
 * @returns The EIP-712 domain parameters
 */
export function getKnownUSDCDomain(
	tokenAddress: string,
	chainId: number,
): EIP712Domain {
	const known = KNOWN_USDC_DOMAINS[chainId];
	if (!known) {
		throw new Error(
			`Unknown USDC domain for chain ${chainId}. Use getUSDCDomain() to query the contract.`,
		);
	}

	return {
		name: known.name,
		version: known.version,
		chainId,
		verifyingContract: tokenAddress,
	};
}

/**
 * Cache for queried USDC domains to avoid repeated RPC calls
 */
const domainCache = new Map<string, EIP712Domain>();

/**
 * Get USDC domain with caching
 * 
 * @param tokenAddress The USDC token address
 * @param chainId The chain ID
 * @param provider Ethers provider
 * @returns The EIP-712 domain parameters
 */
export async function getCachedUSDCDomain(
	tokenAddress: string,
	chainId: number,
	provider: ethers.Provider,
): Promise<EIP712Domain> {
	const cacheKey = `${chainId}-${tokenAddress.toLowerCase()}`;
	
	if (domainCache.has(cacheKey)) {
		return domainCache.get(cacheKey)!;
	}

	const domain = await getUSDCDomain(tokenAddress, chainId, provider);
	domainCache.set(cacheKey, domain);
	
	return domain;
}

