/**
 * Escrow-Deferred Scheme Strategy - Deferred Settlement
 * 
 * Implements x402-escrow-deferred scheme payment payload creation.
 * Requires vault deposit before creating payment intent.
 */

import { ethers } from "ethers";
import { createLogger } from "../../shared/logger.js";
import { generateNonce, signPaymentIntentWithVaultDomain } from "../../shared/eip712.js";
import type { PaymentRequirements, PaymentPayload, X402PaymentIntent } from "../../shared/types.js";
import type { SchemeStrategy } from "./SchemeStrategy.js";
import { PAYMENT_INTENT_TYPES } from "../../shared/types.js";

const logger = createLogger("buyer:escrow-deferred-scheme");

// Vault ABI for deposit and balance checks
const VAULT_ABI = [
	"function deposit(uint256 amount) external",
	"function deposits(address) view returns (uint256)",
	"function DOMAIN_SEPARATOR() view returns (bytes32)",
];

export class EscrowDeferredScheme implements SchemeStrategy {
	async createPayload(
		requirements: PaymentRequirements,
		wallet: ethers.Wallet,
		provider: ethers.Provider
	): Promise<PaymentPayload> {
		if (!requirements.vault) {
			throw new Error("Vault address required for escrow-deferred scheme");
		}

		const nonce = generateNonce();
		const expiry = Math.floor(Date.now() / 1000) + 180; // 3 minutes
		const amountRaw = String(Number(requirements.amount) * 10 ** requirements.decimals);

		// Create Payment Intent (signed with vault domain, not x402 domain)
		const intent: X402PaymentIntent = {
			seller: requirements.seller,
			buyer: wallet.address,
			amount: amountRaw,
			token: requirements.tokenAddress,
			nonce,
			expiry,
			resource: requirements.resource,
			chainId: requirements.chainId,
		};

		logger.info("Signing PaymentIntent with vault domain (escrow-deferred)...");
		
		// Sign with vault's EIP-712 domain
		const vaultContract = new ethers.Contract(requirements.vault, VAULT_ABI, provider);
		const signature = await signPaymentIntentWithVaultDomain(
			intent,
			requirements.vault,
			requirements.chainId,
			wallet,
			provider
		);
		
		logger.success("✓ Signed payment intent with vault domain");

		// For escrow-deferred, we only need one signature (vault domain)
		// No EIP-3009 signature needed since settlement is deferred
		const payload: PaymentPayload = {
			scheme: "x402-escrow-deferred", // Use explicit scheme
			data: {
				intent,
				x402Signature: signature, // Actually vault-domain signature
				transferAuth: {
					from: wallet.address,
					to: requirements.seller,
					value: amountRaw,
					validAfter: 0,
					validBefore: expiry,
					nonce,
				},
				eip3009Signature: "0x", // Not used for escrow-deferred
			},
		};

		return payload;
	}

	async checkPreconditions(
		requirements: PaymentRequirements,
		wallet: ethers.Wallet,
		provider: ethers.Provider
	): Promise<{ ready: boolean; action?: string }> {
		if (!requirements.vault) {
			return {
				ready: false,
				action: "Vault address not provided in requirements",
			};
		}

		// Use chain-specific RPC based on requirements.chainId
		const chainRpcMap: Record<number, string | undefined> = {
			84532: process.env.BASE_SEPOLIA_RPC,
			80002: process.env.POLYGON_AMOY_RPC,
			421614: process.env.ARBITRUM_SEPOLIA_RPC,
			11155420: process.env.OPTIMISM_SEPOLIA_RPC,
			1243: process.env.ARC_TESTNET_RPC,
			11155111: process.env.ETHEREUM_SEPOLIA_RPC,
		};

		const chainRpc = chainRpcMap[requirements.chainId];
		if (!chainRpc) {
			return {
				ready: false,
				action: `No RPC configured for chain ID ${requirements.chainId}`,
			};
		}

		const chainProvider = new ethers.JsonRpcProvider(chainRpc);
		const vaultContract = new ethers.Contract(requirements.vault, VAULT_ABI, chainProvider);
		const depositBalance = await vaultContract.deposits(wallet.address);
		const amountRaw = BigInt(Number(requirements.amount) * 10 ** requirements.decimals);

		if (depositBalance < amountRaw) {
			const ERC20_ABI = ["function approve(address spender, uint256 amount) external returns (bool)"];
			const tokenContract = new ethers.Contract(requirements.tokenAddress, ERC20_ABI, wallet);
			const needed = amountRaw - depositBalance;

			return {
				ready: false,
				action: `Insufficient vault deposit. Has: ${ethers.formatUnits(depositBalance, requirements.decimals)}, needs: ${requirements.amount}. Approve and deposit required.`,
			};
		}

		return { ready: true };
	}
}

