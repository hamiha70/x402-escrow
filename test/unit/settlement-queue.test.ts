/**
 * Unit tests for SettlementQueue (Facilitator)
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import { SettlementQueue } from "../../facilitator/services/SettlementQueue.js";
import type { PaymentContext } from "../../shared/types.js";

describe("SettlementQueue (Facilitator)", () => {
	let queue: SettlementQueue;

	beforeEach(() => {
		queue = new SettlementQueue();
	});

	describe("addIntent()", () => {
		it("should add a new intent successfully", () => {
			const intent: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1234",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			const added = queue.addIntent(intent);
			expect(added).to.be.true;
		});

		it("should reject duplicate nonce for same buyer", () => {
			const intent: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1234",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			const firstAdd = queue.addIntent(intent);
			const secondAdd = queue.addIntent(intent);

			expect(firstAdd).to.be.true;
			expect(secondAdd).to.be.false;
		});

		it("should allow same nonce for different buyers", () => {
			const intent1: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer1",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1234",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			const intent2: PaymentContext = {
				...intent1,
				buyerAddress: "0xBuyer2",
			};

			const firstAdd = queue.addIntent(intent1);
			const secondAdd = queue.addIntent(intent2);

			expect(firstAdd).to.be.true;
			expect(secondAdd).to.be.true;
		});
	});

	describe("getPendingIntents()", () => {
		it("should return empty array for empty queue", () => {
			const pending = queue.getPendingIntents();
			expect(pending).to.be.an("array");
			expect(pending.length).to.equal(0);
		});

		it("should return all pending intents", () => {
			const intent1: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer1",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1111",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			const intent2: PaymentContext = {
				...intent1,
				buyerAddress: "0xBuyer2",
				nonce: "0x2222",
			};

			queue.addIntent(intent1);
			queue.addIntent(intent2);

			const pending = queue.getPendingIntents();
			expect(pending.length).to.equal(2);
			expect(pending[0].nonce).to.equal("0x1111");
			expect(pending[1].nonce).to.equal("0x2222");
		});

		it("should respect limit parameter", () => {
			for (let i = 0; i < 5; i++) {
				queue.addIntent({
					scheme: "x402-escrow-deferred",
					chainId: 84532,
					tokenAddress: "0xUSDC",
					resource: "/api/content/premium",
					buyerAddress: "0xBuyer",
					sellerAddress: "0xSeller",
					amountRaw: "10000",
					amountDisplay: "0.01",
					nonce: `0x${i}`,
					expiry: Math.floor(Date.now() / 1000) + 300,
				});
			}

			const pending = queue.getPendingIntents(3);
			expect(pending.length).to.equal(3);
		});

		it("should not return settled intents", () => {
			const intent: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1234",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			queue.addIntent(intent);
			queue.markAsSettled("0xBuyer-0x1234", "0xTxHash");

			const pending = queue.getPendingIntents();
			expect(pending.length).to.equal(0);
		});
	});

	describe("markAsSettled()", () => {
		it("should mark intent as settled with txHash", () => {
			const intent: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1234",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			queue.addIntent(intent);
			queue.markAsSettled("0xBuyer-0x1234", "0xTxHash123");

			const retrieved = queue.getIntent("0xBuyer-0x1234");
			expect(retrieved).to.exist;
			expect(retrieved!.status).to.equal("settled");
			expect(retrieved!.settlementTxHash).to.equal("0xTxHash123");
		});
	});

	describe("markAsFailed()", () => {
		it("should mark intent as failed with error", () => {
			const intent: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1234",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			queue.addIntent(intent);
			queue.markAsFailed("0xBuyer-0x1234", "Insufficient balance");

			const retrieved = queue.getIntent("0xBuyer-0x1234");
			expect(retrieved).to.exist;
			expect(retrieved!.status).to.equal("failed");
			expect(retrieved!.settlementError).to.equal("Insufficient balance");
		});
	});

	describe("getQueueSize() and getPendingQueueSize()", () => {
		it("should track total and pending queue sizes", () => {
			expect(queue.getQueueSize()).to.equal(0);
			expect(queue.getPendingQueueSize()).to.equal(0);

			const intent1: PaymentContext = {
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				tokenAddress: "0xUSDC",
				resource: "/api/content/premium",
				buyerAddress: "0xBuyer1",
				sellerAddress: "0xSeller",
				amountRaw: "10000",
				amountDisplay: "0.01",
				nonce: "0x1111",
				expiry: Math.floor(Date.now() / 1000) + 300,
			};

			const intent2: PaymentContext = {
				...intent1,
				buyerAddress: "0xBuyer2",
				nonce: "0x2222",
			};

			queue.addIntent(intent1);
			queue.addIntent(intent2);

			expect(queue.getQueueSize()).to.equal(2);
			expect(queue.getPendingQueueSize()).to.equal(2);

			queue.markAsSettled("0xBuyer1-0x1111", "0xTxHash");

			expect(queue.getQueueSize()).to.equal(2); // Still 2 total
			expect(queue.getPendingQueueSize()).to.equal(1); // Only 1 pending
		});
	});
});

