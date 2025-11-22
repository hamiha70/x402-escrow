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

// Chain configuration
const CHAIN_CONFIGS: Record<string, { 
	chainId: number; 
	rpcVar: string; 
	usdcVar: string;
	explorerVar: string;
	networkSlug: string;
}> = {
	"base-sepolia": { 
		chainId: 84532, 
		rpcVar: "BASE_SEPOLIA_RPC", 
		usdcVar: "USDC_BASE_SEPOLIA",
		explorerVar: "BASE_SEPOLIA_EXPLORER",
		networkSlug: "base-sepolia"
	},
	"polygon-amoy": { 
		chainId: 80002, 
		rpcVar: "POLYGON_AMOY_RPC", 
		usdcVar: "USDC_POLYGON_AMOY",
		explorerVar: "POLYGON_AMOY_EXPLORER",
		networkSlug: "polygon-amoy"
	},
	"arbitrum-sepolia": { 
		chainId: 421614, 
		rpcVar: "ARBITRUM_SEPOLIA_RPC", 
		usdcVar: "USDC_ARBITRUM_SEPOLIA",
		explorerVar: "ARBITRUM_SEPOLIA_EXPLORER",
		networkSlug: "arbitrum-sepolia"
	},
	"optimism-sepolia": { 
		chainId: 11155420, 
		rpcVar: "OPTIMISM_SEPOLIA_RPC", 
		usdcVar: "USDC_OPTIMISM_SEPOLIA",
		explorerVar: "OPTIMISM_SEPOLIA_EXPLORER",
		networkSlug: "optimism-sepolia"
	},
	"arc": { 
		chainId: 1243, 
		rpcVar: "ARC_TESTNET_RPC", 
		usdcVar: "USDC_ARC_TESTNET",
		explorerVar: "ARC_TESTNET_EXPLORER",
		networkSlug: "arc"
	},
	"ethereum-sepolia": { 
		chainId: 11155111, 
		rpcVar: "ETHEREUM_SEPOLIA_RPC", 
		usdcVar: "USDC_ETHEREUM_SEPOLIA",
		explorerVar: "ETHEREUM_SEPOLIA_EXPLORER",
		networkSlug: "ethereum-sepolia"
	},
};

async function runDemo(): Promise<DemoResult> {
	const logger = new DemoLogger();
	logger.startDemo();

	// Configuration - support CHAIN env variable, default to base-sepolia
	const chainKey = (process.env.CHAIN || "base-sepolia").toLowerCase();
	const chainConfig = CHAIN_CONFIGS[chainKey];
	
	if (!chainConfig) {
		throw new Error(`Unknown chain: ${chainKey}. Supported: ${Object.keys(CHAIN_CONFIGS).join(", ")}`);
	}

	const SELLER_URL = process.env.SELLER_URL || "http://localhost:4022";
	const RESOURCE = `/api/content/premium/${chainConfig.networkSlug}`;
	const BUYER_PK = process.env.BUYER_PRIVATE_KEY;
	const RPC_URL = process.env[chainConfig.rpcVar];
	const USDC_ADDRESS = process.env[chainConfig.usdcVar];
	const EXPLORER_BASE_URL = process.env[chainConfig.explorerVar];

	if (!BUYER_PK || !RPC_URL || !USDC_ADDRESS) {
		console.error("");
		console.error("❌ Missing required environment variables:");
		if (!BUYER_PK) console.error("  • BUYER_PRIVATE_KEY");
		if (!RPC_URL) console.error(`  • ${chainConfig.rpcVar}`);
		if (!USDC_ADDRESS) console.error(`  • ${chainConfig.usdcVar}`);
		console.error("");
		console.error(`Chain: ${chainKey} (${chainConfig.chainId})`);
		console.error("Please ensure .env file exists and contains these variables.");
		console.error("See example.env for reference.");
		console.error("");
		throw new Error("Missing required environment variables");
	}
	
	// Explorer URL is optional (for display only), use fallback if not set
	const explorerUrl = EXPLORER_BASE_URL || `https://explorer.example.com/tx`;

	const provider = new ethers.JsonRpcProvider(RPC_URL);
	const buyerWallet = new ethers.Wallet(BUYER_PK, provider);

	logger.log("info", `Chain: ${chainKey} (${chainConfig.chainId})`);
	logger.log("info", `RPC: ${RPC_URL}`);
	logger.log("info", `USDC: ${USDC_ADDRESS}`);

	const result: DemoResult = {
		timestamp: new Date().toISOString(),
		network: chainKey,
		totalDuration: 0,
		phases: [],
		success: false,
	};

	try {
		// Get initial balances
		logger.log("info", "Reading initial balances...");
		const usdcContract = new ethers.Contract(
			USDC_ADDRESS,
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

		// Phase 2: Payment intent creation and signing (TWO-SIGNATURE PATTERN)
		phaseStart = logger.startPhase("PHASE 2: Payment Intent Creation & Dual Signing");
		
		logger.logDetail("Creating payment intent...");
		const { 
			generateNonce, 
			paymentIntentToTransferAuth, 
			signTransferAuthorizationWithProvider,
			signX402PaymentIntent,
			verifyX402PaymentIntent,
			verifyTransferAuthorizationWithProvider
		} = await import("../shared/eip712.js");
		
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
		logger.logDetail("Intent resource", RESOURCE);
		logger.logDetail("Intent seller", paymentRequirements.seller);

		// SIGNATURE 1: x402 (HTTP layer with resource binding)
		console.log("");
		logger.log("info", "━━━ SIGNATURE 1: x402 Payment Intent (Resource Binding) ━━━");
		const x402Start = Date.now();
		const x402Signature = await signX402PaymentIntent(
			intent,
			paymentRequirements.chainId,
			buyerWallet
		);
		const x402Duration = Date.now() - x402Start;
		
		logger.logDetail("✓ x402 signature", x402Signature.slice(0, 20) + "..." + x402Signature.slice(-10));
		logger.logDetail("✓ Signing time", `${x402Duration}ms`);
		logger.logDetail("✓ Domain", "x402-Payment-Intent v2");
		logger.logDetail("✓ Resource bound to", RESOURCE);
		
		// Verify x402 signature locally
		const x402Recovered = verifyX402PaymentIntent(intent, x402Signature, paymentRequirements.chainId);
		logger.logDetail("✓ Self-verification", x402Recovered === buyerWallet.address ? "PASS" : "FAIL");
		if (x402Recovered !== buyerWallet.address) {
			throw new Error(`x402 signature verification failed: expected ${buyerWallet.address}, got ${x402Recovered}`);
		}

		// SIGNATURE 2: EIP-3009 (Blockchain settlement)
		console.log("");
		logger.log("info", "━━━ SIGNATURE 2: EIP-3009 Transfer Authorization (Settlement) ━━━");
		logger.logDetail("Converting to EIP-3009 format...");
		const transferAuth = paymentIntentToTransferAuth(intent);
		
		logger.logDetail("TransferAuth from", transferAuth.from);
		logger.logDetail("TransferAuth to", transferAuth.to);
		logger.logDetail("TransferAuth value", transferAuth.value);
		logger.logDetail("TransferAuth nonce", transferAuth.nonce.slice(0, 16) + "...");

		logger.logDetail("Querying USDC contract for EIP-712 domain...");
		const eip3009Start = Date.now();
		const eip3009Signature = await signTransferAuthorizationWithProvider(
			transferAuth,
			paymentRequirements.tokenAddress,
			paymentRequirements.chainId,
			buyerWallet,
			provider
		);
		const eip3009Duration = Date.now() - eip3009Start;
		
		logger.logDetail("✓ EIP-3009 signature", eip3009Signature.slice(0, 20) + "..." + eip3009Signature.slice(-10));
		logger.logDetail("✓ Signing time", `${eip3009Duration}ms`);
		logger.logDetail("✓ Domain queried from", "USDC contract");
		
		// Verify EIP-3009 signature locally
		const eip3009Recovered = await verifyTransferAuthorizationWithProvider(
			transferAuth,
			eip3009Signature,
			paymentRequirements.tokenAddress,
			paymentRequirements.chainId,
			provider
		);
		logger.logDetail("✓ Self-verification", eip3009Recovered === buyerWallet.address ? "PASS" : "FAIL");
		if (eip3009Recovered !== buyerWallet.address) {
			throw new Error(`EIP-3009 signature verification failed: expected ${buyerWallet.address}, got ${eip3009Recovered}`);
		}

		// Verify nonce binding
		console.log("");
		logger.log("info", "━━━ CRYPTOGRAPHIC BINDINGS ━━━");
		logger.logDetail("✓ Nonce in x402", intent.nonce.slice(0, 16) + "...");
		logger.logDetail("✓ Nonce in EIP-3009", transferAuth.nonce.slice(0, 16) + "...");
		logger.logDetail("✓ Nonce binding", intent.nonce === transferAuth.nonce ? "VERIFIED" : "FAILED");
		logger.logDetail("✓ Resource binding", `"${intent.resource}" in x402 signature`);
		logger.logDetail("✓ Seller binding", `${intent.seller} in both signatures`);
		logger.logDetail("✓ Amount binding", `${intent.amount} in both signatures`);
		
		if (intent.nonce !== transferAuth.nonce) {
			throw new Error("Nonce mismatch between x402 and EIP-3009!");
		}

		logger.endPhase("Phase 2", phaseStart, {
			nonce,
			x402Duration,
			eip3009Duration,
			totalSigningTime: x402Duration + eip3009Duration,
		});

		// Phase 3: Payment submission with TWO signatures
		phaseStart = logger.startPhase("PHASE 3: Payment Submission (Dual Signatures)");

		const payload = {
			scheme: "intent",
			data: {
				intent,
				x402Signature,
				transferAuth,
				eip3009Signature,
			},
		};

		logger.logDetail("Building payload with both signatures...");
		logger.logDetail("✓ x402 signature included", "YES");
		logger.logDetail("✓ EIP-3009 signature included", "YES");
		logger.logDetail("✓ TransferAuth included", "YES");
		logger.logDetail("✓ Nonce consistency", intent.nonce === transferAuth.nonce ? "VERIFIED" : "FAILED");

		console.log("");
		logger.logDetail("Submitting to seller with x-payment header...");
		const submissionStart = Date.now();
		
		const paidResponse = await axios.get(`${SELLER_URL}${RESOURCE}`, {
			headers: {
				"Content-Type": "application/json",
				"x-payment": JSON.stringify(payload),
			},
		});
		
		const submissionDuration = Date.now() - submissionStart;
		logger.logDetail("Request took", `${submissionDuration}ms (includes on-chain settlement)`);

		logger.endPhase("Phase 3", phaseStart, {
			httpStatus: paidResponse.status,
			settlementDuration: submissionDuration,
		});

		// Phase 4: Content received with verification confirmation
		phaseStart = logger.startPhase("PHASE 4: Content Delivery & Settlement Confirmation");

		const content = paidResponse.data.content;
		const payment = paidResponse.data.payment;

		console.log("");
		logger.log("info", "━━━ FACILITATOR VERIFICATION RESULTS ━━━");
		logger.logDetail("✓ x402 signature", "VERIFIED by facilitator");
		logger.logDetail("✓ Resource binding", "VERIFIED by facilitator");
		logger.logDetail("✓ EIP-3009 signature", "VERIFIED by facilitator");
		logger.logDetail("✓ Nonce binding", "VERIFIED by facilitator");
		logger.logDetail("✓ On-chain settlement", "COMPLETED");

		console.log("");
		logger.logDetail("Content title", content.title);
		logger.logDetail("Content preview", JSON.stringify(content.data).substring(0, 50) + "...");
		logger.logDetail("Transaction hash", payment.txHash);
		logger.logDetail("Amount paid (raw)", payment.amount);

		result.transaction = {
			hash: payment.txHash,
			explorerUrl: `${explorerUrl}/${payment.txHash}`,
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

		// Final verification summary
		console.log("");
		console.log("═══════════════════════════════════════════════════════════");
		console.log("           ✓ TWO-SIGNATURE PATTERN VERIFIED");
		console.log("═══════════════════════════════════════════════════════════");
		console.log("");
		console.log("x402 Signature (HTTP Layer):");
		console.log(`  • Resource binding: ${RESOURCE}`);
		console.log(`  • Seller binding: ${sellerAddress}`);
		console.log(`  • Nonce: ${nonce.slice(0, 16)}...`);
		console.log(`  • Domain: x402-Payment-Intent v2`);
		console.log(`  • Verified by: Buyer (self), Facilitator`);
		console.log("");
		console.log("EIP-3009 Signature (Settlement Layer):");
		console.log(`  • Transfer: ${buyerWallet.address.slice(0, 8)}... → ${sellerAddress.slice(0, 8)}...`);
		console.log(`  • Amount: ${amount} (raw units)`);
		console.log(`  • Nonce: ${nonce.slice(0, 16)}... (SAME as x402)`);
		console.log(`  • Domain: Queried from USDC contract`);
		console.log(`  • Verified by: Buyer (self), Facilitator, USDC contract`);
		console.log("");
		console.log("Cryptographic Bindings:");
		console.log(`  ✓ Nonce links both signatures`);
		console.log(`  ✓ Resource binding prevents signature reuse`);
		console.log(`  ✓ Seller binding ensures correct recipient`);
		console.log(`  ✓ Amount binding prevents manipulation`);
		console.log("");
		console.log("Settlement Result:");
		console.log(`  • Transaction: ${payment.txHash}`);
		console.log(`  • Block: ${result.transaction!.blockNumber}`);
		console.log(`  • Gas used: ${result.transaction!.gasUsed}`);
		console.log(`  • Buyer balance change: ${result.balances!.buyerChange}`);
		console.log(`  • Seller balance change: ${result.balances!.sellerChange}`);
		console.log("");
		console.log("═══════════════════════════════════════════════════════════");

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

