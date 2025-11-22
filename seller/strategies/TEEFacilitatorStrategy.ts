/**
 * TEE Facilitator Strategy
 * 
 * Payment strategy for x402-tee-facilitator scheme.
 * Returns payment requirements with TEE facilitator endpoint and omnibus vault.
 */

import type {
	PaymentStrategy,
	PaymentRequirements,
	PaymentPayload,
	ValidationResult,
} from "../../shared/types.js";
import { createLogger } from "../../shared/logger.js";
import axios from "axios";

const logger = createLogger("seller:tee-strategy");

export class TEEFacilitatorStrategy implements PaymentStrategy {
	public readonly scheme = "x402-tee-facilitator";

	constructor(
		private sellerAddress: string,
		private facilitatorUrl: string,
		private getOmnibusVault: (chainId: number) => string,
		private getUsdcAddress: (chainId: number) => string
	) {}

	/**
	 * Generate payment requirements for TEE scheme
	 */
	public generateRequirements(
		resource: string,
		chainId: number
	): PaymentRequirements {
		const amount = "10000"; // 0.01 USDC (fixed for demo)

		return {
			scheme: this.scheme,
			amount,
			tokenAddress: this.getUsdcAddress(chainId),
			seller: this.sellerAddress,
			resource,
			facilitator: `${this.facilitatorUrl}/tee-settle`,
			vault: this.getOmnibusVault(chainId),
			attestation: `${this.facilitatorUrl}/attestation`,
			chainId,
			expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes
		};
	}

	/**
	 * Validate payment for TEE scheme
	 * 
	 * Forwards to TEE facilitator for verification and settlement.
	 */
	public async validatePayment(
		payload: PaymentPayload,
		requirements: PaymentRequirements
	): Promise<ValidationResult> {
		// Validate scheme
		if (payload.scheme !== this.scheme) {
			return {
				valid: false,
				error: `Wrong scheme: expected ${this.scheme}, got ${payload.scheme}`,
			};
		}

		// Validate payload structure
		if (!payload.data?.intentStruct || !payload.data?.signature) {
			return {
				valid: false,
				error: "Missing intentStruct or signature in payload",
			};
		}

		const { intentStruct, signature } = payload.data;

		// Validate intent fields match requirements
		if (intentStruct.seller !== requirements.seller) {
			return {
				valid: false,
				error: `Seller mismatch: expected ${requirements.seller}, got ${intentStruct.seller}`,
			};
		}

		if (intentStruct.amount !== requirements.amount) {
			return {
				valid: false,
				error: `Amount mismatch: expected ${requirements.amount}, got ${intentStruct.amount}`,
			};
		}

		if (intentStruct.resource !== requirements.resource) {
			return {
				valid: false,
				error: `Resource mismatch: expected ${requirements.resource}, got ${intentStruct.resource}`,
			};
		}

		if (intentStruct.chainId !== requirements.chainId) {
			return {
				valid: false,
				error: `Chain ID mismatch: expected ${requirements.chainId}, got ${intentStruct.chainId}`,
			};
		}

		// Forward to TEE facilitator for settlement
		logger.info(
			`Forwarding payment to TEE facilitator: ${requirements.facilitator}`
		);

		try {
			const response = await axios.post(requirements.facilitator, {
				intentStruct,
				signature,
			});

			logger.info(`TEE facilitator response: ${JSON.stringify(response.data)}`);

			return {
				valid: true,
				receipt: {
					scheme: this.scheme,
					status: "settled",
					txHash: response.data.txHash,
					intentHash: response.data.intentHash,
					newBalance: response.data.newBalance,
					seller: response.data.seller,
					amount: response.data.amount,
					chain: response.data.chain,
				},
			};
		} catch (error: any) {
			logger.error(`TEE facilitator error: ${error.response?.status}`);
			logger.error(`Error details: ${JSON.stringify(error.response?.data)}`);

			return {
				valid: false,
				error:
					error.response?.data?.error ||
					"Failed to reach TEE facilitator",
			};
		}
	}

	/**
	 * TEE scheme settles immediately (within TEE + on-chain withdrawal)
	 */
	public shouldSettleImmediately(): boolean {
		return true; // Synchronous settlement
	}
}

