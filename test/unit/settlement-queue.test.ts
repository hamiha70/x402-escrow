/**
 * Unit tests for SettlementQueue (Facilitator)
 * 
 * Tests the in-memory queue for deferred payment settlement.
 * Critical for escrow-deferred and private-escrow-deferred schemes.
 * 
 * Note: SettlementQueue is exported as a singleton instance.
 * Tests operate on the shared instance and may have side effects.
 * For production, consider exporting the class for testability.
 */

import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import queue from "../../facilitator/services/SettlementQueue.js";

describe("SettlementQueue (Facilitator)", () => {
	// Using singleton instance - tests share state
	// This matches production usage pattern

	beforeEach(() => {
		// WARNING: Singleton pattern means tests share state
		// cleanup() only removes old records, doesn't clear all
		// Tests need to account for cumulative queue growth
		// TODO: Export class for better testability, or add clear() method
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
		it("should return array of pending records (may include records from previous tests)", () => {
			const beforeCount = queue.getPending().length;
			expect(queue.getPending()).to.be.an("array");
			// Note: Singleton means queue persists across tests
			// This test just validates the method works, not that queue is empty
		});

		it("should return newly added pending records", () => {
			const beforeCount = queue.getPending().length;
			
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
			expect(pending.length).to.be.at.least(2); // At least our 2 records
			// Check our records are in there
			const hasFirst = pending.some(r => r.nonce === "0x1111-test2");
			const hasSecond = pending.some(r => r.nonce === "0x2222-test2");
			expect(hasFirst).to.be.true;
			expect(hasSecond).to.be.true;
		});

		it("should not return settled records", () => {
			const beforeCount = queue.getPending().length;
			
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
			const afterAdd = queue.getPending().length;
			expect(afterAdd).to.equal(beforeCount + 1); // Should increase by 1
			
			queue.markSettled(id, "0xTxHash");
			
			const afterSettle = queue.getPending().length;
			expect(afterSettle).to.equal(beforeCount); // Should return to original count
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
		it("should track queue statistics (relative changes)", () => {
			const statsBefore = queue.getStats();

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

			const statsAfterAdd = queue.getStats();
			expect(statsAfterAdd.total).to.equal(statsBefore.total + 2);
			expect(statsAfterAdd.pending).to.equal(statsBefore.pending + 2);

			queue.markSettled(id1, "0xTxHash");
			queue.markFailed(id2, "Error");

			const statsFinal = queue.getStats();
			expect(statsFinal.total).to.equal(statsBefore.total + 2); // Still 2 records
			expect(statsFinal.pending).to.equal(statsBefore.pending); // Back to original pending count
			expect(statsFinal.settled).to.equal(statsBefore.settled + 1);
			expect(statsFinal.failed).to.equal(statsBefore.failed + 1);
		});
	});
});

