/**
 * Flow orchestrator for demo UI
 * Runs buyer/seller/facilitator interactions and emits events for visualization
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import type { NetworkConfig } from "./networks.js";
import { createLogger } from "../shared/logger.js";
import type { PaymentRequirements, PaymentIntent } from "../shared/types.js";
import { signPaymentIntent, signTransferAuthorization } from "../shared/eip712.js";

dotenv.config();

const logger = createLogger("orchestrator");

// Demo event types
export type DemoEventRole = "buyer" | "facilitator" | "seller";

export type DemoEvent =
	| { type: "step"; step: number; description: string; role: DemoEventRole; timestamp: number }
	| {
			type: "http-request";
			method: string;
			url: string;
			headers: Record<string, string>;
			body?: any;
			role: DemoEventRole;
			timestamp: number;
	  }
	| {
			type: "http-response";
			status: number;
			headers?: Record<string, string>;
			body: any;
			role: DemoEventRole;
			timestamp: number;
	  }
	| {
			type: "signing";
			message: string;
			signer: string;
			data?: any;
			role: DemoEventRole;
			timestamp: number;
	  }
	| {
			type: "transaction";
			hash: string;
			explorer: string;
			status: "pending" | "confirmed";
			gasUsed?: string;
			role: DemoEventRole;
			timestamp: number;
	  }
	| { 
			type: "complete"; 
			result: any; 
			metrics: any; 
			timing: {
				requestToService: number;
				requestToPay: number | string;
				totalTime: number;
			};
			timestamp: number 
	  }
	| { type: "error"; message: string; timestamp: number };

/**
 * Run x402-exact payment flow
 */
export async function runExactFlow(
	networkConfig: NetworkConfig,
	emitEvent: (event: DemoEvent) => void
): Promise<void> {
	const startTime = Date.now();
	let serviceDeliveredTime = 0;
	let settlementTime = 0;

	try {
		// Validate environment variables
		const requiredEnvVars = {
			BUYER_PRIVATE_KEY: process.env.BUYER_PRIVATE_KEY,
			BUYER_WALLET_ADDRESS: process.env.BUYER_WALLET_ADDRESS,
			SELLER_WALLET_ADDRESS: process.env.SELLER_WALLET_ADDRESS,
			FACILITATOR_PRIVATE_KEY: process.env.FACILITATOR_PRIVATE_KEY,
		};

		const missingVars = Object.entries(requiredEnvVars)
			.filter(([_, value]) => !value)
			.map(([key]) => key);

		if (missingVars.length > 0) {
			throw new Error(
				`Missing required environment variables: ${missingVars.join(", ")}. ` +
				`Please check your .env file.`
			);
		}

		// Setup
		const buyerPrivateKey = process.env.BUYER_PRIVATE_KEY!;
		const buyerAddress = process.env.BUYER_WALLET_ADDRESS!;
		const sellerAddress = process.env.SELLER_WALLET_ADDRESS!;
		const facilitatorAddress = process.env.FACILITATOR_WALLET_ADDRESS!;

		const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
		const buyerWallet = new ethers.Wallet(buyerPrivateKey, provider);
		const facilitatorWallet = new ethers.Wallet(
			process.env.FACILITATOR_PRIVATE_KEY!,
			provider
		);

		// Payment amount
		const paymentAmountDisplay = process.env.PAYMENT_AMOUNT || "0.01";
		const paymentAmountRaw = String(Number(paymentAmountDisplay) * 1e6); // USDC has 6 decimals

		const resource = `/api/content/premium/${networkConfig.slug}`;
		const sellerUrl = `http://localhost:4022${resource}?scheme=x402-exact`;

		// Step 1: Initial request (will get 402)
		emitEvent({
			type: "step",
			step: 1,
			description: "Request content",
			role: "buyer",
			timestamp: Date.now(),
		});

		emitEvent({
			type: "http-request",
			method: "GET",
			url: sellerUrl,
			headers: {
				Accept: "application/json",
			},
			role: "buyer",
			timestamp: Date.now(),
		});

		// Simulate 402 response
		const paymentRequirements: PaymentRequirements = {
			scheme: "x402-exact",
			seller: sellerAddress,
			amount: paymentAmountDisplay,
			token: "USDC",
			tokenAddress: networkConfig.usdcAddress,
			decimals: 6,
			chainId: networkConfig.chainId,
			network: networkConfig.slug,
			resource: resource,
			facilitator: "http://localhost:4023",
		};

		emitEvent({
			type: "http-response",
			status: 402,
			headers: {
				"Content-Type": "application/json",
			},
			body: {
				error: "Payment required",
				PaymentRequirements: [paymentRequirements],
			},
			role: "seller",
			timestamp: Date.now(),
		});

		// Step 2: Create and sign payment intent (x402 signature)
		emitEvent({
			type: "step",
			step: 2,
			description: "Sign payment intent",
			role: "buyer",
			timestamp: Date.now(),
		});

		const nonce = ethers.hexlify(ethers.randomBytes(32));
		const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes

		const intent: PaymentIntent = {
			buyer: buyerAddress,
			seller: sellerAddress,
			amount: paymentAmountRaw,
			token: networkConfig.usdcAddress,
			nonce: nonce,
			expiry: expiry,
			resource: resource,
			chainId: networkConfig.chainId,
		};

		emitEvent({
			type: "signing",
			message: "PaymentIntent (EIP-712)",
			signer: buyerAddress,
			data: intent,
			role: "buyer",
			timestamp: Date.now(),
		});

		// Create x402 domain
		const x402Domain = {
			name: "x402-Payment-Intent",
			version: "2",
			chainId: networkConfig.chainId,
			verifyingContract: "0x0000000000000000000000000000000000000402",
		};

		const x402Signature = await signPaymentIntent(
			intent,
			x402Domain,
			buyerWallet
		);

		const transferAuth = {
			from: buyerAddress,
			to: sellerAddress,
			value: paymentAmountRaw,
			validAfter: 0,
			validBefore: expiry,
			nonce: nonce, // Same nonce binds both signatures
		};

		emitEvent({
			type: "signing",
			message: "TransferAuth (EIP-3009)",
			signer: buyerAddress,
			data: transferAuth,
			role: "buyer",
			timestamp: Date.now(),
		});

		const eip3009Signature = await signTransferAuthorization(
			transferAuth,
			networkConfig.usdcAddress,
			networkConfig.chainId,
			buyerWallet
		);

		// Step 3: Submit to facilitator
		emitEvent({
			type: "step",
			step: 3,
			description: "Submit payment",
			role: "buyer",
			timestamp: Date.now(),
		});

		const paymentPayload = {
			scheme: "intent",
			data: {
				intent,
				x402Signature,
				transferAuth,
				eip3009Signature,
			},
		};

		emitEvent({
			type: "http-request",
			method: "POST",
			url: "http://localhost:4023/settle",
			headers: {
				"Content-Type": "application/json",
				"x-payment": JSON.stringify(paymentPayload),
			},
			body: paymentPayload,
			role: "buyer",
			timestamp: Date.now(),
		});

		// Step 4: Facilitator executes settlement on-chain
		emitEvent({
			type: "step",
			step: 4,
			description: "Execute on-chain",
			role: "facilitator",
			timestamp: Date.now(),
		});

		const usdcAbi = [
			"function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
			"function balanceOf(address) view returns (uint256)",
		];

		const usdcContract = new ethers.Contract(
			networkConfig.usdcAddress,
			usdcAbi,
			facilitatorWallet
		);

		// Submit transaction
		const tx = await usdcContract.transferWithAuthorization(
			transferAuth.from,
			transferAuth.to,
			transferAuth.value,
			transferAuth.validAfter,
			transferAuth.validBefore,
			transferAuth.nonce,
			eip3009Signature
		);

		const explorerUrl = `https://www.oklink.com/amoy/tx/${tx.hash}`;

		emitEvent({
			type: "transaction",
			hash: tx.hash,
			explorer: explorerUrl,
			status: "pending",
			role: "facilitator",
			timestamp: Date.now(),
		});

		const receipt = await tx.wait();
		settlementTime = Date.now();

		emitEvent({
			type: "transaction",
			hash: tx.hash,
			explorer: explorerUrl,
			status: "confirmed",
			gasUsed: receipt.gasUsed.toString(),
			role: "facilitator",
			timestamp: Date.now(),
		});

		// Step 5: Seller delivers content
		emitEvent({
			type: "step",
			step: 5,
			description: "Deliver content",
			role: "seller",
			timestamp: Date.now(),
		});

		emitEvent({
			type: "http-response",
			status: 200,
			body: {
				success: true,
				content: "Premium AI Model Output",
			},
			role: "seller",
			timestamp: Date.now(),
		});

		serviceDeliveredTime = Date.now();
		const endTime = Date.now();
		const totalTime = ((endTime - startTime) / 1000).toFixed(2);
		const requestToService = ((serviceDeliveredTime - startTime) / 1000).toFixed(2);
		const requestToPay = ((settlementTime - startTime) / 1000).toFixed(2);

		emitEvent({
			type: "complete",
			result: {
				content: "Premium AI Model Output",
				contentType: "ai-response",
			},
			metrics: {
				totalTime: `${totalTime}s`,
				gasUsed: receipt.gasUsed.toString(),
				transactionHash: tx.hash,
				explorerUrl: explorerUrl,
			},
			timing: {
				requestToService: parseFloat(requestToService),
				requestToPay: parseFloat(requestToPay),
				totalTime: parseFloat(totalTime),
			},
			timestamp: Date.now(),
		});
	} catch (error: any) {
		logger.error("Error in exact flow:", error);
		const errorMessage = error.message || error.toString() || "Unknown error occurred";
		logger.error("Error details:", {
			message: errorMessage,
			stack: error.stack,
			code: error.code,
		});
		emitEvent({
			type: "error",
			message: errorMessage,
			timestamp: Date.now(),
		});
	}
}

/**
 * Run x402-escrow-deferred payment flow
 */
export async function runEscrowDeferredFlow(
	networkConfig: NetworkConfig,
	emitEvent: (event: DemoEvent) => void
): Promise<void> {
	const startTime = Date.now();
	let serviceDeliveredTime = 0;

	try {
		// Validate environment variables
		const requiredEnvVars = {
			BUYER_PRIVATE_KEY: process.env.BUYER_PRIVATE_KEY,
			BUYER_WALLET_ADDRESS: process.env.BUYER_WALLET_ADDRESS,
			SELLER_WALLET_ADDRESS: process.env.SELLER_WALLET_ADDRESS,
		};

		const missingVars = Object.entries(requiredEnvVars)
			.filter(([_, value]) => !value)
			.map(([key]) => key);

		if (missingVars.length > 0) {
			throw new Error(
				`Missing required environment variables: ${missingVars.join(", ")}. ` +
				`Please check your .env file.`
			);
		}

		// Setup
		const buyerPrivateKey = process.env.BUYER_PRIVATE_KEY!;
		const buyerAddress = process.env.BUYER_WALLET_ADDRESS!;
		const sellerAddress = process.env.SELLER_WALLET_ADDRESS!;

		const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
		const buyerWallet = new ethers.Wallet(buyerPrivateKey, provider);

		// Payment amount
		const paymentAmountDisplay = process.env.PAYMENT_AMOUNT || "0.01";
		const paymentAmountRaw = String(Number(paymentAmountDisplay) * 1e6);

		const resource = `/api/content/premium/${networkConfig.slug}`;
		const sellerUrl = `http://localhost:4022${resource}?scheme=x402-escrow-deferred`;

		// Step 1: Request content
		emitEvent({
			type: "step",
			step: 1,
			description: "Request content",
			role: "buyer",
			timestamp: Date.now(),
		});

		emitEvent({
			type: "http-request",
			method: "GET",
			url: sellerUrl,
			headers: {
				Accept: "application/json",
			},
			role: "buyer",
			timestamp: Date.now(),
		});

		if (!networkConfig.vaultAddress) {
			throw new Error(`Vault not deployed on ${networkConfig.name}`);
		}

		const vaultAbi = ["function deposits(address) view returns (uint256)"];
		const vaultContract = new ethers.Contract(
			networkConfig.vaultAddress,
			vaultAbi,
			provider
		);

		const balance = await vaultContract.deposits(buyerAddress);
		logger.info(`Vault balance: ${balance.toString()} (${ethers.formatUnits(balance, 6)} USDC)`);

		const paymentRequirements: PaymentRequirements = {
			scheme: "x402-escrow-deferred",
			seller: sellerAddress,
			amount: paymentAmountDisplay,
			token: "USDC",
			tokenAddress: networkConfig.usdcAddress,
			decimals: 6,
			chainId: networkConfig.chainId,
			network: networkConfig.slug,
			resource: resource,
			facilitator: "http://localhost:4023",
			vault: networkConfig.vaultAddress,
		};

		emitEvent({
			type: "http-response",
			status: 402,
			body: {
				error: "Payment required",
				PaymentRequirements: [paymentRequirements],
			},
			role: "seller",
			timestamp: Date.now(),
		});

		// Step 2: Sign payment intent
		emitEvent({
			type: "step",
			step: 2,
			description: "Sign payment intent",
			role: "buyer",
			timestamp: Date.now(),
		});

		const nonce = ethers.hexlify(ethers.randomBytes(32));
		const expiry = Math.floor(Date.now() / 1000) + 300;

		const intent: PaymentIntent = {
			buyer: buyerAddress,
			seller: sellerAddress,
			amount: paymentAmountRaw,
			token: networkConfig.usdcAddress,
			nonce: nonce,
			expiry: expiry,
			resource: resource,
			chainId: networkConfig.chainId,
		};

		emitEvent({
			type: "signing",
			message: "PaymentIntent (deferred)",
			signer: buyerAddress,
			data: intent,
			role: "buyer",
			timestamp: Date.now(),
		});

		// Create vault domain for escrow-deferred
		const vaultDomain = {
			name: "x402-Vault",
			version: "1",
			chainId: networkConfig.chainId,
			verifyingContract: networkConfig.vaultAddress,
		};

		const signature = await signPaymentIntent(
			intent,
			vaultDomain,
			buyerWallet
		);

		// Step 3: Submit to facilitator
		emitEvent({
			type: "step",
			step: 3,
			description: "Submit payment",
			role: "buyer",
			timestamp: Date.now(),
		});

		emitEvent({
			type: "http-request",
			method: "POST",
			url: "http://localhost:4023/validate-intent",
			headers: {
				"Content-Type": "application/json",
				"x-payment": JSON.stringify({ intent, signature }),
			},
			body: {
				intentStruct: intent,
				signature: signature,
			},
			role: "buyer",
			timestamp: Date.now(),
		});

		// Step 4: Facilitator validates instantly
		emitEvent({
			type: "step",
			step: 4,
			description: "Validate payment",
			role: "facilitator",
			timestamp: Date.now(),
		});

		emitEvent({
			type: "http-response",
			status: 200,
			body: {
				valid: true,
				queued: true,
			},
			role: "facilitator",
			timestamp: Date.now(),
		});

		// Step 5: Seller delivers content instantly
		emitEvent({
			type: "step",
			step: 5,
			description: "Deliver content",
			role: "seller",
			timestamp: Date.now(),
		});

		emitEvent({
			type: "http-response",
			status: 200,
			body: {
				success: true,
				content: "Premium AI Model Output",
				delivered: "instantly",
			},
			role: "seller",
			timestamp: Date.now(),
		});

		serviceDeliveredTime = Date.now();
		const endTime = Date.now();
		const totalTime = ((endTime - startTime) / 1000).toFixed(2);
		const requestToService = ((serviceDeliveredTime - startTime) / 1000).toFixed(2);

		emitEvent({
			type: "complete",
			result: {
				content: "Premium AI Model Output",
				contentType: "ai-response",
				delivered: "instantly",
			},
			metrics: {
				totalTime: `${totalTime}s`,
				gasUsed: "0 (deferred settlement)",
				settlementStatus: "Queued for batch processing",
				note: "Transaction will be settled later with other payments",
			},
			timing: {
				requestToService: parseFloat(requestToService),
				requestToPay: "Deferred",
				totalTime: parseFloat(totalTime),
			},
			timestamp: Date.now(),
		});
	} catch (error: any) {
		logger.error("Error in escrow-deferred flow", error);
		emitEvent({
			type: "error",
			message: error.message || "Unknown error occurred",
			timestamp: Date.now(),
		});
	}
}

