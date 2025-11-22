import { expect } from "chai";
import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
import { createLogger } from "../../shared/logger.js";

dotenv.config();

const logger = createLogger("e2e-escrow-deferred");

/**
 * E2E Test: Complete escrow-deferred flow with real deployed Vault
 * 
 * This test validates the entire payment flow on Base Sepolia:
 * 1. Buyer requests premium content
 * 2. Receives 402 with escrow-deferred payment requirements
 * 3. Signs payment intent with vault domain
 * 4. Submits payment and receives content immediately
 * 5. Facilitator queues intent for batch settlement
 * 6. Batch settlement is triggered
 * 7. On-chain verification of settlement
 * 
 * Prerequisites:
 * - Servers must be running (npm run start)
 * - Base Sepolia Vault must be deployed
 * - Buyer must have USDC balance
 * - Facilitator must have ETH for gas
 */
describe("E2E: Escrow-Deferred Flow (Real Vault on Base Sepolia)", function () {
    this.timeout(120000); // 2 minutes for on-chain operations

    const CHAIN = "base-sepolia";
    const SCHEME = "x402-escrow-deferred";
    const SELLER_URL = "http://localhost:4022";
    const FACILITATOR_URL = "http://localhost:4023";
    const RESOURCE = `/api/content/premium/${CHAIN}`;

    let provider: ethers.Provider;
    let buyerWallet: ethers.Wallet;
    let vaultAddress: string;
    let usdcAddress: string;
    let initialBuyerBalance: bigint;
    let initialSellerBalance: bigint;
    let intentId: string;

    before(async function () {
        // Validate environment
        if (!process.env.BUYER_PRIVATE_KEY) {
            throw new Error("BUYER_PRIVATE_KEY not set");
        }
        if (!process.env.BASE_SEPOLIA_RPC) {
            throw new Error("BASE_SEPOLIA_RPC not set");
        }
        if (!process.env.VAULT_BASE_SEPOLIA) {
            throw new Error("VAULT_BASE_SEPOLIA not set");
        }
        if (!process.env.USDC_BASE_SEPOLIA) {
            throw new Error("USDC_BASE_SEPOLIA not set");
        }

        vaultAddress = process.env.VAULT_BASE_SEPOLIA;
        usdcAddress = process.env.USDC_BASE_SEPOLIA;

        logger.info(`Vault address: ${vaultAddress}`);
        logger.info(`USDC address: ${usdcAddress}`);

        // Setup provider and wallet
        provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
        buyerWallet = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY, provider);

        logger.info(`Buyer address: ${buyerWallet.address}`);

        // Check services are running
        try {
            await axios.get(`${FACILITATOR_URL}/health`);
            await axios.get(`${SELLER_URL}/health`);
        } catch (error) {
            throw new Error(
                "Services not running. Please start with: npm run start"
            );
        }

        // Get initial balances
        const usdcContract = new ethers.Contract(
            usdcAddress,
            ["function balanceOf(address) view returns (uint256)"],
            provider
        );

        initialBuyerBalance = await usdcContract.balanceOf(buyerWallet.address);
        const sellerAddress = process.env.SELLER_WALLET_ADDRESS;
        initialSellerBalance = await usdcContract.balanceOf(sellerAddress);

        logger.info(
            `Initial buyer USDC balance: ${ethers.formatUnits(initialBuyerBalance, 6)} USDC`
        );
        logger.info(
            `Initial seller USDC balance: ${ethers.formatUnits(initialSellerBalance, 6)} USDC`
        );

        // Ensure buyer has enough USDC
        if (initialBuyerBalance < ethers.parseUnits("0.01", 6)) {
            throw new Error(
                "Buyer has insufficient USDC. Need at least 0.01 USDC for test."
            );
        }
    });

    it("Step 1: Buyer requests content without payment", async function () {
        logger.info("Requesting content without payment...");

        try {
            await axios.get(`${SELLER_URL}${RESOURCE}`);
            throw new Error("Should have received 402 Payment Required");
        } catch (error: any) {
            expect(error.response?.status).to.equal(402);
            expect(error.response?.headers["www-authenticate"]).to.include(
                "X-Payment"
            );

            const paymentHeader = error.response.headers["www-authenticate"];
            logger.info(`Received 402 with: ${paymentHeader}`);
        }
    });

    it("Step 2: Buyer receives payment requirements", async function () {
        logger.info("Getting payment requirements...");

        try {
            await axios.get(`${SELLER_URL}${RESOURCE}`);
        } catch (error: any) {
            const xPaymentHeader = error.response?.headers["x-payment"];
            expect(xPaymentHeader).to.exist;

            const requirements = JSON.parse(xPaymentHeader);
            expect(requirements.scheme).to.equal(SCHEME);
            expect(requirements.amount).to.exist;
            expect(requirements.tokenAddress).to.equal(usdcAddress);
            expect(requirements.facilitator).to.include(FACILITATOR_URL);
            expect(requirements.vault).to.equal(vaultAddress);

            logger.info(`Payment requirements: ${JSON.stringify(requirements, null, 2)}`);
        }
    });

    it("Step 3: Buyer deposits USDC to vault", async function () {
        logger.info("Depositing USDC to vault...");

        const depositAmount = ethers.parseUnits("0.01", 6);
        const vaultContract = new ethers.Contract(
            vaultAddress,
            ["function deposit(uint256) external"],
            buyerWallet
        );

        const usdcContract = new ethers.Contract(
            usdcAddress,
            [
                "function approve(address,uint256) external returns (bool)",
                "function allowance(address,address) view returns (uint256)",
            ],
            buyerWallet
        );

        // Check current allowance
        const currentAllowance = await usdcContract.allowance(
            buyerWallet.address,
            vaultAddress
        );

        if (currentAllowance < depositAmount) {
            logger.info("Approving USDC for vault...");
            const approveTx = await usdcContract.approve(
                vaultAddress,
                depositAmount
            );
            await approveTx.wait();
            logger.info(`Approval tx: ${approveTx.hash}`);
        }

        // Deposit to vault
        const depositTx = await vaultContract.deposit(depositAmount);
        const receipt = await depositTx.wait();

        expect(receipt?.status).to.equal(1);
        logger.info(`Deposit successful: ${depositTx.hash}`);
        logger.info(`Gas used: ${receipt?.gasUsed.toString()}`);
    });

    it("Step 4: Buyer submits escrow-deferred payment and receives content", async function () {
        logger.info("Submitting escrow-deferred payment...");

        const startTime = Date.now();

        // First, get payment requirements
        let paymentResponse: any;
        try {
            await axios.get(`${SELLER_URL}${RESOURCE}`);
        } catch (error: any) {
            const xPaymentHeader = error.response?.headers["x-payment"];
            paymentResponse = JSON.parse(xPaymentHeader);
        }

        // Create payment intent
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes

        const intent = {
            buyer: buyerWallet.address,
            seller: paymentResponse.seller,
            amount: paymentResponse.amount,
            token: paymentResponse.tokenAddress,
            nonce: nonce,
            expiry: expiry,
            resource: RESOURCE,
            chainId: 84532, // Base Sepolia
        };

        // Get vault domain
        const vaultContract = new ethers.Contract(
            vaultAddress,
            [
                "function name() view returns (string)",
                "function version() view returns (string)",
                "function DOMAIN_SEPARATOR() view returns (bytes32)",
            ],
            provider
        );

        const name = await vaultContract.name();
        const version = await vaultContract.version();

        const domain = {
            name: name,
            version: version,
            chainId: 84532,
            verifyingContract: vaultAddress,
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

        // Sign intent
        const signature = await buyerWallet.signTypedData(domain, types, intent);

        // Submit payment
        const response = await axios.get(`${SELLER_URL}${RESOURCE}`, {
            headers: {
                "X-Payment": JSON.stringify({
                    intent: intent,
                    signature: signature,
                }),
            },
        });

        const endTime = Date.now();
        const latency = endTime - startTime;

        expect(response.status).to.equal(200);
        expect(response.data.content).to.exist;
        expect(response.data.payment.status).to.equal("pending");
        expect(response.data.payment.scheme).to.equal(SCHEME);

        logger.info(`✅ Content received in ${latency}ms`);
        logger.info(`Payment status: ${response.data.payment.status}`);

        // Expect latency < 2 seconds for escrow-deferred
        expect(latency).to.be.lessThan(2000);
    });

    it("Step 5: Verify intent was queued for settlement", async function () {
        logger.info("Checking settlement queue...");

        const queueResponse = await axios.get(`${FACILITATOR_URL}/queue`);

        expect(queueResponse.data.stats.total).to.be.greaterThan(0);
        expect(queueResponse.data.stats.pending).to.be.greaterThan(0);

        // Find our intent
        const pendingIntents = queueResponse.data.pending;
        const ourIntent = pendingIntents.find(
            (intent: any) => intent.paymentIntent.buyer === buyerWallet.address
        );

        expect(ourIntent).to.exist;
        intentId = ourIntent.id;

        logger.info(`Our intent queued: ${intentId}`);
        logger.info(`Queue stats: ${JSON.stringify(queueResponse.data.stats)}`);
    });

    it("Step 6: Trigger batch settlement", async function () {
        logger.info("Triggering batch settlement...");

        const startTime = Date.now();

        const settlementResponse = await axios.post(
            `${FACILITATOR_URL}/settle-batch`
        );

        const endTime = Date.now();
        const settlementTime = endTime - startTime;

        expect(settlementResponse.data.success).to.be.true;
        expect(settlementResponse.data.intentsSettled).to.be.greaterThan(0);
        expect(settlementResponse.data.errors).to.have.lengthOf(0);

        logger.info(`✅ Batch settlement completed in ${settlementTime}ms`);
        logger.info(
            `Intents settled: ${settlementResponse.data.intentsSettled}`
        );
        logger.info(
            `Queue after settlement: ${JSON.stringify(settlementResponse.data.queueStats)}`
        );

        // Wait a bit for transaction to be indexed
        await new Promise((resolve) => setTimeout(resolve, 5000));
    });

    it("Step 7: Verify on-chain settlement", async function () {
        logger.info("Verifying on-chain settlement...");

        const usdcContract = new ethers.Contract(
            usdcAddress,
            ["function balanceOf(address) view returns (uint256)"],
            provider
        );

        const finalBuyerBalance = await usdcContract.balanceOf(
            buyerWallet.address
        );
        const sellerAddress = process.env.SELLER_WALLET_ADDRESS;
        const finalSellerBalance = await usdcContract.balanceOf(sellerAddress);

        logger.info(
            `Final buyer USDC balance: ${ethers.formatUnits(finalBuyerBalance, 6)} USDC`
        );
        logger.info(
            `Final seller USDC balance: ${ethers.formatUnits(finalSellerBalance, 6)} USDC`
        );

        const paymentAmount = ethers.parseUnits("0.01", 6);

        // Buyer balance should have decreased by payment amount
        // (not including the deposit, which is separate)
        // Actually, with vault, buyer deposits first, then vault transfers to seller
        // So buyer's direct balance doesn't change, but vault balance does

        // Seller balance should have increased
        expect(finalSellerBalance).to.be.greaterThan(initialSellerBalance);
        const sellerIncrease = finalSellerBalance - initialSellerBalance;

        logger.info(
            `Seller received: ${ethers.formatUnits(sellerIncrease, 6)} USDC`
        );
        expect(sellerIncrease).to.equal(paymentAmount);
    });

    it("Step 8: Verify intent is marked as settled in queue", async function () {
        logger.info("Checking final queue status...");

        const queueResponse = await axios.get(`${FACILITATOR_URL}/queue`);

        expect(queueResponse.data.stats.pending).to.equal(0);
        expect(queueResponse.data.stats.settled).to.be.greaterThan(0);

        logger.info(`Final queue stats: ${JSON.stringify(queueResponse.data.stats)}`);
    });

    after(function () {
        logger.info("E2E test complete!");
        logger.info("Summary:");
        logger.info("  ✅ Full escrow-deferred flow validated");
        logger.info("  ✅ Batch settlement confirmed on-chain");
        logger.info("  ✅ Seller received payment");
        logger.info("  ✅ Queue properly managed");
    });
});

