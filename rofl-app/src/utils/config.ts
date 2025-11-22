/**
 * Chain configuration for ROFL app
 * Reads from environment variables injected by ROFL KMS
 */

export interface ChainConfig {
	chainId: number;
	name: string;
	rpc: string;
	usdc: string;
	omnibusVault: string;
}

export function getChainConfig(chainId: number): ChainConfig {
	const configs: Record<number, ChainConfig> = {
		84532: {
			chainId: 84532,
			name: "Base Sepolia",
			rpc: process.env.BASE_SEPOLIA_RPC!,
			usdc: process.env.USDC_BASE_SEPOLIA!,
			omnibusVault: process.env.OMNIBUS_VAULT_BASE_SEPOLIA!,
		},
		80002: {
			chainId: 80002,
			name: "Polygon Amoy",
			rpc: process.env.POLYGON_AMOY_RPC!,
			usdc: process.env.USDC_POLYGON_AMOY!,
			omnibusVault: process.env.OMNIBUS_VAULT_POLYGON_AMOY!,
		},
		421614: {
			chainId: 421614,
			name: "Arbitrum Sepolia",
			rpc: process.env.ARBITRUM_SEPOLIA_RPC!,
			usdc: process.env.USDC_ARBITRUM_SEPOLIA!,
			omnibusVault: process.env.OMNIBUS_VAULT_ARBITRUM_SEPOLIA!,
		},
		11155420: {
			chainId: 11155420,
			name: "Optimism Sepolia",
			rpc: process.env.OPTIMISM_SEPOLIA_RPC!,
			usdc: process.env.USDC_OPTIMISM_SEPOLIA!,
			omnibusVault: process.env.OMNIBUS_VAULT_OPTIMISM_SEPOLIA!,
		},
		5042002: {
			chainId: 5042002,
			name: "Arc Testnet",
			rpc: process.env.ARC_TESTNET_RPC!,
			usdc: process.env.USDC_ARC_TESTNET!,
			omnibusVault: process.env.OMNIBUS_VAULT_ARC_TESTNET!,
		},
	};

	const config = configs[chainId];
	if (!config) {
		throw new Error(`Chain ${chainId} not supported in ROFL app`);
	}

	return config;
}

export function getPrivateKey(chainId: number): string {
	const keys: Record<number, string> = {
		84532: process.env.TEE_FACILITATOR_PRIVATE_KEY_BASE!,
		80002: process.env.TEE_FACILITATOR_PRIVATE_KEY_POLYGON!,
		421614: process.env.TEE_FACILITATOR_PRIVATE_KEY_ARBITRUM!,
		11155420: process.env.TEE_FACILITATOR_PRIVATE_KEY_OPTIMISM!,
		5042002: process.env.TEE_FACILITATOR_PRIVATE_KEY_ARC!,
	};

	const key = keys[chainId];
	if (!key) {
		throw new Error(`No private key configured for chain ${chainId}`);
	}

	return key;
}

