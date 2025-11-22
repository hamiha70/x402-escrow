/**
 * Escrow-Deferred Strategy - Deferred Settlement
 * 
 * Implements x402-escrow-deferred scheme with deferred/batched settlement.
 * Content is delivered immediately after off-chain validation.
 */

import axios from "axios";
import { createLogger } from "../../shared/logger.js";
import type {
	PaymentRequirements,
	PaymentPayload,
	PaymentContext
} from "../../shared/types.js";
import type { PaymentStrategy, StrategyValidationResult } from "./PaymentStrategy.js";

const logger = createLogger("seller:escrow-deferred-strategy");

export class EscrowDeferredStrategy implements PaymentStrategy {
	scheme = "x402-escrow-deferred";

	constructor(
		private facilitatorUrl: string,
		private paymentAmountDisplay: string,
		private paymentAmountRaw: string,
		private usdcDecimals: number
	) {}

	generateRequirements(resource: string, context: PaymentContext): PaymentRequirements {
		if (!context.vault) {
			throw new Error("Vault address required for escrow-deferred scheme");
		}

		return {
			scheme: "x402-escrow-deferred",
			network: context.chainSlug,
			token: "USDC",
			tokenAddress: context.token,
			amount: this.paymentAmountDisplay,
			decimals: this.usdcDecimals,
			seller: context.seller,
			resource,
			facilitator: `${this.facilitatorUrl}/validate-intent`, // Different endpoint for deferred
			chainId: context.chainId,
			schemes: ["x402-escrow-deferred"],
			vault: context.vault,
			escrow: {
				type: "vault-pool",
				mode: "deferred",
			},
			expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes
		};
	}

	async validatePayment(
		payload: PaymentPayload,
		requirements: PaymentRequirements,
		context: PaymentContext
	): Promise<StrategyValidationResult> {
		// Basic validation
		if (payload.data.intent.chainId !== context.chainId) {
			return {
				valid: false,
				error: `Payment intent for wrong chain. Expected ${context.chainSlug} (${context.chainId})`,
			};
		}

		if (payload.data.intent.resource !== requirements.resource) {
			return {
				valid: false,
				error: "Payment intent resource does not match requested resource",
			};
		}

		if (payload.data.intent.seller.toLowerCase() !== context.seller.toLowerCase()) {
			return {
				valid: false,
				error: "Payment intent seller does not match this seller",
			};
		}

		if (payload.data.intent.token.toLowerCase() !== context.token.toLowerCase()) {
			return {
				valid: false,
				error: `Invalid USDC address for ${context.chainSlug}`,
			};
		}

		if (payload.data.intent.amount !== this.paymentAmountRaw) {
			return {
				valid: false,
				error: `Invalid payment amount. Expected ${this.paymentAmountDisplay} USDC`,
			};
		}

		// Forward to facilitator for validation (deferred - no immediate settlement)
		logger.info(`Forwarding payment intent to facilitator for validation: ${this.facilitatorUrl}/validate-intent`);

		try {
			const response = await axios.post(
				`${this.facilitatorUrl}/validate-intent`,
				{
					requirements,
					payload,
				},
				{
					headers: { "Content-Type": "application/json" },
					timeout: 10000, // 10s timeout (validation is fast)
				}
			);

			const receipt = response.data;

			if (receipt.status !== "pending") {
				return {
					valid: false,
					error: receipt.error || "Payment validation failed",
				};
			}

			return {
				valid: true,
				receipt: {
					scheme: "x402-escrow-deferred",
					status: "pending",
					mode: "deferred",
					intentNonce: payload.data.intent.nonce,
					seller: payload.data.intent.seller,
					buyer: payload.data.intent.buyer,
					amount: payload.data.intent.amount,
					token: payload.data.intent.token,
				},
			};
		} catch (error: any) {
			if (error.response) {
				logger.error(`Facilitator error: ${error.response.status}`);
				return {
					valid: false,
					error: error.response.data?.error || "Payment validation failed",
				};
			}
			logger.error(`Failed to reach facilitator: ${error.message}`);
			return {
				valid: false,
				error: "Facilitator unavailable",
			};
		}
	}

	shouldSettleImmediately(): boolean {
		return false; // Deferred settlement
	}
}

