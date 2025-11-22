/**
 * Baseline E2E test for x402-exact scheme
 * 
 * This test verifies the complete flow:
 * 1. Request without payment → 402
 * 2. Create and sign payment intent
 * 3. Retry with x-payment header → 200 + content
 * 4. Verify on-chain settlement happened
 * 
 * This should continue passing after refactoring.
 */

import { expect } from "chai";
import axios from "axios";
import { describe, it, before } from "mocha";
import { ethers } from "ethers";
import dotenv from "dotenv";
import {
	generateNonce,
	signX402PaymentIntent,
	signTransferAuthorizationWithProvider,
	paymentIntentToTransferAuth
} from "../../shared/eip712.js";
import type { PaymentPayload, PaymentIntent } from "../../shared/types.js";

dotenv.config();

const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC;
const USDC_BASE_SEPOLIA = process.env.USDC_BASE_SEPOLIA;
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const SELLER_ADDRESS = process.env.SELLER_WALLET_ADDRESS;
const PAYMENT_AMOUNT = process.env.PAYMENT_AMOUNT || "0.01";
const PAYMENT_AMOUNT_RAW = String(Number(PAYMENT_AMOUNT) * 10 ** 6);
const CHAIN_SLUG = "base-sepolia";
const CHAIN_ID = 84532;

describe("E2E x402-exact Baseline Test", () => {
	let provider: ethers.JsonRpcProvider;
	let buyerWallet: ethers.Wallet;
	let usdcContract: ethers.Contract;
	let buyerBalanceBefore: bigint;
	let sellerBalanceBefore: bigint;

	before(function() {
		if (!BASE_SEPOLIA_RPC || !BUYER_PRIVATE_KEY || !USDC_BASE_SEPOLIA || !SELLER_ADDRESS) {
			this.skip();
		}

		provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
		buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);
		usdcContract = new ethers.Contract(
			USDC_BASE_SEPOLIA,
			["function balanceOf(address) view returns (uint256)"],
			provider
		);
	});

	it("should complete full x402-exact payment flow", async function() {
		this.timeout(60000); // 60s timeout for on-chain settlement (can be slow on testnets)

		// Step 1: Get initial balances
		buyerBalanceBefore = await usdcContract.balanceOf(buyerWallet.address);
		sellerBalanceBefore = await usdcContract.balanceOf(SELLER_ADDRESS!);

		// Step 2: Request content without payment → expect 402
		const resource = `/api/content/premium/${CHAIN_SLUG}`;
		let response = await axios.get(`${SELLER_URL}${resource}`, {
			validateStatus: () => true
		});

		expect(response.status).to.equal(402);
		expect(response.data).to.have.property("PaymentRequirements");
		const requirements = response.data.PaymentRequirements[0];
		
		// Verify requirements structure
		expect(requirements).to.have.property("scheme", "intent");
		expect(requirements).to.have.property("network", CHAIN_SLUG);
		expect(requirements).to.have.property("chainId", CHAIN_ID);
		expect(requirements).to.have.property("tokenAddress", USDC_BASE_SEPOLIA);
		expect(requirements).to.have.property("seller", SELLER_ADDRESS);
		expect(requirements).to.have.property("resource", resource);
		expect(requirements).to.have.property("amount", PAYMENT_AMOUNT);

		// Step 3: Create and sign payment intent
		const nonce = generateNonce();
		const expiry = Math.floor(Date.now() / 1000) + 300;

		const intent: PaymentIntent = {
			seller: SELLER_ADDRESS!,
			buyer: buyerWallet.address,
			amount: PAYMENT_AMOUNT_RAW,
			token: USDC_BASE_SEPOLIA!,
			nonce,
			expiry,
			resource,
			chainId: CHAIN_ID
		};

		// Sign x402 intent
		const x402Signature = await signX402PaymentIntent(intent, CHAIN_ID, buyerWallet);

		// Sign EIP-3009 authorization
		const transferAuth = paymentIntentToTransferAuth({
			...intent,
			validAfter: 0
		});

		const eip3009Signature = await signTransferAuthorizationWithProvider(
			transferAuth,
			USDC_BASE_SEPOLIA!,
			CHAIN_ID,
			buyerWallet,
			provider
		);

		const payload: PaymentPayload = {
			scheme: "intent",
			data: {
				intent,
				x402Signature,
				transferAuth,
				eip3009Signature
			}
		};

		// Step 4: Retry request with payment → expect 200 + content
		response = await axios.get(`${SELLER_URL}${resource}`, {
			headers: {
				"x-payment": JSON.stringify(payload)
			},
			validateStatus: () => true
		});

		expect(response.status).to.equal(200);
		expect(response.data).to.have.property("content");
		expect(response.data.content).to.have.property("title", "Premium AI Model Output");

		// Verify x-payment-response header
		const paymentResponseHeader = response.headers["x-payment-response"];
		expect(paymentResponseHeader).to.exist;
		
		const paymentResponse = JSON.parse(paymentResponseHeader);
		expect(paymentResponse).to.have.property("scheme", "intent");
		expect(paymentResponse).to.have.property("status", "settled");
		expect(paymentResponse).to.have.property("txHash");
		expect(paymentResponse.txHash).to.match(/^0x[a-fA-F0-9]{64}$/);

		// Step 5: Verify on-chain settlement
		// Wait a bit for transaction to be mined
		await new Promise(resolve => setTimeout(resolve, 2000));

		const buyerBalanceAfter = await usdcContract.balanceOf(buyerWallet.address);
		const sellerBalanceAfter = await usdcContract.balanceOf(SELLER_ADDRESS!);

		const buyerDiff = buyerBalanceBefore - buyerBalanceAfter;
		const sellerDiff = sellerBalanceAfter - sellerBalanceBefore;

		expect(buyerDiff).to.equal(BigInt(PAYMENT_AMOUNT_RAW));
		expect(sellerDiff).to.equal(BigInt(PAYMENT_AMOUNT_RAW));

		// Verify transaction exists
		const txReceipt = await provider.getTransactionReceipt(paymentResponse.txHash);
		expect(txReceipt).to.exist;
		expect(txReceipt!.status).to.equal(1); // Success
	});
});

