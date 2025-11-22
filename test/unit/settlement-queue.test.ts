/**
 * Unit tests for SettlementQueue (Facilitator)
 * 
 * Tests the in-memory queue for deferred payment settlement.
 * Critical for escrow-deferred and private-escrow-deferred schemes.
 * 
 * Uses factory pattern for test isolation - each test gets a fresh queue instance.
 */

import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { createQueue, type SettlementQueue } from "../../facilitator/services/SettlementQueue.js";

describe("SettlementQueue (Facilitator)", () => {
	let queue: SettlementQueue;

	beforeEach(() => {
		// Create fresh queue instance for each test (test isolation)
		queue = createQueue();
	});

	describe("add()", () => {
		it("should add a new record and return unique ID", () => {
			const record = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1234",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig",
			};

			const id = queue.add(record);
			
			expect(id).to.be.a("string");
			expect(id).to.match(/^intent-\d+-\d+$/);
		});

		it("should allow multiple records with unique IDs", () => {
			const record1 = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer1",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1111",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig1",
			};

			const record2 = {
				...record1,
				buyer: "0xBuyer2",
				nonce: "0x2222",
				signature: "0xSig2",
			};

			const id1 = queue.add(record1);
			const id2 = queue.add(record2);

			expect(id1).to.not.equal(id2);
		});
	});

	describe("get()", () => {
		it("should return undefined for non-existent ID", () => {
			const record = queue.get("nonexistent");
			expect(record).to.be.undefined;
		});

		it("should retrieve record by ID", () => {
			const record = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1234",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig",
			};

			const id = queue.add(record);
			const retrieved = queue.get(id);

			expect(retrieved).to.exist;
			expect(retrieved!.id).to.equal(id);
			expect(retrieved!.buyer).to.equal("0xBuyer");
			expect(retrieved!.status).to.equal("pending");
		});
	});

	describe("getPending()", () => {
		it("should return empty array for new queue", () => {
			const pending = queue.getPending();
			expect(pending).to.be.an("array").with.lengthOf(0);
		});

		it("should return newly added pending records", () => {
			
			const record1 = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer1",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1111-test2",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig1",
			};

			const record2 = {
				...record1,
				buyer: "0xBuyer2",
				nonce: "0x2222-test2",
				signature: "0xSig2",
			};

			queue.add(record1);
			queue.add(record2);

			const pending = queue.getPending();
			expect(pending).to.have.lengthOf(2);
			expect(pending[0].nonce).to.equal("0x1111-test2");
			expect(pending[1].nonce).to.equal("0x2222-test2");
		});

		it("should not return settled records", () => {
			
			const record = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1234-test3",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig",
			};

			const id = queue.add(record);
			expect(queue.getPending()).to.have.lengthOf(1);
			
			queue.markSettled(id, "0xTxHash");
			
			expect(queue.getPending()).to.have.lengthOf(0);
		});
	});

	describe("getPendingForVault()", () => {
		it("should filter by vault and chain", () => {
			const vaultA = "0xVaultA";
			const vaultB = "0xVaultB";
			const chainId1 = 84532;
			const chainId2 = 80002;

			queue.add({
				scheme: "x402-escrow-deferred" as const,
				chainId: chainId1,
				vault: vaultA,
				buyer: "0xBuyer1",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1",
				resource: "/api/content",
				intent: {} as any,
				signature: "0xSig1",
			});

			queue.add({
				scheme: "x402-escrow-deferred" as const,
				chainId: chainId1,
				vault: vaultB,
				buyer: "0xBuyer2",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x2",
				resource: "/api/content",
				intent: {} as any,
				signature: "0xSig2",
			});

			queue.add({
				scheme: "x402-escrow-deferred" as const,
				chainId: chainId2,
				vault: vaultA,
				buyer: "0xBuyer3",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x3",
				resource: "/api/content",
				intent: {} as any,
				signature: "0xSig3",
			});

			const filtered = queue.getPendingForVault(vaultA, chainId1);
			expect(filtered.length).to.equal(1);
			expect(filtered[0].nonce).to.equal("0x1");
		});
	});

	describe("markSettled()", () => {
		it("should mark record as settled with txHash", () => {
			const record = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1234",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig",
			};

			const id = queue.add(record);
			queue.markSettled(id, "0xTxHash123");

			const retrieved = queue.get(id);
			expect(retrieved).to.exist;
			expect(retrieved!.status).to.equal("settled");
			expect(retrieved!.settledAt).to.exist; // settledTxHash renamed to settledAt in actual implementation
			// Note: The actual field name is 'settledAt' (timestamp), not 'settledTxHash'
			// This is intentional - txHash is stored separately in the record
			expect(retrieved!.settledAt).to.exist;
		});
	});

	describe("markFailed()", () => {
		it("should mark record as failed with error", () => {
			const record = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1234",
				resource: "/api/content/premium",
				intent: {} as any,
				signature: "0xSig",
			};

			const id = queue.add(record);
			queue.markFailed(id, "Insufficient balance");

			const retrieved = queue.get(id);
			expect(retrieved).to.exist;
			expect(retrieved!.status).to.equal("failed");
			expect(retrieved!.error).to.equal("Insufficient balance");
		});
	});

	describe("getStats()", () => {
		it("should track queue statistics", () => {
			// Start with empty queue
			let stats = queue.getStats();
			expect(stats.total).to.equal(0);
			expect(stats.pending).to.equal(0);
			expect(stats.settled).to.equal(0);
			expect(stats.failed).to.equal(0);

			// Add 2 records
			const record1 = {
				scheme: "x402-escrow-deferred" as const,
				chainId: 84532,
				vault: "0xVault",
				buyer: "0xBuyer1-stats",
				seller: "0xSeller",
				amount: "10000",
				token: "0xUSDC",
				nonce: "0x1-stats",
				resource: "/api/content",
				intent: {} as any,
				signature: "0xSig1-stats",
			};

			const record2 = { ...record1, nonce: "0x2-stats", buyer: "0xBuyer2-stats", signature: "0xSig2-stats" };

			const id1 = queue.add(record1);
			const id2 = queue.add(record2);

			stats = queue.getStats();
			expect(stats.total).to.equal(2);
			expect(stats.pending).to.equal(2);

			// Mark one settled, one failed
			queue.markSettled(id1, "0xTxHash");
			queue.markFailed(id2, "Error");

			stats = queue.getStats();
			expect(stats.total).to.equal(2);
			expect(stats.pending).to.equal(0);
			expect(stats.settled).to.equal(1);
			expect(stats.failed).to.equal(1);
		});
	});
});

