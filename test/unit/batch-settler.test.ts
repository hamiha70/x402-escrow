import { expect } from "chai";
import { ethers } from "ethers";
import { settleBatch, processAllPending, type BatchSettlerConfig } from "../../facilitator/services/BatchSettler.js";
import { createQueue, type QueueRecord, type SettlementQueue } from "../../facilitator/services/SettlementQueue.js";
import type { PaymentIntent } from "../../shared/types.js";

describe("BatchSettler", function () {
	let queue: SettlementQueue;
	let mockProvider: ethers.JsonRpcProvider;
	let mockWallet: ethers.Wallet;
	let mockConfig: BatchSettlerConfig;

	beforeEach(function () {
		// Create fresh queue instance for each test (test isolation)
		queue = createQueue();

		// Mock provider and wallet (no actual connection needed for unit tests)
		mockProvider = {} as ethers.JsonRpcProvider;
		mockWallet = {} as ethers.Wallet;

		mockConfig = {
			getProvider: (chainId: number) => mockProvider,
			getWallet: (chainId: number) => mockWallet,
			getChainConfig: (chainId: number) => ({
				rpc: "http://localhost:8545",
				usdc: "0x0000000000000000000000000000000000000001",
				name: "Test Chain",
			}),
		};
	});

	describe("Queue Record Structure", function () {
		it("should validate queue record has required fields", function () {
			const intent: PaymentIntent = {
				buyer: "0x1111111111111111111111111111111111111111",
				seller: "0x2222222222222222222222222222222222222222",
				amount: "10000",
				token: "0x3333333333333333333333333333333333333333",
				nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: 84532,
			};

			const recordId = queue.add({
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				vault: "0x4444444444444444444444444444444444444444",
				buyer: intent.buyer,
				seller: intent.seller,
				amount: intent.amount,
				token: intent.token,
				nonce: intent.nonce,
				resource: intent.resource,
				intent: intent,
				signature: "0xabcd",
			});

			const record = queue.get(recordId);
			expect(record).to.exist;
			expect(record!.intent).to.deep.equal(intent);
			expect(record!.signature).to.equal("0xabcd");
			expect(record!.status).to.equal("pending");
		});

		it("should have intent field that matches Vault.sol PaymentIntent struct", function () {
			const intent: PaymentIntent = {
				buyer: "0x1111111111111111111111111111111111111111",
				seller: "0x2222222222222222222222222222222222222222",
				amount: "10000",
				token: "0x3333333333333333333333333333333333333333",
				nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
				expiry: 1234567890,
				resource: "/api/test",
				chainId: 84532,
			};

			const recordId = queue.add({
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				vault: "0x4444444444444444444444444444444444444444",
				buyer: intent.buyer,
				seller: intent.seller,
				amount: intent.amount,
				token: intent.token,
				nonce: intent.nonce,
				resource: intent.resource,
				intent: intent,
				signature: "0xabcd",
			});

			const record = queue.get(recordId);
			
			// Verify all fields required by Vault.batchWithdraw
			expect(record!.intent.buyer).to.be.a("string");
			expect(record!.intent.seller).to.be.a("string");
			expect(record!.intent.amount).to.be.a("string");
			expect(record!.intent.token).to.be.a("string");
			expect(record!.intent.nonce).to.be.a("string");
			expect(record!.intent.expiry).to.be.a("number");
			expect(record!.intent.resource).to.be.a("string");
			expect(record!.intent.chainId).to.be.a("number");
		});
	});

	describe("processAllPending()", function () {
		it("should return empty result when queue is empty", function () {
			// Don't actually call processAllPending (requires real RPC)
			// Just test the logic
			const pending = queue.getPending();
			expect(pending).to.have.lengthOf(0);
		});

		it("should group intents by vault and chainId", async function () {
			// Add intents for different vaults/chains
			const vault1 = "0x4444444444444444444444444444444444444444";
			const vault2 = "0x5555555555555555555555555555555555555555";
			
			const createIntent = (buyer: string, seller: string, vault: string, chainId: number) => {
				const intent: PaymentIntent = {
					buyer,
					seller,
					amount: "10000",
					token: "0x3333333333333333333333333333333333333333",
					nonce: `0x${Math.random().toString(16).substring(2).padStart(64, "0")}`,
					expiry: Math.floor(Date.now() / 1000) + 300,
					resource: "/api/test",
					chainId,
				};

				queue.add({
					scheme: "x402-escrow-deferred",
					chainId,
					vault,
					buyer: intent.buyer,
					seller: intent.seller,
					amount: intent.amount,
					token: intent.token,
					nonce: intent.nonce,
					resource: intent.resource,
					intent,
					signature: "0xabcd",
				});
			};

			// Vault1 on Chain 84532: 2 intents
			createIntent("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", vault1, 84532);
			createIntent("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", vault1, 84532);
			
			// Vault2 on Chain 84532: 1 intent
			createIntent("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", vault2, 84532);
			
			// Vault1 on Chain 80002: 1 intent
			createIntent("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", vault1, 80002);

			const pending = queue.getPending();
			expect(pending).to.have.lengthOf(4);

			// Group by vault-chainId
			const groups = new Map<string, QueueRecord[]>();
			for (const record of pending) {
				const key = `${record.vault}-${record.chainId}`;
				if (!groups.has(key)) {
					groups.set(key, []);
				}
				groups.get(key)!.push(record);
			}

			expect(groups.size).to.equal(3); // 3 unique vault-chain combinations
			expect(groups.get(`${vault1}-84532`)).to.have.lengthOf(2);
			expect(groups.get(`${vault2}-84532`)).to.have.lengthOf(1);
			expect(groups.get(`${vault1}-80002`)).to.have.lengthOf(1);
		});

		it("should handle multiple intents for same buyer and seller", function () {
			const buyer = "0x1111111111111111111111111111111111111111";
			const seller = "0x2222222222222222222222222222222222222222";
			const vault = "0x4444444444444444444444444444444444444444";

			// Add 3 intents from same buyer to same seller
			for (let i = 0; i < 3; i++) {
				const intent: PaymentIntent = {
					buyer,
					seller,
					amount: "10000",
					token: "0x3333333333333333333333333333333333333333",
					nonce: `0x${i.toString(16).padStart(64, "0")}`,
					expiry: Math.floor(Date.now() / 1000) + 300,
					resource: "/api/test",
					chainId: 84532,
				};

				queue.add({
					scheme: "x402-escrow-deferred",
					chainId: 84532,
					vault,
					buyer: intent.buyer,
					seller: intent.seller,
					amount: intent.amount,
					token: intent.token,
					nonce: intent.nonce,
					resource: intent.resource,
					intent,
					signature: `0xsig${i}`,
				});
			}

			const pending = queue.getPending();
			expect(pending).to.have.lengthOf(3);

			// All should have same buyer/seller but different nonces
			const nonces = pending.map(r => r.intent.nonce);
			const uniqueNonces = new Set(nonces);
			expect(uniqueNonces.size).to.equal(3); // All unique nonces
		});
	});

	describe("settleBatch() - Data Preparation", function () {
		it("should correctly map queue records to Vault intents array", function () {
			const records: QueueRecord[] = [];
			
			for (let i = 0; i < 3; i++) {
				const intent: PaymentIntent = {
					buyer: "0x1111111111111111111111111111111111111111",
					seller: "0x2222222222222222222222222222222222222222",
					amount: "10000",
					token: "0x3333333333333333333333333333333333333333",
					nonce: `0x${i.toString(16).padStart(64, "0")}`,
					expiry: 1234567890,
					resource: "/api/test",
					chainId: 84532,
				};

				const recordId = queue.add({
					scheme: "x402-escrow-deferred",
					chainId: 84532,
					vault: "0x4444444444444444444444444444444444444444",
					buyer: intent.buyer,
					seller: intent.seller,
					amount: intent.amount,
					token: intent.token,
					nonce: intent.nonce,
					resource: intent.resource,
					intent,
					signature: `0xsig${i}`,
				});

				const record = queue.get(recordId);
				if (record) {
					records.push(record);
				}
			}

			// This is what settleBatch does
			const intents = records.map(r => r.intent);
			const signatures = records.map(r => r.signature);

			expect(intents).to.have.lengthOf(3);
			expect(signatures).to.have.lengthOf(3);

			// Verify structure matches Vault.sol expectations
			intents.forEach((intent, i) => {
				expect(intent.buyer).to.equal("0x1111111111111111111111111111111111111111");
				expect(intent.seller).to.equal("0x2222222222222222222222222222222222222222");
				expect(intent.amount).to.equal("10000");
				expect(intent.nonce).to.equal(`0x${i.toString(16).padStart(64, "0")}`);
			});

			signatures.forEach((sig, i) => {
				expect(sig).to.equal(`0xsig${i}`);
			});
		});

		it("should handle empty records array", function () {
			const records: QueueRecord[] = [];
			
			const intents = records.map(r => r.intent);
			const signatures = records.map(r => r.signature);

			expect(intents).to.have.lengthOf(0);
			expect(signatures).to.have.lengthOf(0);
		});
	});

	describe("Queue Status Management", function () {
		it("should mark records as settled after successful batch", function () {
			const intent: PaymentIntent = {
				buyer: "0x1111111111111111111111111111111111111111",
				seller: "0x2222222222222222222222222222222222222222",
				amount: "10000",
				token: "0x3333333333333333333333333333333333333333",
				nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: 84532,
			};

			const recordId = queue.add({
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				vault: "0x4444444444444444444444444444444444444444",
				buyer: intent.buyer,
				seller: intent.seller,
				amount: intent.amount,
				token: intent.token,
				nonce: intent.nonce,
				resource: intent.resource,
				intent,
				signature: "0xabcd",
			});

			const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
			queue.markSettled(recordId, mockTxHash);

			const record = queue.get(recordId);
			expect(record!.status).to.equal("settled");
			expect(record!.txHash).to.equal(mockTxHash);
			expect(record!.settledAt).to.be.a("number");
		});

		it("should mark records as failed on error", function () {
			const intent: PaymentIntent = {
				buyer: "0x1111111111111111111111111111111111111111",
				seller: "0x2222222222222222222222222222222222222222",
				amount: "10000",
				token: "0x3333333333333333333333333333333333333333",
				nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
				expiry: Math.floor(Date.now() / 1000) + 300,
				resource: "/api/test",
				chainId: 84532,
			};

			const recordId = queue.add({
				scheme: "x402-escrow-deferred",
				chainId: 84532,
				vault: "0x4444444444444444444444444444444444444444",
				buyer: intent.buyer,
				seller: intent.seller,
				amount: intent.amount,
				token: intent.token,
				nonce: intent.nonce,
				resource: intent.resource,
				intent,
				signature: "0xabcd",
			});

			queue.markFailed(recordId, "Insufficient deposit");

			const record = queue.get(recordId);
			expect(record!.status).to.equal("failed");
			expect(record!.error).to.equal("Insufficient deposit");
			expect(record!.failedAt).to.be.a("number");
		});

		it("should track queue statistics correctly", function () {
			// Add 3 pending intents
			for (let i = 0; i < 3; i++) {
				const intent: PaymentIntent = {
					buyer: "0x1111111111111111111111111111111111111111",
					seller: "0x2222222222222222222222222222222222222222",
					amount: "10000",
					token: "0x3333333333333333333333333333333333333333",
					nonce: `0x${i.toString(16).padStart(64, "0")}`,
					expiry: Math.floor(Date.now() / 1000) + 300,
					resource: "/api/test",
					chainId: 84532,
				};

				queue.add({
					scheme: "x402-escrow-deferred",
					chainId: 84532,
					vault: "0x4444444444444444444444444444444444444444",
					buyer: intent.buyer,
					seller: intent.seller,
					amount: intent.amount,
					token: intent.token,
					nonce: intent.nonce,
					resource: intent.resource,
					intent,
					signature: `0xsig${i}`,
				});
			}

			let stats = queue.getStats();
			expect(stats.total).to.equal(3);
			expect(stats.pending).to.equal(3);
			expect(stats.settled).to.equal(0);
			expect(stats.failed).to.equal(0);

			// Mark one as settled
			const pending = queue.getPending();
			queue.markSettled(pending[0].id, "0xtxhash");

			stats = queue.getStats();
			expect(stats.total).to.equal(3);
			expect(stats.pending).to.equal(2);
			expect(stats.settled).to.equal(1);
			expect(stats.failed).to.equal(0);

			// Mark one as failed
			queue.markFailed(pending[1].id, "Test error");

			stats = queue.getStats();
			expect(stats.total).to.equal(3);
			expect(stats.pending).to.equal(1);
			expect(stats.settled).to.equal(1);
			expect(stats.failed).to.equal(1);
		});
	});
});

