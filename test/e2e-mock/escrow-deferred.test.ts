/**
 * E2E Test: x402-escrow-deferred [MOCK_CHAIN]
 * 
 * ⚠️  WARNING: Uses MOCK Vault behavior (contract not deployed)
 * ⚠️  TODO: Migrate to test/e2e/ after Vault deployment
 * ⚠️  Then validate mocks with: npm run test:validate-mocks
 * 
 * Tests the full HTTP flow for escrow-deferred payments WITHOUT on-chain settlement.
 * Validates:
 * - 402 response with escrow requirements
 * - Vault-domain signature generation
 * - Facilitator validation and queuing
 * - Immediate content delivery (no on-chain wait)
 * - Queue management
 */

import { expect } from "chai";
import { describe, it, before, after } from "mocha";
import axios from "axios";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import { createLogger } from "../../shared/logger.js";
import {
	generateNonce,
	signPaymentIntentWithVaultDomain,
} from "../../shared/eip712.js";
import type {
	PaymentRequirements,
	PaymentIntent,
	PaymentPayload,
	PaymentResponse,
} from "../../shared/types.js";

dotenv.config();

const logger = createLogger("e2e-escrow-deferred-test");

const SELLER_PORT = process.env.SELLER_PORT || 4022;
const FACILITATOR_PORT = process.env.FACILITATOR_PORT || 4023;
const SELLER_URL = `http://localhost:${SELLER_PORT}`;
const FACILITATOR_URL = `http://localhost:${FACILITATOR_PORT}`;

const CHAIN = "base-sepolia";
const CHAIN_ID = 84532;
const RPC_URL = process.env.BASE_SEPOLIA_RPC!;
const USDC_ADDRESS = process.env.USDC_BASE_SEPOLIA!;
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY!;
const BUYER_ADDRESS = process.env.BUYER_WALLET_ADDRESS!;
const PAYMENT_AMOUNT = "0.01";
const PAYMENT_AMOUNT_RAW = "10000"; // 0.01 * 10^6

const MOCK_VAULT_ADDRESS = "0x0000000000000000000000000000000000000001";

describe("E2E x402-escrow-deferred [MOCK_CHAIN]", function() {
	this.timeout(30000);

	let sellerProcess: ChildProcess;
	let facilitatorProcess: ChildProcess;
	let provider: ethers.JsonRpcProvider;
	let buyerWallet: ethers.Wallet;

	before(async () => {
		logger.info("Starting E2E escrow-deferred test setup...");

		// Setup provider and wallet
		provider = new ethers.JsonRpcProvider(RPC_URL);
		buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);

		// Start facilitator
		facilitatorProcess = spawn("tsx", [path.resolve(__dirname, "../../facilitator/server.ts")], {
			env: { ...process.env, FACILITATOR_PORT: String(FACILITATOR_PORT) },
			detached: true,
		});

		await new Promise<void>((resolve) => {
			facilitatorProcess.stdout?.on("data", (data) => {
				if (data.toString().includes(`Facilitator running on port ${FACILITATOR_PORT}`)) {
					logger.info("✓ Facilitator started");
					resolve();
				}
			});
			facilitatorProcess.stderr?.on("data", (data) => {
				console.error(`Facilitator error: ${data}`);
			});
		});

		// Start seller
		sellerProcess = spawn("tsx", [path.resolve(__dirname, "../../seller/server.ts")], {
			env: { ...process.env, SELLER_PORT: String(SELLER_PORT) },
			detached: true,
		});

		await new Promise<void>((resolve) => {
			sellerProcess.stdout?.on("data", (data) => {
				if (data.toString().includes(`Seller server running on port ${SELLER_PORT}`)) {
					logger.info("✓ Seller started");
					resolve();
				}
			});
			sellerProcess.stderr?.on("data", (data) => {
				console.error(`Seller error: ${data}`);
			});
		});

		logger.info("Test setup complete");
	});

	after(() => {
		logger.info("Stopping test services...");
		if (sellerProcess && sellerProcess.pid) {
			try { process.kill(-sellerProcess.pid); } catch (e) {}
		}
		if (facilitatorProcess && facilitatorProcess.pid) {
			try { process.kill(-facilitatorProcess.pid); } catch (e) {}
		}
		logger.info("Test services stopped");
	});

	it("should return 402 with escrow-deferred requirements", async () => {
		const endpoint = `/api/content/premium/${CHAIN}`;
		const url = `${SELLER_URL}${endpoint}?scheme=x402-escrow-deferred`;

		try {
			await axios.get(url);
			expect.fail("Expected 402 Payment Required");
		} catch (error: any) {
			expect(error.response).to.exist;
			expect(error.response.status).to.equal(402);

		const requirements: PaymentRequirements = error.response.data.PaymentRequirements[0];
		expect(requirements).to.exist;
		expect(requirements.scheme).to.equal("x402-escrow-deferred");
		expect(requirements.facilitator).to.include("/validate-intent");
		// Vault address comes from env (real deployed vault or mock)
		expect(requirements.vault).to.be.a("string").with.lengthOf(42); // Valid Ethereum address
		expect(requirements.vault).to.match(/^0x[a-fA-F0-9]{40}$/);
		expect(requirements.escrow).to.exist;
		expect(requirements.escrow.type).to.equal("vault-pool");
		expect(requirements.escrow.mode).to.equal("deferred");
		}
	});

	it("should validate intent, queue for settlement, and deliver content immediately", async () => {
		const endpoint = `/api/content/premium/${CHAIN}`;
		const url = `${SELLER_URL}${endpoint}?scheme=x402-escrow-deferred`;

		// Get requirements
		let requirements: PaymentRequirements;
		try {
			await axios.get(url);
			expect.fail("Expected 402");
		} catch (error: any) {
			requirements = error.response.data.PaymentRequirements[0];
		}

		// Create and sign payment intent
		const nonce = generateNonce();
		const expiry = Math.floor(Date.now() / 1000) + 180;

		const intent: PaymentIntent = {
			seller: requirements.seller,
			buyer: BUYER_ADDRESS,
			amount: PAYMENT_AMOUNT_RAW,
			token: USDC_ADDRESS,
			nonce,
			expiry,
			resource: `/api/content/premium/${CHAIN}`,
			chainId: CHAIN_ID,
		};

		// Sign with Vault domain
		const x402Signature = await signPaymentIntentWithVaultDomain(
			intent,
			requirements.vault,
			CHAIN_ID,
			buyerWallet,
			provider
		);

		const payload: PaymentPayload = {
			scheme: "x402-escrow-deferred",
			data: {
				intent,
				x402Signature,
				transferAuth: {} as any, // Not used for escrow-deferred
				eip3009Signature: "", // Not used for escrow-deferred
			},
		};

		// Submit payment and request content
		const startTime = Date.now();
		const response = await axios.get(url, {
			headers: {
				"x-payment": JSON.stringify(payload),
			},
			timeout: 15000,
		});
		const latency = Date.now() - startTime;

		// Validate response
		expect(response.status).to.equal(200);
		expect(response.data).to.have.property("content");
		expect(response.data.content.title).to.include("Premium");
		expect(response.data).to.have.property("payment");
		expect(response.data.payment.status).to.equal("pending");
		expect(response.data.payment.scheme).to.equal("x402-escrow-deferred");

		// Validate fast delivery (no on-chain settlement)
		expect(latency).to.be.lessThan(2000); // Should be < 2s (no blockchain wait)

		logger.info(`✓ Content delivered in ${latency}ms (no on-chain delay)`);
	});

	it("should queue intent in facilitator for batch settlement", async () => {
		// Check queue stats
		const statsResponse = await axios.get(`${FACILITATOR_URL}/health`);
		expect(statsResponse.data.queue).to.exist;
		expect(statsResponse.data.queue.total).to.be.at.least(1);
		expect(statsResponse.data.queue.pending).to.be.at.least(1);

		logger.info(`✓ Queue has ${statsResponse.data.queue.pending} pending intent(s)`);
	});

	it("should reject replay attacks (same nonce)", async () => {
		const endpoint = `/api/content/premium/${CHAIN}`;
		const url = `${SELLER_URL}${endpoint}?scheme=x402-escrow-deferred`;

		// Get requirements
		let requirements: PaymentRequirements;
		try {
			await axios.get(url);
		} catch (error: any) {
			requirements = error.response.data.PaymentRequirements[0];
		}

		// Use a fixed nonce
		const nonce = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
		const expiry = Math.floor(Date.now() / 1000) + 180;

		const intent: PaymentIntent = {
			seller: requirements.seller,
			buyer: BUYER_ADDRESS,
			amount: PAYMENT_AMOUNT_RAW,
			token: USDC_ADDRESS,
			nonce,
			expiry,
			resource: `/api/content/premium/${CHAIN}`,
			chainId: CHAIN_ID,
		};

		const x402Signature = await signPaymentIntentWithVaultDomain(
			intent,
			requirements.vault,
			CHAIN_ID,
			buyerWallet,
			provider
		);

		const payload: PaymentPayload = {
			scheme: "x402-escrow-deferred",
			data: {
				intent,
				x402Signature,
				transferAuth: {} as any,
				eip3009Signature: "",
			},
		};

		// First request should succeed
		const firstResponse = await axios.get(url, {
			headers: { "x-payment": JSON.stringify(payload) },
		});
		expect(firstResponse.status).to.equal(200);

		// Second request with same nonce should fail
		try {
			await axios.get(url, {
				headers: { "x-payment": JSON.stringify(payload) },
			});
			expect.fail("Expected replay attack to be rejected");
		} catch (error: any) {
			expect(error.response.status).to.equal(400);
			expect(error.response.data.error.toLowerCase()).to.include("nonce");
		}

		logger.info("✓ Replay attack prevented");
	});
});

