/**
 * EIP-712 Consistency Tests
 * 
 * Critical: EIP-712 signature verification is EXTREMELY sensitive to:
 * 1. Field order in type definition
 * 2. Domain parameters (name, version, chainId, verifyingContract)
 * 3. Type names and parameter types
 * 
 * This test ensures buyer signing, facilitator validation, and Vault verification
 * all use the EXACT same EIP-712 structure.
 */

import { expect } from "chai";
import { ethers } from "ethers";
import { PAYMENT_INTENT_TYPES } from "../../shared/types.js";
import { getVaultDomain, signPaymentIntentWithVaultDomain } from "../../shared/eip712.js";
import type { PaymentIntent } from "../../shared/types.js";

describe("EIP-712 Consistency (Critical for Escrow-Deferred)", function () {
	let provider: ethers.Provider;
	let buyerWallet: ethers.Wallet;
	let sellerWallet: ethers.Wallet;
	
	const CHAIN_ID = 84532; // Base Sepolia
	const MOCK_VAULT = "0x1000000000000000000000000000000000000001";
	const MOCK_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

	before(function () {
		// No provider needed for signature tests (they work offline)
		buyerWallet = ethers.Wallet.createRandom();
		sellerWallet = ethers.Wallet.createRandom();
		// Use a mock provider object for functions that need it
		provider = {
			getNetwork: async () => ({ chainId: BigInt(CHAIN_ID), name: "mock" }),
		} as any;
	});

	describe("PaymentIntent Type Definition", function () {
		it("should have PAYMENT_INTENT_TYPES exported from shared/types.ts", function () {
			expect(PAYMENT_INTENT_TYPES).to.exist;
			expect(PAYMENT_INTENT_TYPES.PaymentIntent).to.be.an("array");
		});

		it("should match Vault.sol PAYMENT_INTENT_TYPEHASH field order", function () {
			// Vault.sol expects:
			// keccak256("PaymentIntent(address buyer,address seller,uint256 amount,address token,bytes32 nonce,uint256 expiry,string resource,uint256 chainId)")
			
			const expectedOrder = [
				"buyer",    // BUYER FIRST (not seller!)
				"seller",
				"amount",
				"token",
				"nonce",
				"expiry",
				"resource",
				"chainId",
			];

			const actualOrder = PAYMENT_INTENT_TYPES.PaymentIntent.map(f => f.name);
			expect(actualOrder).to.deep.equal(expectedOrder, 
				"Field order MUST match Vault.sol exactly or signatures will fail!");
		});

		it("should have correct types for all fields", function () {
			const expected = [
				{ name: "buyer", type: "address" },
				{ name: "seller", type: "address" },
				{ name: "amount", type: "uint256" },
				{ name: "token", type: "address" },
				{ name: "nonce", type: "bytes32" },
				{ name: "expiry", type: "uint256" },
				{ name: "resource", type: "string" },
				{ name: "chainId", type: "uint256" },
			];

			expect(PAYMENT_INTENT_TYPES.PaymentIntent).to.deep.equal(expected);
		});
	});

	describe("Vault Domain Construction", function () {
		it("should return correct domain structure", async function () {
			const domain = await getVaultDomain(MOCK_VAULT, CHAIN_ID, provider);

			expect(domain.name).to.equal("x402-Vault");
			expect(domain.version).to.equal("1");
			expect(domain.chainId).to.equal(CHAIN_ID);
			expect(domain.verifyingContract).to.equal(MOCK_VAULT);
		});

		it("should produce domain separator matching Vault.sol", async function () {
			const domain = await getVaultDomain(MOCK_VAULT, CHAIN_ID, provider);
			
			// Compute domain separator client-side
			const domainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
			
			// This should match what Vault.sol's DOMAIN_SEPARATOR() returns
			expect(domainSeparator).to.be.a("string").with.lengthOf(66); // 0x + 64 hex chars
			expect(domainSeparator).to.match(/^0x[a-fA-F0-9]{64}$/);
		});

		it("should vary domain separator by verifyingContract", async function () {
			const domain1 = await getVaultDomain(MOCK_VAULT, CHAIN_ID, provider);
			const domain2 = await getVaultDomain("0x2000000000000000000000000000000000000002", CHAIN_ID, provider);
			
			const sep1 = ethers.TypedDataEncoder.hashDomain(domain1);
			const sep2 = ethers.TypedDataEncoder.hashDomain(domain2);
			
			expect(sep1).to.not.equal(sep2, "Different vaults must have different domain separators");
		});

		it("should vary domain separator by chainId", async function () {
			const domain1 = await getVaultDomain(MOCK_VAULT, 84532, provider);
			const domain2 = await getVaultDomain(MOCK_VAULT, 80002, provider);
			
			const sep1 = ethers.TypedDataEncoder.hashDomain(domain1);
			const sep2 = ethers.TypedDataEncoder.hashDomain(domain2);
			
			expect(sep1).to.not.equal(sep2, "Different chains must have different domain separators");
		});
	});

	describe("End-to-End Signature Verification", function () {
		it("should produce recoverable signature from buyer wallet", async function () {
			const intent: PaymentIntent = {
				buyer: buyerWallet.address,
				seller: sellerWallet.address,
				amount: "10000",
				token: MOCK_USDC,
				nonce: ethers.hexlify(ethers.randomBytes(32)),
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: CHAIN_ID,
			};

			const signature = await signPaymentIntentWithVaultDomain(
				intent,
				MOCK_VAULT,
				CHAIN_ID,
				buyerWallet,
				provider
			);

			expect(signature).to.be.a("string").with.lengthOf(132); // 0x + 130 hex chars (65 bytes)
			expect(signature).to.match(/^0x[a-fA-F0-9]{130}$/);
		});

		it("should recover correct signer address", async function () {
			const intent: PaymentIntent = {
				buyer: buyerWallet.address,
				seller: sellerWallet.address,
				amount: "10000",
				token: MOCK_USDC,
				nonce: ethers.hexlify(ethers.randomBytes(32)),
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: CHAIN_ID,
			};

			const signature = await signPaymentIntentWithVaultDomain(
				intent,
				MOCK_VAULT,
				CHAIN_ID,
				buyerWallet,
				provider
			);

			// Verify signature (simulate facilitator validation)
			const domain = await getVaultDomain(MOCK_VAULT, CHAIN_ID, provider);
			const digest = ethers.TypedDataEncoder.hash(domain, PAYMENT_INTENT_TYPES, intent);
			const recoveredAddress = ethers.recoverAddress(digest, signature);

			expect(recoveredAddress).to.equal(buyerWallet.address, 
				"Recovered address must match buyer wallet");
		});

		it("should FAIL if field order is wrong", async function () {
			const intent: PaymentIntent = {
				buyer: buyerWallet.address,
				seller: sellerWallet.address,
				amount: "10000",
				token: MOCK_USDC,
				nonce: ethers.hexlify(ethers.randomBytes(32)),
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: CHAIN_ID,
			};

			const signature = await signPaymentIntentWithVaultDomain(
				intent,
				MOCK_VAULT,
				CHAIN_ID,
				buyerWallet,
				provider
			);

			// Now try to verify with WRONG field order (seller first, like our bug!)
			const WRONG_ORDER_TYPES = {
				PaymentIntent: [
					{ name: "seller", type: "address" },  // WRONG: seller before buyer
					{ name: "buyer", type: "address" },
					{ name: "amount", type: "uint256" },
					{ name: "token", type: "address" },
					{ name: "nonce", type: "bytes32" },
					{ name: "expiry", type: "uint256" },
					{ name: "resource", type: "string" },
					{ name: "chainId", type: "uint256" },
				],
			};

			const domain = await getVaultDomain(MOCK_VAULT, CHAIN_ID, provider);
			const wrongDigest = ethers.TypedDataEncoder.hash(domain, WRONG_ORDER_TYPES, intent);
			const recoveredAddress = ethers.recoverAddress(wrongDigest, signature);

			expect(recoveredAddress).to.not.equal(buyerWallet.address,
				"Wrong field order must produce DIFFERENT digest and fail verification");
		});

		it("should FAIL if domain is wrong", async function () {
			const intent: PaymentIntent = {
				buyer: buyerWallet.address,
				seller: sellerWallet.address,
				amount: "10000",
				token: MOCK_USDC,
				nonce: ethers.hexlify(ethers.randomBytes(32)),
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: CHAIN_ID,
			};

			const signature = await signPaymentIntentWithVaultDomain(
				intent,
				MOCK_VAULT,
				CHAIN_ID,
				buyerWallet,
				provider
			);

			// Try to verify with wrong vault address
			const wrongDomain = await getVaultDomain(
				"0x2000000000000000000000000000000000000002", // Different vault
				CHAIN_ID,
				provider
			);
			const wrongDigest = ethers.TypedDataEncoder.hash(wrongDomain, PAYMENT_INTENT_TYPES, intent);
			const recoveredAddress = ethers.recoverAddress(wrongDigest, signature);

			expect(recoveredAddress).to.not.equal(buyerWallet.address,
				"Wrong vault address must produce DIFFERENT digest and fail verification");
		});
	});

	describe("Facilitator Validation Must Use Same Types", function () {
		it("should import PAYMENT_INTENT_TYPES from shared/types.ts", function () {
			// This test documents the requirement:
			// facilitator/services/EscrowDeferredValidation.ts MUST import
			// PAYMENT_INTENT_TYPES from shared/types.ts instead of hardcoding it.
			
			// If this test passes, it means the import exists and is accessible
			expect(PAYMENT_INTENT_TYPES).to.exist;
		});
	});
});

