/**
 * Approve facilitator to spend buyer's USDC
 * 
 * This must be run before the buyer can make payments
 */

import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.BASE_SEPOLIA_RPC;
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const BUYER_ADDRESS = process.env.BUYER_WALLET_ADDRESS;
const FACILITATOR_ADDRESS = process.env.FACILITATOR_WALLET_ADDRESS;
const USDC_ADDRESS = process.env.USDC_BASE_SEPOLIA;

if (!RPC_URL || !BUYER_PRIVATE_KEY || !FACILITATOR_ADDRESS || !USDC_ADDRESS) {
	console.error("Missing required environment variables");
	process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const buyerWallet = new ethers.Wallet(BUYER_PRIVATE_KEY, provider);

const ERC20_ABI = [
	"function approve(address spender, uint256 amount) returns (bool)",
	"function allowance(address owner, address spender) view returns (uint256)",
	"function balanceOf(address account) view returns (uint256)",
	"function decimals() view returns (uint8)",
];

async function main() {
	console.log("===== Approve Facilitator =====");
	console.log(`Buyer: ${BUYER_ADDRESS}`);
	console.log(`Facilitator: ${FACILITATOR_ADDRESS}`);
	console.log(`USDC: ${USDC_ADDRESS}`);
	console.log("");

	const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, buyerWallet);

	// Check current state
	const balance = await usdcContract.balanceOf(BUYER_ADDRESS);
	const allowance = await usdcContract.allowance(BUYER_ADDRESS, FACILITATOR_ADDRESS);
	const decimals = await usdcContract.decimals();

	console.log(`Current balance: ${Number(balance) / 10 ** Number(decimals)} USDC`);
	console.log(`Current allowance: ${Number(allowance) / 10 ** Number(decimals)} USDC`);
	console.log("");

	if (balance === 0n) {
		console.error("❌ Buyer has no USDC balance!");
		process.exit(1);
	}

	// Approve max amount
	const approvalAmount = ethers.MaxUint256;
	console.log("Approving facilitator to spend USDC...");

	const tx = await usdcContract.approve(FACILITATOR_ADDRESS, approvalAmount);
	console.log(`Transaction submitted: ${tx.hash}`);
	console.log("Waiting for confirmation...");

	const receipt = await tx.wait();
	console.log(`✅ Approved! Gas used: ${receipt.gasUsed.toString()}`);
	console.log("");

	// Verify
	const newAllowance = await usdcContract.allowance(BUYER_ADDRESS, FACILITATOR_ADDRESS);
	console.log(`New allowance: ${newAllowance.toString()} (Max: ${ethers.MaxUint256.toString()})`);
	console.log("");
	console.log("✅ Buyer can now make payments through the facilitator");
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});

