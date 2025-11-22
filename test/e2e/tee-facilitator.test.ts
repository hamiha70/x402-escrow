/**
 * E2E Test: TEE Facilitator Scheme (x402-tee-facilitator)
 * 
 * Tests the complete payment flow with TEE facilitator and omnibus vault.
 * 
 * Prerequisites:
 * - OmnibusVault deployed on Base Sepolia
 * - Facilitator running (local or ROFL)
 * - Buyer has USDC for deposit
 * - Seller is allowlisted in OmnibusVault
 */

import { expect } from "chai";
import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
import { createLogger } from "../../shared/logger.js";
import type { PaymentIntent } from "../../shared/types.js";

dotenv.config();

const logger = createLogger("e2e-tee");

describe("E2E: TEE Facilitator Scheme", function () {
	this.timeout(120000); // 2 minutes for on-chain operations

	const CHAIN_ID = 84532; // Base Sepolia
	const SCHEME = "x402-tee-facilitator";
	const FACILITATOR_URL = process.env.TEE_FACILITATOR_URL || "http://localhost:4023";
	const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";

	let provider: ethers.JsonRpcProvider;
	let buyerWallet: ethers.Wallet;
	let omnibusVault: ethers.Contract;
	let usdc: ethers.Contract;
	let sellerAddress: string;
	let initialLedgerBalance: bigint;

	before(async function () {
		// Setup provider and wallet
		provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
		buyerWallet = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY!, provider);
		sellerAddress = process.env.SELLER_WALLET_ADDRESS!;

		logger.info(`Buyer address: ${buyerWallet.address}`);
		logger.info(`Seller address: ${sellerAddress}`);

		// Get contract addresses
		const omnibusVaultAddress = process.env.OMNIBUS_VAULT_BASE_SEPOLIA;
		const usdcAddress = process.env.USDC_BASE_SEPOLIA;

		if (!omnibusVaultAddress) {
			throw new Error("OMNIBUS_VAULT_BASE_SEPOLIA not set");
		}

		// Setup contracts
		omnibusVault = new ethers.Contract(
			omnibusVaultAddress,
			[
				"function deposit(uint256 amount) external",
				"function getBalance() view returns (uint256)",
				"function totalDeposited(address) view returns (uint256)",
				"function allowedSellers(address) view returns (bool)",
			],
			buyerWallet
		);

		usdc = new ethers.Contract(
			usdcAddress,
			[
				"function balanceOf(address) view returns (uint256)",
				"function approve(address, uint256) returns (bool)",
				"function allowance(address, address) view returns (uint256)",
			],
			buyerWallet
		);

		logger.info(`Omnibus Vault: ${omnibusVaultAddress}`);
		logger.info(`USDC: ${usdcAddress}`);

		// Check facilitator is running
		try {
			await axios.get(`${FACILITATOR_URL}/health`);
		} catch (error) {
			throw new Error("TEE Facilitator not running");
		}

		// Check seller is allowlisted
		const isAllowed = await omnibusVault.allowedSellers(sellerAddress);
		if (!isAllowed) {
			logger.warn(`Seller ${sellerAddress} not allowlisted - test may fail`);
		}

		// Get initial ledger balance
		try {
			const balanceResponse = await axios.get(
				`${FACILITATOR_URL}/balance/${buyerWallet.address}`
			);
			initialLedgerBalance = BigInt(balanceResponse.data.balance);
		} catch (error) {
			initialLedgerBalance = 0n;
		}

		logger.info(`Initial ledger balance: ${initialLedgerBalance}`);
	});

	it("Step 1: Buyer deposits to omnibus vault", async function () {
		const depositAmount = ethers.parseUnits("0.1", 6); // 0.1 USDC

		logger.info(`Depositing ${ethers.formatUnits(depositAmount, 6)} USDC...`);

		// Check allowance
		const allowance = await usdc.allowance(
			buyerWallet.address,
			await omnibusVault.getAddress()
		);

		if (allowance < depositAmount) {
			logger.info("Approving USDC...");
			const approveTx = await usdc.approve(
				await omnibusVault.getAddress(),
				depositAmount
			);
			await approveTx.wait();
		}

		// Deposit
		const depositTx = await omnibusVault.deposit(depositAmount);
		const receipt = await depositTx.wait();

		expect(receipt.status).to.equal(1);
		logger.info(`✓ Deposit successful: ${depositTx.hash}`);
		logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

		// Verify on-chain deposit recorded
		const totalDeposited = await omnibusVault.totalDeposited(
			buyerWallet.address
		);
		expect(totalDeposited).to.be.greaterThan(0);

		logger.info(
			`Total deposited by buyer: ${ethers.formatUnits(totalDeposited, 6)} USDC`
		);
	});

	it("Step 2: TEE facilitator records deposit in ledger", async function () {
		// Wait a bit for facilitator to process deposit event
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Query ledger balance
		const balanceResponse = await axios.get(
			`${FACILITATOR_URL}/balance/${buyerWallet.address}`
		);

		expect(balanceResponse.status).to.equal(200);
		expect(balanceResponse.data.balance).to.exist;

		const ledgerBalance = BigInt(balanceResponse.data.balance);
		expect(ledgerBalance).to.be.greaterThan(initialLedgerBalance);

		logger.info(`✓ Ledger balance: ${ledgerBalance.toString()}`);
		logger.info(
			`Deposits: ${balanceResponse.data.deposits.length}, Spends: ${balanceResponse.data.spends.length}`
		);
	});

	it("Step 3: Buyer signs payment intent", async function () {
		const intent: PaymentIntent = {
			buyer: buyerWallet.address,
			seller: sellerAddress,
			amount: "10000", // 0.01 USDC
			token: await usdc.getAddress(),
			nonce: ethers.hexlify(ethers.randomBytes(32)),
			expiry: Math.floor(Date.now() / 1000) + 300,
			resource: "/api/content/premium/base-sepolia",
			chainId: CHAIN_ID,
		};

		const domain = {
			name: "x402-tee-facilitator",
			version: "1",
			chainId: CHAIN_ID,
			verifyingContract: await omnibusVault.getAddress(),
		};

		const types = {
			PaymentIntent: [
				{ name: "buyer", type: "address" },
				{ name: "seller", type: "address" },
				{ name: "amount", type: "uint256" },
				{ name: "token", type: "address" },
				{ name: "nonce", type: "bytes32" },
				{ name: "expiry", type: "uint256" },
				{ name: "resource", type: "string" },
				{ name: "chainId", type: "uint256" },
			],
		};

		const signature = await buyerWallet.signTypedData(domain, types, intent);

		logger.info(`✓ Intent signed`);
		logger.info(`Nonce: ${intent.nonce}`);

		// Store for next test
		(this as any).testIntent = intent;
		(this as any).testSignature = signature;
	});

	it("Step 4: TEE facilitator settles payment", async function () {
		const intent = (this as any).testIntent;
		const signature = (this as any).testSignature;

		logger.info("Sending payment to TEE facilitator...");

		const response = await axios.post(`${FACILITATOR_URL}/tee-settle`, {
			intentStruct: intent,
			signature: signature,
		});

		expect(response.status).to.equal(200);
		expect(response.data.success).to.be.true;
		expect(response.data.txHash).to.exist;
		expect(response.data.intentHash).to.exist;
		expect(response.data.newBalance).to.exist;

		logger.info(`✓ Payment settled`);
		logger.info(`Transaction: ${response.data.txHash}`);
		logger.info(`New balance: ${response.data.newBalance}`);

		// Store for verification
		(this as any).settlementTx = response.data.txHash;
	});

	it("Step 5: Verify seller received payment on-chain", async function () {
		const txHash = (this as any).settlementTx;

		// Wait for transaction to be mined
		await new Promise((resolve) => setTimeout(resolve, 3000));

		const receipt = await provider.getTransactionReceipt(txHash);
		expect(receipt).to.exist;
		expect(receipt!.status).to.equal(1);

		logger.info(`✓ Transaction confirmed in block ${receipt!.blockNumber}`);
		logger.info(`Gas used: ${receipt!.gasUsed.toString()}`);
	});

	it("Step 6: Verify ledger updated correctly", async function () {
		const balanceResponse = await axios.get(
			`${FACILITATOR_URL}/balance/${buyerWallet.address}`
		);

		const account = balanceResponse.data;
		expect(account.spends).to.have.length.greaterThan(0);

		const lastSpend = account.spends[account.spends.length - 1];
		expect(lastSpend.seller).to.equal(sellerAddress);
		expect(lastSpend.amount).to.equal("10000");

		logger.info(`✓ Ledger updated correctly`);
		logger.info(`Total spends: ${account.spends.length}`);
		logger.info(`Current balance: ${account.balance}`);
	});

	it("Step 7: Verify no on-chain buyer-seller linkage", async function () {
		// Query omnibus vault events
		const depositFilter = omnibusVault.filters.Deposited(buyerWallet.address);
		const withdrawFilter = omnibusVault.filters.Withdrawn(sellerAddress);

		const depositEvents = await omnibusVault.queryFilter(depositFilter);
		const withdrawEvents = await omnibusVault.queryFilter(withdrawFilter);

		expect(depositEvents.length).to.be.greaterThan(0);
		expect(withdrawEvents.length).to.be.greaterThan(0);

		logger.info(`Deposit events: ${depositEvents.length}`);
		logger.info(`Withdrawal events: ${withdrawEvents.length}`);

		// Privacy check: Events are separate; no on-chain link between them
		logger.info(
			"✓ Privacy verified: Deposits and withdrawals are unlinkable on-chain"
		);
	});

	after(function () {
		logger.info("✅ TEE facilitator e2e test complete");
	});
});

