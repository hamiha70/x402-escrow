/**
 * Baseline tests for Seller server (x402-exact scheme)
 * 
 * These tests lock in current behavior before refactoring to strategy pattern.
 * They should continue passing after refactoring.
 */

import { expect } from "chai";
import axios from "axios";
import { describe, it, before, after } from "mocha";
import type { Express } from "express";
import type { Server } from "http";

// We'll need to import the seller server, but for now we'll test via HTTP
const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
const BASE_SEPOLIA_SLUG = "base-sepolia";

describe("Seller Server - x402-exact Baseline Tests", () => {
	let sellerServer: Server | null = null;

	before(async () => {
		// Note: In a real test setup, we'd start the server here
		// For now, we assume it's running externally
		// TODO: Add server lifecycle management
	});

	after(async () => {
		// Cleanup if we started server
	});

	describe("402 Payment Required Response", () => {
		it("should return 402 with correct PaymentRequirements for base-sepolia", async () => {
			const response = await axios.get(
				`${SELLER_URL}/api/content/premium/${BASE_SEPOLIA_SLUG}`,
				{ validateStatus: () => true } // Don't throw on 402
			);

			expect(response.status).to.equal(402);
			expect(response.data).to.have.property("error", "Payment required");
			expect(response.data).to.have.property("PaymentRequirements");
			expect(response.data.PaymentRequirements).to.be.an("array");
			expect(response.data.PaymentRequirements.length).to.be.greaterThan(0);

			const req = response.data.PaymentRequirements[0];
			
			// Verify exact scheme structure
			expect(req).to.have.property("network", BASE_SEPOLIA_SLUG);
			expect(req).to.have.property("token", "USDC");
			expect(req).to.have.property("tokenAddress");
			expect(req).to.have.property("amount");
			expect(req).to.have.property("decimals", 6);
			expect(req).to.have.property("seller");
			expect(req).to.have.property("resource", `/api/content/premium/${BASE_SEPOLIA_SLUG}`);
			expect(req).to.have.property("facilitator");
			expect(req).to.have.property("chainId", 84532); // Base Sepolia
			expect(req).to.have.property("schemes");
			expect(req.schemes).to.include("intent");
		});

		it("should return 402 with correct PaymentRequirements for polygon-amoy", async () => {
			const response = await axios.get(
				`${SELLER_URL}/api/content/premium/polygon-amoy`,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(402);
			const req = response.data.PaymentRequirements[0];
			expect(req).to.have.property("network", "polygon-amoy");
			expect(req).to.have.property("chainId", 80002);
			expect(req).to.have.property("resource", "/api/content/premium/polygon-amoy");
		});

		it("should include correct facilitator URL in requirements", async () => {
			const response = await axios.get(
				`${SELLER_URL}/api/content/premium/${BASE_SEPOLIA_SLUG}`,
				{ validateStatus: () => true }
			);

			const req = response.data.PaymentRequirements[0];
			expect(req.facilitator).to.match(/\/settle$/);
		});
	});

	describe("Payment Validation", () => {
		it("should reject request without x-payment header", async () => {
			const response = await axios.get(
				`${SELLER_URL}/api/content/premium/${BASE_SEPOLIA_SLUG}`,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(402);
		});

		it("should reject invalid payment payload format", async () => {
			const response = await axios.get(
				`${SELLER_URL}/api/content/premium/${BASE_SEPOLIA_SLUG}`,
				{
					headers: { "x-payment": "invalid json" },
					validateStatus: () => true
				}
			);

			expect(response.status).to.equal(400);
			expect(response.data).to.have.property("error");
		});

		it("should reject payment with wrong chain ID", async () => {
			// This test requires a valid-looking payload but with wrong chainId
			// We'll create a minimal invalid payload
			const invalidPayload = {
				scheme: "intent",
				data: {
					intent: {
						chainId: 99999, // Wrong chain
						seller: "0x0000000000000000000000000000000000000000",
						buyer: "0x0000000000000000000000000000000000000000",
						amount: "10000",
						token: "0x0000000000000000000000000000000000000000",
						nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
						expiry: Math.floor(Date.now() / 1000) + 300,
						resource: `/api/content/premium/${BASE_SEPOLIA_SLUG}`
					},
					x402Signature: "0x00",
					transferAuth: {},
					eip3009Signature: "0x00"
				}
			};

			const response = await axios.get(
				`${SELLER_URL}/api/content/premium/${BASE_SEPOLIA_SLUG}`,
				{
					headers: { "x-payment": JSON.stringify(invalidPayload) },
					validateStatus: () => true
				}
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.include("wrong chain");
		});
	});
});

