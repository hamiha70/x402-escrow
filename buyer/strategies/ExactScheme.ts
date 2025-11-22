/**
 * Exact Scheme Strategy - Synchronous Settlement
 * 
 * Implements x402-exact scheme payment payload creation.
 * Wraps the current exact payment logic.
 */

import { createLogger } from "../../shared/logger.js";
import {
	generateNonce,
	paymentIntentToTransferAuth,
	signTransferAuthorizationWithProvider,
	signX402PaymentIntent,
} from "../../shared/eip712.js";
import type { PaymentRequirements, PaymentPayload, X402PaymentIntent } from "../../shared/types.js";
import type { SchemeStrategy } from "./SchemeStrategy.js";
import type { ethers } from "ethers";

const logger = createLogger("buyer:exact-scheme");

export class ExactScheme implements SchemeStrategy {
	async createPayload(
		requirements: PaymentRequirements,
		wallet: ethers.Wallet,
		provider: ethers.Provider
	): Promise<PaymentPayload> {
		const nonce = generateNonce();
		const expiry = Math.floor(Date.now() / 1000) + 180; // 3 minutes
		const amountRaw = String(Number(requirements.amount) * 10 ** requirements.decimals);

		// Create x402 Payment Intent (HTTP layer)
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

		logger.info("Signing x402 PaymentIntent (HTTP layer, resource binding)...");
		const x402Signature = await signX402PaymentIntent(intent, requirements.chainId, wallet);
		logger.success("✓ Signed x402 payment intent with resource binding");

		// Convert to EIP-3009 format
		const transferAuth = paymentIntentToTransferAuth({
			...intent,
			validAfter: 0,
		});

		logger.info("Signing EIP-3009 TransferWithAuthorization (settlement layer)...");
		logger.info("Querying USDC contract for EIP-712 domain...");
		const eip3009Signature = await signTransferAuthorizationWithProvider(
			transferAuth,
			requirements.tokenAddress,
			requirements.chainId,
			wallet,
			provider,
		);
		logger.success("✓ Signed EIP-3009 authorization (NO APPROVAL NEEDED!)");

		const payload: PaymentPayload = {
			scheme: "intent",
			data: {
				intent,
				x402Signature,
				transferAuth,
				eip3009Signature,
			},
		};

		return payload;
	}

	async checkPreconditions(
		requirements: PaymentRequirements,
		wallet: ethers.Wallet,
		provider: ethers.Provider
	): Promise<{ ready: boolean; action?: string }> {
		// For exact scheme, just check balance
		const ERC20_ABI = [
			"function balanceOf(address account) view returns (uint256)",
			"function decimals() view returns (uint8)",
		];

		const usdcContract = new ethers.Contract(requirements.tokenAddress, ERC20_ABI, provider);
		const balance = await usdcContract.balanceOf(wallet.address);
		const decimals = await usdcContract.decimals();
		const amountRaw = BigInt(Number(requirements.amount) * 10 ** requirements.decimals);

		if (balance < amountRaw) {
			return {
				ready: false,
				action: `Insufficient balance. Has: ${ethers.formatUnits(balance, decimals)}, needs: ${requirements.amount}`,
			};
		}

		return { ready: true };
	}
}

