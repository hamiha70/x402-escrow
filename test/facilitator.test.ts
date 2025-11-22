/**
 * Baseline tests for Facilitator server (x402-exact scheme)
 * 
 * These tests lock in current validation and settlement behavior.
 * They should continue passing after refactoring to service modules.
 */

import { expect } from "chai";
import axios from "axios";
import { describe, it, before, after } from "mocha";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { generateNonce, signX402PaymentIntent, signTransferAuthorizationWithProvider, paymentIntentToTransferAuth } from "../shared/eip712.js";
import type { PaymentPayload, X402PaymentIntent } from "../shared/types.js";

dotenv.config();

const FACILITATOR_URL = process.env.FACILITATOR_URL || "http://localhost:4023";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const USDC_BASE_SEPOLIA = process.env.USDC_BASE_SEPOLIA;
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC;
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const SELLER_ADDRESS = process.env.SELLER_WALLET_ADDRESS;
const PAYMENT_AMOUNT_RAW = String(Number(process.env.PAYMENT_AMOUNT || "0.01") * 10 ** 6);

describe("Facilitator Server - x402-exact Baseline Tests", () => {
	let provider: ethers.JsonRpcProvider;
	let buyerWallet: ethers.Wallet;

	before(() => {
		if (!BASE_SEPOLIA_RPC || !BUYER_PRIVATE_KEY) {
			throw new Error("Missing required env vars: BASE_SEPOLIA_RPC, BUYER_PRIVATE_KEY");
		}
		provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
		buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);
	});

	describe("Payment Intent Validation", () => {
		it("should reject payload with missing required fields", async () => {
			const invalidPayload = {
				scheme: "intent",
				data: {
					// Missing x402Signature, transferAuth, eip3009Signature
					intent: {}
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				invalidPayload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data).to.have.property("error");
		});

		it("should reject payment with wrong chain ID", async () => {
			if (!USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
				this.skip();
			}

			const nonce = generateNonce();
			const expiry = Math.floor(Date.now() / 1000) + 300;
			const resource = "/api/content/premium/base-sepolia";

			// Create intent with wrong chainId
			const intent: X402PaymentIntent = {
				seller: SELLER_ADDRESS,
				buyer: buyerWallet.address,
				amount: PAYMENT_AMOUNT_RAW,
				token: USDC_BASE_SEPOLIA,
				nonce,
				expiry,
				resource,
				chainId: 99999 // Wrong chain
			};

			const x402Sig = await signX402PaymentIntent(intent, BASE_SEPOLIA_CHAIN_ID, buyerWallet);
			const transferAuth = paymentIntentToTransferAuth({
				...intent,
				validAfter: 0
			});
			const eip3009Sig = await signTransferAuthorizationWithProvider(
				transferAuth,
				USDC_BASE_SEPOLIA,
				BASE_SEPOLIA_CHAIN_ID,
				buyerWallet,
				provider
			);

			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent,
					x402Signature: x402Sig,
					transferAuth,
					eip3009Signature: eip3009Sig
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				payload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.include("not supported");
		});

		it("should reject expired payment intent", async () => {
			if (!USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
				this.skip();
			}

			const nonce = generateNonce();
			const expiry = Math.floor(Date.now() / 1000) - 100; // Expired 100s ago
			const resource = "/api/content/premium/base-sepolia";

			const intent: X402PaymentIntent = {
				seller: SELLER_ADDRESS,
				buyer: buyerWallet.address,
				amount: PAYMENT_AMOUNT_RAW,
				token: USDC_BASE_SEPOLIA,
				nonce,
				expiry,
				resource,
				chainId: BASE_SEPOLIA_CHAIN_ID
			};

			const x402Sig = await signX402PaymentIntent(intent, BASE_SEPOLIA_CHAIN_ID, buyerWallet);
			const transferAuth = paymentIntentToTransferAuth({
				...intent,
				validAfter: 0
			});
			const eip3009Sig = await signTransferAuthorizationWithProvider(
				transferAuth,
				USDC_BASE_SEPOLIA,
				BASE_SEPOLIA_CHAIN_ID,
				buyerWallet,
				provider
			);

			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent,
					x402Signature: x402Sig,
					transferAuth,
					eip3009Signature: eip3009Sig
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				payload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.include("expired");
		});

		it("should reject payment with wrong token address", async () => {
			if (!USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
				this.skip();
			}

			const nonce = generateNonce();
			const expiry = Math.floor(Date.now() / 1000) + 300;
			const resource = "/api/content/premium/base-sepolia";

			// Intent with wrong token address
			const intent: X402PaymentIntent = {
				seller: SELLER_ADDRESS,
				buyer: buyerWallet.address,
				amount: PAYMENT_AMOUNT_RAW,
				token: "0x0000000000000000000000000000000000000000", // Wrong token
				nonce,
				expiry,
				resource,
				chainId: BASE_SEPOLIA_CHAIN_ID
			};

			const x402Sig = await signX402PaymentIntent(intent, BASE_SEPOLIA_CHAIN_ID, buyerWallet);
			const transferAuth = paymentIntentToTransferAuth({
				...intent,
				validAfter: 0
			});
			const eip3009Sig = await signTransferAuthorizationWithProvider(
				transferAuth,
				USDC_BASE_SEPOLIA, // Sign with correct token for EIP-3009
				BASE_SEPOLIA_CHAIN_ID,
				buyerWallet,
				provider
			);

			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent,
					x402Signature: x402Sig,
					transferAuth,
					eip3009Signature: eip3009Sig
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				payload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.include("token");
		});

		it("should reject payment with invalid signature", async () => {
			if (!USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
				this.skip();
			}

			const nonce = generateNonce();
			const expiry = Math.floor(Date.now() / 1000) + 300;
			const resource = "/api/content/premium/base-sepolia";

			const intent: X402PaymentIntent = {
				seller: SELLER_ADDRESS,
				buyer: buyerWallet.address,
				amount: PAYMENT_AMOUNT_RAW,
				token: USDC_BASE_SEPOLIA,
				nonce,
				expiry,
				resource,
				chainId: BASE_SEPOLIA_CHAIN_ID
			};

			// Use invalid signature
			const invalidSig = "0x" + "00".repeat(65);

			const transferAuth = paymentIntentToTransferAuth({
				...intent,
				validAfter: 0
			});

			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent,
					x402Signature: invalidSig,
					transferAuth,
					eip3009Signature: invalidSig
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				payload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.include("signature");
		});
	});

	describe("Settlement Flow", () => {
		it("should validate both x402 and EIP-3009 signatures", async () => {
			// This test verifies the two-signature pattern is enforced
			// We'll test with a valid-looking payload but missing one signature
			if (!USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
				this.skip();
			}

			const nonce = generateNonce();
			const expiry = Math.floor(Date.now() / 1000) + 300;
			const resource = "/api/content/premium/base-sepolia";

			const intent: X402PaymentIntent = {
				seller: SELLER_ADDRESS,
				buyer: buyerWallet.address,
				amount: PAYMENT_AMOUNT_RAW,
				token: USDC_BASE_SEPOLIA,
				nonce,
				expiry,
				resource,
				chainId: BASE_SEPOLIA_CHAIN_ID
			};

			const x402Sig = await signX402PaymentIntent(intent, BASE_SEPOLIA_CHAIN_ID, buyerWallet);
			const transferAuth = paymentIntentToTransferAuth({
				...intent,
				validAfter: 0
			});

			// Missing eip3009Signature
			const payload: any = {
				scheme: "intent",
				data: {
					intent,
					x402Signature: x402Sig,
					transferAuth
					// eip3009Signature missing
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				payload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.exist;
		});

		it("should verify nonce consistency between signatures", async () => {
			// This test verifies nonce binding is checked
			if (!USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
				this.skip();
			}

			const nonce1 = generateNonce();
			const nonce2 = generateNonce(); // Different nonce
			const expiry = Math.floor(Date.now() / 1000) + 300;
			const resource = "/api/content/premium/base-sepolia";

			const intent: X402PaymentIntent = {
				seller: SELLER_ADDRESS,
				buyer: buyerWallet.address,
				amount: PAYMENT_AMOUNT_RAW,
				token: USDC_BASE_SEPOLIA,
				nonce: nonce1, // Use nonce1 for x402
				expiry,
				resource,
				chainId: BASE_SEPOLIA_CHAIN_ID
			};

			const x402Sig = await signX402PaymentIntent(intent, BASE_SEPOLIA_CHAIN_ID, buyerWallet);
			
			// Use different nonce for EIP-3009
			const transferAuth = paymentIntentToTransferAuth({
				...intent,
				nonce: nonce2, // Different nonce!
				validAfter: 0
			});

			const eip3009Sig = await signTransferAuthorizationWithProvider(
				transferAuth,
				USDC_BASE_SEPOLIA,
				BASE_SEPOLIA_CHAIN_ID,
				buyerWallet,
				provider
			);

			const payload: PaymentPayload = {
				scheme: "intent",
				data: {
					intent,
					x402Signature: x402Sig,
					transferAuth,
					eip3009Signature: eip3009Sig
				}
			};

			const response = await axios.post(
				`${FACILITATOR_URL}/settle`,
				payload,
				{ validateStatus: () => true }
			);

			expect(response.status).to.equal(400);
			expect(response.data.error).to.include("nonce");
		});
	});
});

