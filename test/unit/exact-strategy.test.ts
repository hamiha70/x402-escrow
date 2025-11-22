/**
 * Unit tests for ExactStrategy (Seller)
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import { ExactStrategy } from "../../seller/strategies/ExactStrategy.js";
import type { ChainConfig } from "../../seller/server.js";

describe("ExactStrategy (Seller)", () => {
	const SELLER_ADDRESS = "0x1234567890123456789012345678901234567890";
	const FACILITATOR_URL = "http://localhost:4023";
	const PAYMENT_AMOUNT_DISPLAY = "0.01";
	const PAYMENT_AMOUNT_RAW = "10000";
	const USDC_DECIMALS = 6;

	let strategy: ExactStrategy;

	beforeEach(() => {
		strategy = new ExactStrategy(
			SELLER_ADDRESS,
			FACILITATOR_URL,
			PAYMENT_AMOUNT_DISPLAY,
			PAYMENT_AMOUNT_RAW,
			USDC_DECIMALS
		);
	});

	describe("generatePaymentRequirements()", () => {
		const chainConfig: ChainConfig = {
			chainId: 84532,
			name: "Base Sepolia",
			networkSlug: "base-sepolia",
			rpc: "https://base-sepolia.example.com",
			usdc: "0xUSDC_BASE_SEPOLIA",
		};

		it("should generate correct payment requirements structure", () => {
			const resource = "/api/content/premium/base-sepolia";
			const requirements = strategy.generatePaymentRequirements(resource, chainConfig);

			expect(requirements).to.have.property("scheme", "x402-exact");
			expect(requirements).to.have.property("network", "base-sepolia");
			expect(requirements).to.have.property("token", "USDC");
			expect(requirements).to.have.property("tokenAddress", chainConfig.usdc);
			expect(requirements).to.have.property("amount", PAYMENT_AMOUNT_DISPLAY);
			expect(requirements).to.have.property("decimals", USDC_DECIMALS);
			expect(requirements).to.have.property("seller", SELLER_ADDRESS);
			expect(requirements).to.have.property("resource", resource);
			expect(requirements).to.have.property("facilitator", `${FACILITATOR_URL}/settle`);
			expect(requirements).to.have.property("chainId", chainConfig.chainId);
			expect(requirements).to.have.property("schemes").that.includes("x402-exact");
			expect(requirements).to.have.property("expiresAt");
		});

		it("should set expiresAt to ~5 minutes in the future", () => {
			const resource = "/api/content/premium/base-sepolia";
			const beforeCall = Math.floor(Date.now() / 1000);
			const requirements = strategy.generatePaymentRequirements(resource, chainConfig);
			const afterCall = Math.floor(Date.now() / 1000);

			const minExpiry = beforeCall + 295; // 5 min - 5s buffer
			const maxExpiry = afterCall + 305; // 5 min + 5s buffer

			expect(requirements.expiresAt).to.be.at.least(minExpiry);
			expect(requirements.expiresAt).to.be.at.most(maxExpiry);
		});

		it("should include facilitator URL with /settle endpoint", () => {
			const resource = "/api/content/premium/base-sepolia";
			const requirements = strategy.generatePaymentRequirements(resource, chainConfig);

			expect(requirements.facilitator).to.equal(`${FACILITATOR_URL}/settle`);
			expect(requirements.facilitator).to.match(/\/settle$/);
		});

		it("should match resource to requested endpoint", () => {
			const resource = "/api/content/premium/polygon-amoy";
			const requirements = strategy.generatePaymentRequirements(resource, chainConfig);

			expect(requirements.resource).to.equal(resource);
		});
	});

	describe("processPayment() - validation", () => {
		const chainConfig: ChainConfig = {
			chainId: 84532,
			name: "Base Sepolia",
			networkSlug: "base-sepolia",
			rpc: "https://base-sepolia.example.com",
			usdc: "0xUSDC_BASE_SEPOLIA",
		};

		it("should reject wrong scheme", async () => {
			const payload: any = {
				scheme: "x402-escrow-deferred",
				data: { intent: {}, x402Signature: "", transferAuth: {}, eip3009Signature: "" }
			};

			const result = await strategy.processPayment(payload, "/api/content/premium/base-sepolia", chainConfig);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
			expect(result.error).to.include("Invalid scheme");
		});

		it("should reject chain ID mismatch", async () => {
			const payload: any = {
				scheme: "x402-exact",
				data: {
					intent: {
						chainId: 99999, // Wrong chain
						resource: "/api/content/premium/base-sepolia",
						seller: SELLER_ADDRESS,
						token: chainConfig.usdc,
						amount: PAYMENT_AMOUNT_RAW,
					},
					x402Signature: "0x...",
					transferAuth: {},
					eip3009Signature: "0x..."
				}
			};

			const result = await strategy.processPayment(payload, "/api/content/premium/base-sepolia", chainConfig);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
			expect(result.error).to.include("wrong chain");
		});

		it("should reject resource mismatch", async () => {
			const payload: any = {
				scheme: "x402-exact",
				data: {
					intent: {
						chainId: chainConfig.chainId,
						resource: "/api/content/different", // Wrong resource
						seller: SELLER_ADDRESS,
						token: chainConfig.usdc,
						amount: PAYMENT_AMOUNT_RAW,
					},
					x402Signature: "0x...",
					transferAuth: {},
					eip3009Signature: "0x..."
				}
			};

			const result = await strategy.processPayment(payload, "/api/content/premium/base-sepolia", chainConfig);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
			expect(result.error).to.include("resource does not match");
		});

		it("should reject seller mismatch", async () => {
			const payload: any = {
				scheme: "x402-exact",
				data: {
					intent: {
						chainId: chainConfig.chainId,
						resource: "/api/content/premium/base-sepolia",
						seller: "0xWrongSeller",
						token: chainConfig.usdc,
						amount: PAYMENT_AMOUNT_RAW,
					},
					x402Signature: "0x...",
					transferAuth: {},
					eip3009Signature: "0x..."
				}
			};

			const result = await strategy.processPayment(payload, "/api/content/premium/base-sepolia", chainConfig);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
			expect(result.error).to.include("seller does not match");
		});

		it("should reject token address mismatch", async () => {
			const payload: any = {
				scheme: "x402-exact",
				data: {
					intent: {
						chainId: chainConfig.chainId,
						resource: "/api/content/premium/base-sepolia",
						seller: SELLER_ADDRESS,
						token: "0xWrongToken",
						amount: PAYMENT_AMOUNT_RAW,
					},
					x402Signature: "0x...",
					transferAuth: {},
					eip3009Signature: "0x..."
				}
			};

			const result = await strategy.processPayment(payload, "/api/content/premium/base-sepolia", chainConfig);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
			expect(result.error).to.include("Invalid USDC address");
		});

		it("should reject amount mismatch", async () => {
			const payload: any = {
				scheme: "x402-exact",
				data: {
					intent: {
						chainId: chainConfig.chainId,
						resource: "/api/content/premium/base-sepolia",
						seller: SELLER_ADDRESS,
						token: chainConfig.usdc,
						amount: "50000", // Wrong amount
					},
					x402Signature: "0x...",
					transferAuth: {},
					eip3009Signature: "0x..."
				}
			};

			const result = await strategy.processPayment(payload, "/api/content/premium/base-sepolia", chainConfig);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
			expect(result.error).to.include("Invalid payment amount");
		});
	});
});

