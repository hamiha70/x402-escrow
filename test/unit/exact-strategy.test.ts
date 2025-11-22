/**
 * Unit tests for ExactStrategy (Seller)
 * 
 * Tests the exact scheme strategy implementation.
 * Focus: API contract, validation logic (not full E2E settlement).
 */

import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { ExactStrategy } from "../../seller/strategies/ExactStrategy.js";
import type { PaymentContext, PaymentPayload, PaymentRequirements } from "../../shared/types.js";

describe("ExactStrategy (Seller)", () => {
	const FACILITATOR_URL = "http://localhost:4023";
	const PAYMENT_AMOUNT_DISPLAY = "0.01";
	const PAYMENT_AMOUNT_RAW = "10000";
	const USDC_DECIMALS = 6;

	let strategy: ExactStrategy;

	beforeEach(() => {
		strategy = new ExactStrategy(
			FACILITATOR_URL,
			PAYMENT_AMOUNT_DISPLAY,
			PAYMENT_AMOUNT_RAW,
			USDC_DECIMALS
		);
	});

	describe("scheme property", () => {
		it("should identify as x402-exact", () => {
			expect(strategy.scheme).to.equal("x402-exact");
		});
	});

	describe("generateRequirements()", () => {
		const context: PaymentContext = {
			scheme: "x402-exact",
			chainId: 84532,
			chainSlug: "base-sepolia",
			seller: "0x1234567890123456789012345678901234567890",
			token: "0xUSDC_BASE_SEPOLIA",
		};

		it("should generate correct payment requirements structure", () => {
			const resource = "/api/content/premium/base-sepolia";
			const requirements = strategy.generateRequirements(resource, context);

			expect(requirements).to.have.property("scheme", "intent"); // Backwards compat
			expect(requirements).to.have.property("network", "base-sepolia");
			expect(requirements).to.have.property("token", "USDC");
			expect(requirements).to.have.property("tokenAddress", context.token);
			expect(requirements).to.have.property("amount", PAYMENT_AMOUNT_DISPLAY);
			expect(requirements).to.have.property("decimals", USDC_DECIMALS);
			expect(requirements).to.have.property("seller", context.seller);
			expect(requirements).to.have.property("resource", resource);
			expect(requirements).to.have.property("facilitator");
			expect(requirements).to.have.property("chainId", context.chainId);
			expect(requirements).to.have.property("schemes").that.includes("intent");
			expect(requirements).to.have.property("expiresAt");
		});

		it("should set expiresAt to ~5 minutes in the future", () => {
			const resource = "/api/content/premium/base-sepolia";
			const beforeCall = Math.floor(Date.now() / 1000);
			const requirements = strategy.generateRequirements(resource, context);
			const afterCall = Math.floor(Date.now() / 1000);

			const minExpiry = beforeCall + 295; // 5 min - 5s buffer
			const maxExpiry = afterCall + 305; // 5 min + 5s buffer

			expect(requirements.expiresAt).to.be.at.least(minExpiry);
			expect(requirements.expiresAt).to.be.at.most(maxExpiry);
		});

		it("should include facilitator URL with /settle endpoint", () => {
			const resource = "/api/content/premium/base-sepolia";
			const requirements = strategy.generateRequirements(resource, context);

			expect(requirements.facilitator).to.equal(`${FACILITATOR_URL}/settle`);
			expect(requirements.facilitator).to.match(/\/settle$/);
		});

		it("should match resource to requested endpoint", () => {
			const resource = "/api/content/premium/polygon-amoy";
			const requirements = strategy.generateRequirements(resource, context);

			expect(requirements.resource).to.equal(resource);
		});
	});

	describe("shouldSettleImmediately()", () => {
		it("should return true for exact scheme (synchronous settlement)", () => {
			expect(strategy.shouldSettleImmediately()).to.be.true;
		});
	});

	describe("validatePayment() - basic validation", () => {
		const context: PaymentContext = {
			scheme: "x402-exact",
			chainId: 84532,
			chainSlug: "base-sepolia",
			seller: "0x1234567890123456789012345678901234567890",
			token: "0xUSDC_BASE_SEPOLIA",
		};

		const requirements: PaymentRequirements = {
			scheme: "intent",
			network: "base-sepolia",
			token: "USDC",
			tokenAddress: context.token,
			amount: PAYMENT_AMOUNT_DISPLAY,
			decimals: USDC_DECIMALS,
			seller: context.seller,
			resource: "/api/content/premium/base-sepolia",
			facilitator: `${FACILITATOR_URL}/settle`,
			chainId: context.chainId,
			schemes: ["intent"],
			expiresAt: Math.floor(Date.now() / 1000) + 300,
		};

		it("should reject wrong scheme in payload", async () => {
			const payload: PaymentPayload = {
				scheme: "x402-escrow-deferred", // Wrong scheme
				data: {
					intent: {
						seller: context.seller,
						buyer: "0xBuyer",
						amount: PAYMENT_AMOUNT_RAW,
						token: context.token,
						nonce: "0x123",
						expiry: requirements.expiresAt,
						resource: requirements.resource,
						chainId: context.chainId,
					},
					x402Signature: "0x...",
					transferAuth: {} as any,
					eip3009Signature: "0x...",
				},
			};

			const result = await strategy.validatePayment(payload, requirements, context);

			expect(result.valid).to.be.false;
			expect(result.error).to.exist;
		});

		it("should reject chain ID mismatch", async () => {
			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent: {
						seller: context.seller,
						buyer: "0xBuyer",
						amount: PAYMENT_AMOUNT_RAW,
						token: context.token,
						nonce: "0x123",
						expiry: requirements.expiresAt,
						resource: requirements.resource,
						chainId: 99999, // Wrong chain
					},
					x402Signature: "0x...",
					transferAuth: {} as any,
					eip3009Signature: "0x...",
				},
			};

			const result = await strategy.validatePayment(payload, requirements, context);

			expect(result.valid).to.be.false;
			expect(result.error).to.include("chain");
		});

		it("should reject resource mismatch", async () => {
			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent: {
						seller: context.seller,
						buyer: "0xBuyer",
						amount: PAYMENT_AMOUNT_RAW,
						token: context.token,
						nonce: "0x123",
						expiry: requirements.expiresAt,
						resource: "/different/resource", // Wrong resource
						chainId: context.chainId,
					},
					x402Signature: "0x...",
					transferAuth: {} as any,
					eip3009Signature: "0x...",
				},
			};

			const result = await strategy.validatePayment(payload, requirements, context);

			expect(result.valid).to.be.false;
			expect(result.error).to.include("resource");
		});

		it("should reject seller mismatch", async () => {
			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent: {
						seller: "0xWrongSeller",
						buyer: "0xBuyer",
						amount: PAYMENT_AMOUNT_RAW,
						token: context.token,
						nonce: "0x123",
						expiry: requirements.expiresAt,
						resource: requirements.resource,
						chainId: context.chainId,
					},
					x402Signature: "0x...",
					transferAuth: {} as any,
					eip3009Signature: "0x...",
				},
			};

			const result = await strategy.validatePayment(payload, requirements, context);

			expect(result.valid).to.be.false;
			expect(result.error).to.include("seller");
		});

		it("should reject amount mismatch", async () => {
			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent: {
						seller: context.seller,
						buyer: "0xBuyer",
						amount: "50000", // Wrong amount
						token: context.token,
						nonce: "0x123",
						expiry: requirements.expiresAt,
						resource: requirements.resource,
						chainId: context.chainId,
					},
					x402Signature: "0x...",
					transferAuth: {} as any,
					eip3009Signature: "0x...",
				},
			};

			const result = await strategy.validatePayment(payload, requirements, context);

			expect(result.valid).to.be.false;
			expect(result.error).to.include("amount");
		});
	});

	// Note: Full settlement validation requires mocking axios/facilitator
	// That's covered by E2E tests. These unit tests focus on API contract.
});
