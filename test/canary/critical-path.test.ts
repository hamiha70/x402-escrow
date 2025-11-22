/**
 * Canary Test Suite - Critical Path Validation
 * 
 * Purpose: Fast smoke tests (<5s) to catch catastrophic failures early.
 * Run this BEFORE full test suite to save time on broken builds.
 * 
 * What to include:
 * - Module imports (syntax errors, missing deps)
 * - Critical type definitions (EIP-712 structure)
 * - Core utilities (signing, hashing)
 * - Configuration loading
 * 
 * What NOT to include:
 * - Network calls (HTTP, RPC)
 * - On-chain interactions
 * - E2E flows
 * - Anything >100ms per test
 */

import { expect } from "chai";
import { ethers } from "ethers";
import { PAYMENT_INTENT_TYPES } from "../../shared/types.js";
import type { PaymentIntent, PaymentRequirements } from "../../shared/types.js";
import { generateNonce } from "../../shared/eip712.js";
import { createLogger } from "../../shared/logger.js";

describe("🐤 Canary Suite - Critical Path", function () {
	this.timeout(5000); // Entire suite must complete in 5 seconds

	describe("Module Imports", function () {
		it("should import shared types without errors", function () {
			expect(PAYMENT_INTENT_TYPES).to.exist;
		});

		it("should import EIP-712 utilities without errors", function () {
			expect(generateNonce).to.be.a("function");
		});

		it("should import logger without errors", function () {
			const logger = createLogger("test");
			expect(logger).to.have.property("info");
			expect(logger).to.have.property("error");
			expect(logger).to.have.property("success");
		});
	});

	describe("EIP-712 Type Definition (CRITICAL)", function () {
		it("should have PaymentIntent with BUYER FIRST (not seller)", function () {
			// This is the CRITICAL bug we found!
			const fields = PAYMENT_INTENT_TYPES.PaymentIntent.map(f => f.name);
			expect(fields[0]).to.equal("buyer", "BUYER must be first field to match Vault.sol!");
			expect(fields[1]).to.equal("seller", "SELLER must be second field");
		});

		it("should have exactly 8 fields in PaymentIntent", function () {
			expect(PAYMENT_INTENT_TYPES.PaymentIntent).to.have.lengthOf(8);
		});

		it("should match Vault.sol field order exactly", function () {
			const expectedOrder = [
				"buyer", "seller", "amount", "token", 
				"nonce", "expiry", "resource", "chainId"
			];
			const actualOrder = PAYMENT_INTENT_TYPES.PaymentIntent.map(f => f.name);
			expect(actualOrder).to.deep.equal(expectedOrder);
		});
	});

	describe("Core Utilities", function () {
		it("should generate unique nonces", function () {
			const nonce1 = generateNonce();
			const nonce2 = generateNonce();
			
			expect(nonce1).to.be.a("string").with.lengthOf(66); // 0x + 64 hex
			expect(nonce1).to.not.equal(nonce2, "Nonces must be unique");
		});

		it("should create ethers wallet without network", function () {
			const wallet = ethers.Wallet.createRandom();
			expect(wallet.address).to.match(/^0x[a-fA-F0-9]{40}$/);
		});

		it("should sign typed data without provider", async function () {
			const wallet = ethers.Wallet.createRandom();
			const domain = {
				name: "Test",
				version: "1",
				chainId: 1,
				verifyingContract: "0x" + "1".repeat(40),
			};
			const types = { Message: [{ name: "content", type: "string" }] };
			const value = { content: "test" };
			
			const signature = await wallet.signTypedData(domain, types, value);
			expect(signature).to.be.a("string").with.lengthOf(132);
		});
	});

	describe("TypeScript Interfaces", function () {
		it("should construct PaymentIntent without errors", function () {
			const intent: PaymentIntent = {
				buyer: "0x" + "1".repeat(40),
				seller: "0x" + "2".repeat(40),
				amount: "10000",
				token: "0x" + "3".repeat(40),
				nonce: "0x" + "4".repeat(64),
				expiry: 1234567890,
				resource: "/test",
				chainId: 1,
			};
			expect(intent.buyer).to.equal("0x" + "1".repeat(40));
		});

		it("should construct PaymentRequirements without errors", function () {
			const reqs: PaymentRequirements = {
				scheme: "x402-exact",
				network: "test",
				token: "USDC",
				tokenAddress: "0x" + "1".repeat(40),
				amount: "0.01",
				decimals: 6,
				seller: "0x" + "2".repeat(40),
				resource: "/test",
				facilitator: "http://localhost:4023/settle",
				chainId: 1,
				schemes: ["x402-exact"],
			};
			expect(reqs.scheme).to.equal("x402-exact");
		});
	});

	describe("Environment Awareness", function () {
		it("should detect if dotenv is loaded", function () {
			// If .env is loaded, process.env should have our variables
			// This is not a hard requirement for canary, just awareness
			const hasEnv = !!process.env.SELLER_WALLET_ADDRESS;
			expect(hasEnv).to.be.a("boolean");
		});
	});
});

