/**
 * x402 Protocol Demo Script - EXACT SCHEME
 * 
 * Demonstrates the "x402-exact" synchronous settlement flow with detailed logging and timing:
 * 1. Initial request without payment → 402
 * 2. Payment intent creation and signing
 * 3. Payment submission with signature
 * 4. On-chain settlement
 * 5. Content delivery
 * 
 * Captures timing for each phase and saves results to demo-results.json
 */

import axios from "axios";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { writeFileSync } from "fs";

dotenv.config();

// ANSI colors for terminal output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
};

interface TimingResult {
	phase: string;
	startTime: number;
	endTime: number;
	duration: number;
	details?: any;
}

interface DemoResult {
	timestamp: string;
	network: string;
	totalDuration: number;
	phases: TimingResult[];
	transaction?: {
		hash: string;
		explorerUrl: string;
		blockNumber?: number;
		gasUsed?: string;
	};
	balances?: {
		before: { buyer: string; seller: string };
		after: { buyer: string; seller: string };
	};
	success: boolean;
	error?: string;
}

class DemoLogger {
	private timings: TimingResult[] = [];
	private startTime: number = 0;

	startDemo() {
		this.startTime = Date.now();
		this.log("header", "════════════════════════════════════════════════════");
		this.log("header", "   x402 PAYMENT PROTOCOL - LIVE DEMO");
		this.log("header", "   SCHEME: x402-exact (Synchronous EIP-3009)");
		this.log("header", "════════════════════════════════════════════════════");
		console.log();
	}

	log(level: "info" | "success" | "error" | "header" | "phase" | "detail", message: string) {
		const timestamp = `[${new Date().toISOString()}]`;
		
		switch (level) {
			case "header":
				console.log(`${colors.bright}${colors.cyan}${message}${colors.reset}`);
				break;
			case "phase":
				console.log(`\n${colors.bright}${colors.magenta}▶ ${message}${colors.reset}`);
				break;
			case "success":
				console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.green}✓ ${message}${colors.reset}`);
				break;
			case "error":
				console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.red}✗ ${message}${colors.reset}`);
				break;
			case "detail":
				console.log(`${colors.dim}  ${message}${colors.reset}`);
				break;
			default:
				console.log(`${colors.dim}${timestamp}${colors.reset} ${message}`);
		}
	}

	startPhase(name: string): number {
		this.log("phase", name);
		return Date.now();
	}

	endPhase(name: string, startTime: number, details?: any) {
		const endTime = Date.now();
		const duration = endTime - startTime;
		
		this.timings.push({
			phase: name,
			startTime,
			endTime,
			duration,
			details,
		});

		this.log("success", `Completed in ${duration}ms`);
		return duration;
	}

	logDetail(message: string, value?: any) {
		if (value !== undefined) {
			this.log("detail", `${message}: ${JSON.stringify(value, null, 2)}`);
		} else {
			this.log("detail", message);
		}
	}

	getTotalDuration(): number {
		return Date.now() - this.startTime;
	}

	getTimings(): TimingResult[] {
		return this.timings;
	}

	printSummary(result: DemoResult) {
		console.log();
		this.log("header", "════════════════════════════════════════════════════");
		this.log("header", "   DEMO SUMMARY");
		this.log("header", "════════════════════════════════════════════════════");
		console.log();

		if (result.success) {
			this.log("success", `Total Duration: ${result.totalDuration}ms (${(result.totalDuration / 1000).toFixed(2)}s)`);
			console.log();

			this.log("info", "Phase Breakdown:");
			result.phases.forEach((phase) => {
				const percentage = ((phase.duration / result.totalDuration) * 100).toFixed(1);
				console.log(`  ${colors.cyan}${phase.phase.padEnd(35)}${colors.reset} ${phase.duration.toString().padStart(6)}ms  (${percentage.padStart(5)}%)`);
			});

			if (result.transaction) {
				console.log();
				this.log("info", "Transaction:");
				this.logDetail("Hash", result.transaction.hash);
				this.logDetail("Explorer", result.transaction.explorerUrl);
				if (result.transaction.blockNumber) {
					this.logDetail("Block", result.transaction.blockNumber);
				}
				if (result.transaction.gasUsed) {
					this.logDetail("Gas Used", result.transaction.gasUsed);
				}
			}

			if (result.balances) {
				console.log();
				this.log("info", "Balance Changes:");
				this.logDetail("Buyer:  ", `${result.balances.before.buyer} → ${result.balances.after.buyer} USDC`);
				this.logDetail("Seller: ", `${result.balances.before.seller} → ${result.balances.after.seller} USDC`);
			}
		} else {
			this.log("error", `Demo failed: ${result.error}`);
		}

		console.log();
		this.log("header", "════════════════════════════════════════════════════");
	}
}

async function runDemo(): Promise<DemoResult> {
	const logger = new DemoLogger();
	logger.startDemo();

	// Configuration
	const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
	const RESOURCE = "/api/content/premium";
	const BUYER_PK = process.env.BUYER_PRIVATE_KEY;
	const RPC_URL = process.env.BASE_SEPOLIA_RPC;

	if (!BUYER_PK || !RPC_URL) {
		console.error("");
		console.error("❌ Missing required environment variables:");
		if (!BUYER_PK) console.error("  • BUYER_PRIVATE_KEY");
		if (!RPC_URL) console.error("  • BASE_SEPOLIA_RPC");
		console.error("");
		console.error("Please ensure .env file exists and contains these variables.");
		console.error("See example.env for reference.");
		console.error("");
		throw new Error("Missing required environment variables");
	}

	const provider = new ethers.JsonRpcProvider(RPC_URL);
	const buyerWallet = new ethers.Wallet(BUYER_PK, provider);

	const result: DemoResult = {
		timestamp: new Date().toISOString(),
		network: "base-sepolia",
		totalDuration: 0,
		phases: [],
		success: false,
	};

	try {
		// Get initial balances
		logger.log("info", "Reading initial balances...");
		const usdcAddress = process.env.USDC_BASE_SEPOLIA!;
		const usdcContract = new ethers.Contract(
			usdcAddress,
			["function balanceOf(address) view returns (uint256)"],
			provider
		);

		const buyerBalanceBefore = await usdcContract.balanceOf(buyerWallet.address);
		const sellerAddress = process.env.SELLER_WALLET_ADDRESS!;
		const sellerBalanceBefore = await usdcContract.balanceOf(sellerAddress);

		result.balances = {
			before: {
				buyer: ethers.formatUnits(buyerBalanceBefore, 6),
				seller: ethers.formatUnits(sellerBalanceBefore, 6),
			},
			after: { buyer: "0", seller: "0" },
		};

		logger.logDetail("Buyer balance", `${result.balances.before.buyer} USDC`);
		logger.logDetail("Seller balance", `${result.balances.before.seller} USDC`);

		// Phase 1: Initial request without payment
		let phaseStart = logger.startPhase("PHASE 1: Initial Request (No Payment)");
		logger.logDetail("Requesting", `${SELLER_URL}${RESOURCE}`);

		let response;
		try {
			response = await axios.get(`${SELLER_URL}${RESOURCE}`);
			throw new Error("Expected 402, got 200");
		} catch (error: any) {
			if (error.response?.status !== 402) {
				throw error;
			}
			response = error.response;
		}

		logger.logDetail("Received", "HTTP 402 Payment Required");
		const paymentRequirements = response.data.PaymentRequirements?.[0];
		if (!paymentRequirements) {
			throw new Error("Invalid 402 response: missing PaymentRequirements");
		}
		logger.logDetail("Amount required", `${paymentRequirements.amount} ${paymentRequirements.token}`);
		logger.logDetail("Seller", paymentRequirements.seller);
		logger.logDetail("Facilitator", paymentRequirements.facilitator);

		logger.endPhase("Phase 1", phaseStart, {
			status: 402,
			paymentRequired: true,
		});

		// Phase 2: Payment intent creation and signing
		phaseStart = logger.startPhase("PHASE 2: Payment Intent Creation & Signing");
		
		logger.logDetail("Creating payment intent...");
		const { generateNonce, paymentIntentToTransferAuth, signTransferAuthorizationWithProvider } = 
			await import("../shared/eip712.js");
		
		const nonce = generateNonce();
		const expiry = Math.floor(Date.now() / 1000) + 180;
		const amount = String(Number(paymentRequirements.amount) * 10 ** paymentRequirements.decimals);

		const intent = {
			seller: paymentRequirements.seller,
			buyer: buyerWallet.address,
			amount,
			token: paymentRequirements.tokenAddress,
			nonce,
			expiry,
			resource: RESOURCE,
			chainId: paymentRequirements.chainId,
		};

		logger.logDetail("Intent nonce", nonce.slice(0, 16) + "...");
		logger.logDetail("Intent amount (raw)", amount);
		logger.logDetail("Intent expiry", new Date(expiry * 1000).toISOString());

		logger.logDetail("Converting to EIP-3009 format...");
		const transferAuth = paymentIntentToTransferAuth(intent);

		logger.logDetail("Querying USDC contract for EIP-712 domain...");
		const domainQueryStart = Date.now();
		const signature = await signTransferAuthorizationWithProvider(
			transferAuth,
			paymentRequirements.tokenAddress,
			paymentRequirements.chainId,
			buyerWallet,
			provider
		);
		const domainQueryDuration = Date.now() - domainQueryStart;
		
		logger.logDetail("Domain query took", `${domainQueryDuration}ms`);
		logger.logDetail("Signature", signature.slice(0, 20) + "..." + signature.slice(-10));

		logger.endPhase("Phase 2", phaseStart, {
			nonce,
			signatureDuration: domainQueryDuration,
		});

		// Phase 3: Payment submission with signature
		phaseStart = logger.startPhase("PHASE 3: Payment Submission");

		const payload = {
			scheme: "intent",
			data: {
				intent,
				signature,
			},
			metadata: {
				network: paymentRequirements.network,
				token: paymentRequirements.token,
			},
		};

		logger.logDetail("Submitting to seller with X-Payment header...");
		const submissionStart = Date.now();
		
		const paidResponse = await axios.get(`${SELLER_URL}${RESOURCE}`, {
			headers: {
				"Content-Type": "application/json",
				"X-Payment": JSON.stringify(payload),
			},
		});
		
		const submissionDuration = Date.now() - submissionStart;
		logger.logDetail("Request took", `${submissionDuration}ms (includes on-chain settlement)`);

		logger.endPhase("Phase 3", phaseStart, {
			httpStatus: paidResponse.status,
			settlementDuration: submissionDuration,
		});

		// Phase 4: Content received
		phaseStart = logger.startPhase("PHASE 4: Content Delivery");

		const content = paidResponse.data.content;
		const payment = paidResponse.data.payment;

		logger.logDetail("Content title", content.title);
		logger.logDetail("Transaction hash", payment.txHash);
		logger.logDetail("Amount paid (raw)", payment.amount);

		result.transaction = {
			hash: payment.txHash,
			explorerUrl: `https://sepolia.basescan.org/tx/${payment.txHash}`,
		};

		logger.endPhase("Phase 4", phaseStart);

		// Phase 5: Verify on-chain
		phaseStart = logger.startPhase("PHASE 5: On-Chain Verification");

		logger.logDetail("Fetching transaction receipt...");
		const receipt = await provider.getTransactionReceipt(payment.txHash);
		
		if (receipt) {
			logger.logDetail("Block number", receipt.blockNumber);
			logger.logDetail("Gas used", receipt.gasUsed.toString());
			logger.logDetail("Status", receipt.status === 1 ? "Success" : "Failed");

			result.transaction!.blockNumber = receipt.blockNumber;
			result.transaction!.gasUsed = receipt.gasUsed.toString();
		}

		// Get final balances
		logger.logDetail("Reading final balances...");
		const buyerBalanceAfter = await usdcContract.balanceOf(buyerWallet.address);
		const sellerBalanceAfter = await usdcContract.balanceOf(sellerAddress);

		result.balances!.after = {
			buyer: ethers.formatUnits(buyerBalanceAfter, 6),
			seller: ethers.formatUnits(sellerBalanceAfter, 6),
		};

		const buyerDiff = Number(result.balances!.after.buyer) - Number(result.balances!.before.buyer);
		const sellerDiff = Number(result.balances!.after.seller) - Number(result.balances!.before.seller);

		logger.logDetail("Buyer change", `${buyerDiff > 0 ? "+" : ""}${buyerDiff.toFixed(6)} USDC`);
		logger.logDetail("Seller change", `${sellerDiff > 0 ? "+" : ""}${sellerDiff.toFixed(6)} USDC`);

		logger.endPhase("Phase 5", phaseStart);

		// Success!
		result.success = true;
		result.totalDuration = logger.getTotalDuration();
		result.phases = logger.getTimings();

	} catch (error: any) {
		result.success = false;
		result.error = error.message;
		result.totalDuration = logger.getTotalDuration();
		result.phases = logger.getTimings();
		
		logger.log("error", `Demo failed: ${error.message}`);
		if (error.response) {
			logger.logDetail("HTTP Status", error.response.status);
			logger.logDetail("Response", JSON.stringify(error.response.data, null, 2));
		}
	}

	logger.printSummary(result);

	// Save results
	const resultsFile = "demo-results-exact.json";
	writeFileSync(resultsFile, JSON.stringify(result, null, 2));
	logger.log("info", `Results saved to ${resultsFile}`);

	return result;
}

// Run demo
runDemo()
	.then((result) => {
		process.exit(result.success ? 0 : 1);
	})
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});

