/**
 * Exact Strategy - Synchronous Settlement
 * 
 * Implements x402-exact scheme with immediate on-chain settlement.
 * Wraps the current exact payment logic.
 */

import axios from "axios";
import { createLogger } from "../../shared/logger.js";
import type {
	PaymentRequirements,
	PaymentPayload,
	PaymentResponse,
	PaymentContext
} from "../../shared/types.js";
import type { PaymentStrategy, StrategyValidationResult } from "./PaymentStrategy.js";

const logger = createLogger("seller:exact-strategy");

export class ExactStrategy implements PaymentStrategy {
	scheme = "x402-exact";

	constructor(
		private facilitatorUrl: string,
		private paymentAmountDisplay: string,
		private paymentAmountRaw: string,
		private usdcDecimals: number
	) {}

	generateRequirements(resource: string, context: PaymentContext): PaymentRequirements {
		return {
			scheme: "intent", // For backwards compatibility with existing clients
			network: context.chainSlug,
			token: "USDC",
			tokenAddress: context.token,
			amount: this.paymentAmountDisplay,
			decimals: this.usdcDecimals,
			seller: context.seller,
			resource,
			facilitator: `${this.facilitatorUrl}/settle`,
			chainId: context.chainId,
			schemes: ["intent"],
			expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes
		};
	}

	async validatePayment(
		payload: PaymentPayload,
		requirements: PaymentRequirements,
		context: PaymentContext
	): Promise<StrategyValidationResult> {
		// Validate basic fields match
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

		// Forward to facilitator for settlement (synchronous)
		logger.info(`Forwarding payment to facilitator: ${this.facilitatorUrl}/settle`);

		try {
			const response = await axios.post(`${this.facilitatorUrl}/settle`, payload, {
				headers: { "Content-Type": "application/json" },
				timeout: 30000, // 30s timeout (settlement can take time)
			});

			const paymentResponse = response.data as PaymentResponse;

			if (paymentResponse.status !== "settled") {
				return {
					valid: false,
					error: paymentResponse.error || "Payment settlement failed",
				};
			}

			return {
				valid: true,
				receipt: paymentResponse,
			};
		} catch (error: any) {
			if (error.response) {
				logger.error(`Facilitator error: ${error.response.status}`);
				return {
					valid: false,
					error: error.response.data?.error || "Payment processing failed",
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
		return true; // Synchronous settlement
	}
}

