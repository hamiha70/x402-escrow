/**
 * Network configuration for demo UI
 * Maps network slugs to chain configs
 */

import dotenv from "dotenv";

dotenv.config();

export interface NetworkConfig {
	chainId: number;
	name: string;
	slug: string;
	rpcUrl: string;
	usdcAddress: string;
	vaultAddress?: string;
	explorerUrl: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
	"polygon-amoy": {
		chainId: 80002,
		name: "Polygon Amoy",
		slug: "polygon-amoy",
		rpcUrl: process.env.POLYGON_AMOY_RPC!,
		usdcAddress: process.env.USDC_POLYGON_AMOY!,
		vaultAddress: process.env.VAULT_POLYGON_AMOY,
		explorerUrl: process.env.POLYGON_AMOY_EXPLORER!,
	},
	"base-sepolia": {
		chainId: 84532,
		name: "Base Sepolia",
		slug: "base-sepolia",
		rpcUrl: process.env.BASE_SEPOLIA_RPC!,
		usdcAddress: process.env.USDC_BASE_SEPOLIA!,
		vaultAddress: process.env.VAULT_BASE_SEPOLIA,
		explorerUrl: process.env.BASE_SEPOLIA_EXPLORER!,
	},
	"arbitrum-sepolia": {
		chainId: 421614,
		name: "Arbitrum Sepolia",
		slug: "arbitrum-sepolia",
		rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC!,
		usdcAddress: process.env.USDC_ARBITRUM_SEPOLIA!,
		vaultAddress: process.env.VAULT_ARBITRUM_SEPOLIA,
		explorerUrl: process.env.ARBITRUM_SEPOLIA_EXPLORER!,
	},
	"optimism-sepolia": {
		chainId: 11155420,
		name: "Optimism Sepolia",
		slug: "optimism-sepolia",
		rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC!,
		usdcAddress: process.env.USDC_OPTIMISM_SEPOLIA!,
		vaultAddress: process.env.VAULT_OPTIMISM_SEPOLIA,
		explorerUrl: process.env.OPTIMISM_SEPOLIA_EXPLORER!,
	},
	arc: {
		chainId: 5042002,
		name: "Arc Testnet",
		slug: "arc",
		rpcUrl: process.env.ARC_TESTNET_RPC!,
		usdcAddress: process.env.USDC_ARC_TESTNET!,
		vaultAddress: process.env.VAULT_ARC_TESTNET,
		explorerUrl: process.env.ARC_TESTNET_EXPLORER!,
	},
};

/**
 * Get network config by slug
 */
export function getNetworkConfig(slug: string): NetworkConfig {
	const config = NETWORKS[slug];
	if (!config) {
		throw new Error(
			`Network ${slug} not found. Available: ${Object.keys(NETWORKS).join(", ")}`
		);
	}
	return config;
}

/**
 * Get all available networks
 */
export function getAvailableNetworks(): NetworkConfig[] {
	return Object.values(NETWORKS).filter((n) => n.rpcUrl && n.usdcAddress);
}

