#!/usr/bin/env tsx
/**
 * Parameterized E2E Test for x402-exact scheme
 * 
 * Tests the complete payment flow on any supported chain:
 * 1. EIP-712 domain verification
 * 2. EIP-3009 signature generation
 * 3. transferWithAuthorization execution
 * 4. Balance verification
 * 
 * Usage:
 *   tsx scripts/test-chain-e2e.ts base-sepolia
 *   tsx scripts/test-chain-e2e.ts polygon-amoy
 *   tsx scripts/test-chain-e2e.ts arc
 *   tsx scripts/test-chain-e2e.ts arbitrum-sepolia
 *   tsx scripts/test-chain-e2e.ts optimism-sepolia
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { createLogger } from '../shared/logger.js';

dotenv.config();

const logger = createLogger('e2e-test');

// Chain configuration mapping
const CHAIN_CONFIGS: Record<string, {
  name: string;
  chainId: number;
  rpcEnvVar: string;
  usdcEnvVar: string;
  vaultEnvVar: string;
  explorer: string;
}> = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcEnvVar: 'BASE_SEPOLIA_RPC',
    usdcEnvVar: 'USDC_BASE_SEPOLIA',
    vaultEnvVar: 'VAULT_BASE_SEPOLIA',
    explorer: 'https://sepolia.basescan.org/tx'
  },
  'polygon-amoy': {
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcEnvVar: 'POLYGON_AMOY_RPC',
    usdcEnvVar: 'USDC_POLYGON_AMOY',
    vaultEnvVar: 'VAULT_POLYGON_AMOY',
    explorer: 'https://www.oklink.com/amoy/tx'
  },
  'arc': {
    name: 'Arc Testnet',
    chainId: 5042002,
    rpcEnvVar: 'ARC_TESTNET_RPC',
    usdcEnvVar: 'USDC_ARC_TESTNET',
    vaultEnvVar: 'VAULT_ARC_TESTNET',
    explorer: 'https://explorer.arc-testnet.circlechain.xyz/tx'
  },
  'arbitrum-sepolia': {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcEnvVar: 'ARBITRUM_SEPOLIA_RPC',
    usdcEnvVar: 'USDC_ARBITRUM_SEPOLIA',
    vaultEnvVar: 'VAULT_ARBITRUM_SEPOLIA',
    explorer: 'https://sepolia.arbiscan.io/tx'
  },
  'optimism-sepolia': {
    name: 'Optimism Sepolia',
    chainId: 11155420,
    rpcEnvVar: 'OPTIMISM_SEPOLIA_RPC',
    usdcEnvVar: 'USDC_OPTIMISM_SEPOLIA',
    vaultEnvVar: 'VAULT_OPTIMISM_SEPOLIA',
    explorer: 'https://sepolia-optimism.etherscan.io/tx'
  }
};

const USDC_ABI = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function balanceOf(address) view returns (uint256)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)'
];

async function testChain(chainKey: string) {
  const config = CHAIN_CONFIGS[chainKey];
  if (!config) {
    logger.error(`Unknown chain: ${chainKey}`);
    logger.info(`Available chains: ${Object.keys(CHAIN_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  logger.info('═'.repeat(70));
  logger.info(`E2E TEST: ${config.name} (Chain ID: ${config.chainId})`);
  logger.info('═'.repeat(70));
  console.log();

  // Validate environment
  const rpcUrl = process.env[config.rpcEnvVar];
  const usdcAddress = process.env[config.usdcEnvVar];
  const vaultAddress = process.env[config.vaultEnvVar];

  if (!rpcUrl) {
    logger.error(`${config.rpcEnvVar} not configured`);
    process.exit(1);
  }
  if (!usdcAddress) {
    logger.error(`${config.usdcEnvVar} not configured`);
    process.exit(1);
  }
  if (!process.env.BUYER_PRIVATE_KEY || !process.env.SELLER_WALLET_ADDRESS || !process.env.FACILITATOR_PRIVATE_KEY) {
    logger.error('BUYER_PRIVATE_KEY, SELLER_WALLET_ADDRESS, or FACILITATOR_PRIVATE_KEY not configured');
    process.exit(1);
  }

  logger.info('Configuration:');
  logger.info(`  RPC: ${rpcUrl.substring(0, 50)}...`);
  logger.info(`  USDC: ${usdcAddress}`);
  logger.info(`  Vault: ${vaultAddress || 'Not deployed'}`);
  console.log();

  // Setup wallets
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const buyer = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY, provider);
  const seller = process.env.SELLER_WALLET_ADDRESS;
  const facilitator = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, provider);

  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, provider);
  const usdcWithFacilitator = usdc.connect(facilitator);

  const startTime = Date.now();

  try {
    // Step 1: Network verification - CRITICAL SAFETY CHECK
    logger.info('[Step 1/7] Network Verification...');
    
    // Multi-level verification to ensure we're on the correct chain
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    logger.info(`  Network Query Results:`);
    logger.info(`    Block Number: ${blockNumber}`);
    logger.info(`    Chain ID (from network): ${network.chainId}`);
    logger.info(`    Chain Name (from network): ${network.name || 'unknown'}`);
    
    // Verification 1: Check chain ID from network object
    const networkChainId = Number(network.chainId);
    if (networkChainId !== config.chainId) {
      logger.error(`  ❌ CHAIN ID MISMATCH!`);
      logger.error(`     Expected: ${config.chainId} (${config.name})`);
      logger.error(`     Got: ${networkChainId}`);
      logger.error(`     RPC URL: ${rpcUrl.substring(0, 50)}...`);
      process.exit(1);
    }
    logger.info(`  ✅ Chain ID verification PASSED: ${config.chainId}`);
    
    // Verification 2: Query chain ID directly via eth_chainId RPC call
    const rpcChainId = await provider.send('eth_chainId', []);
    const rpcChainIdDecimal = parseInt(rpcChainId, 16);
    logger.info(`    Chain ID (via eth_chainId RPC): ${rpcChainIdDecimal}`);
    
    if (rpcChainIdDecimal !== config.chainId) {
      logger.error(`  ❌ RPC CHAIN ID MISMATCH!`);
      logger.error(`     Expected: ${config.chainId}`);
      logger.error(`     RPC returned: ${rpcChainIdDecimal}`);
      process.exit(1);
    }
    logger.info(`  ✅ RPC chain ID verification PASSED: ${rpcChainIdDecimal}`);
    
    // Verification 3: Verify USDC contract exists on this chain
    const usdcCode = await provider.getCode(usdcAddress);
    if (usdcCode === '0x' || usdcCode === '0x0') {
      logger.error(`  ❌ USDC contract not found at ${usdcAddress} on this chain!`);
      logger.error(`     This suggests wrong RPC endpoint or wrong USDC address`);
      process.exit(1);
    }
    logger.info(`  ✅ USDC contract exists at ${usdcAddress}`);
    logger.info(`     Bytecode size: ${usdcCode.length} bytes`);
    
    logger.info(`  ✅ ALL VERIFICATIONS PASSED - Connected to ${config.name} (${config.chainId})`);
    console.log();

    // Step 2: USDC contract verification
    logger.info('[Step 2/7] USDC Contract Verification...');
    const name = await usdc.name();
    const version = await usdc.version();
    const onChainDomain = await usdc.DOMAIN_SEPARATOR();
    logger.info(`  ✅ name: ${name}`);
    logger.info(`  ✅ version: ${version}`);
    logger.info(`  ✅ DOMAIN_SEPARATOR: ${onChainDomain}`);
    console.log();

    // Step 3: EIP-712 domain verification - ENSURES CORRECT CHAIN
    logger.info('[Step 3/7] EIP-712 Domain Verification...');
    
    // This is a CRITICAL verification that we're on the right chain
    // because the domain separator is calculated with chainId
    const domain = {
      name,
      version,
      chainId: Number(network.chainId), // Uses the verified chain ID
      verifyingContract: usdcAddress
    };
    
    logger.info(`  Domain components:`);
    logger.info(`    name: "${domain.name}"`);
    logger.info(`    version: "${domain.version}"`);
    logger.info(`    chainId: ${domain.chainId}`);
    logger.info(`    verifyingContract: ${domain.verifyingContract}`);
    
    const calculatedDomain = ethers.TypedDataEncoder.hashDomain(domain);
    const domainMatch = calculatedDomain === onChainDomain;
    
    logger.info(`  Calculated domain separator: ${calculatedDomain}`);
    logger.info(`  On-chain domain separator:   ${onChainDomain}`);
    logger.info(`  ${domainMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    
    if (!domainMatch) {
      logger.error('  ❌ Domain separator mismatch!');
      logger.error('     This proves we are either:');
      logger.error('     1. On the wrong chain (wrong chainId)');
      logger.error('     2. Using wrong USDC contract address');
      logger.error('     3. USDC contract has non-standard domain parameters');
      process.exit(1);
    }
    
    logger.info('  ✅ Domain separator match confirms:');
    logger.info(`     - We are on chain ${domain.chainId} (${config.name})`);
    logger.info(`     - USDC contract at ${usdcAddress} is correct`);
    logger.info('     - EIP-3009 signatures will be valid');
    console.log();

    // Step 4: Initial balances
    logger.info('[Step 4/7] Initial Balances...');
    const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
    const sellerBalanceBefore = await usdc.balanceOf(seller);
    const facilitatorBalanceBefore = await usdc.balanceOf(facilitator.address);
    
    logger.info(`  Buyer: ${ethers.formatUnits(buyerBalanceBefore, 6)} USDC`);
    logger.info(`  Seller: ${ethers.formatUnits(sellerBalanceBefore, 6)} USDC`);
    logger.info(`  Facilitator: ${ethers.formatUnits(facilitatorBalanceBefore, 6)} USDC`);
    
    if (buyerBalanceBefore === 0n) {
      logger.error('  ❌ Buyer has no USDC balance');
      process.exit(1);
    }
    console.log();

    // Step 5: Create and sign EIP-3009 authorization
    logger.info('[Step 5/7] Creating EIP-3009 Authorization...');
    const transferAmount = 10000n; // 0.01 USDC
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const transferAuth = {
      from: buyer.address,
      to: seller,
      value: transferAmount,
      validAfter,
      validBefore,
      nonce
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };

    logger.info(`  Amount: ${ethers.formatUnits(transferAmount, 6)} USDC`);
    logger.info(`  From: ${buyer.address}`);
    logger.info(`  To: ${seller}`);
    logger.info(`  Nonce: ${nonce}`);
    
    const signStartTime = Date.now();
    const signature = await buyer.signTypedData(domain, types, transferAuth);
    const signDuration = Date.now() - signStartTime;
    
    const sig = ethers.Signature.from(signature);
    logger.info(`  ✅ Signature created (${signDuration}ms)`);
    console.log();

    // Step 6: Execute transferWithAuthorization
    logger.info('[Step 6/7] Executing transferWithAuthorization...');
    const txStartTime = Date.now();
    
    const tx = await usdcWithFacilitator.transferWithAuthorization(
      transferAuth.from,
      transferAuth.to,
      transferAuth.value,
      transferAuth.validAfter,
      transferAuth.validBefore,
      transferAuth.nonce,
      sig.v,
      sig.r,
      sig.s
    );

    logger.info(`  Transaction hash: ${tx.hash}`);
    logger.info(`  Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    const txDuration = Date.now() - txStartTime;
    
    logger.info(`  ✅ Confirmed in block ${receipt.blockNumber}`);
    logger.info(`  Gas used: ${receipt.gasUsed.toString()}`);
    logger.info(`  Duration: ${txDuration}ms`);
    logger.info(`  Explorer: ${config.explorer}/${tx.hash}`);
    console.log();

    // Step 7: Verify balances
    logger.info('[Step 7/7] Verifying Final Balances...');
    const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
    const sellerBalanceAfter = await usdc.balanceOf(seller);
    
    const buyerDiff = buyerBalanceAfter - buyerBalanceBefore;
    const sellerDiff = sellerBalanceAfter - sellerBalanceBefore;
    
    logger.info(`  Buyer: ${ethers.formatUnits(buyerBalanceAfter, 6)} USDC (${buyerDiff >= 0 ? '+' : ''}${ethers.formatUnits(buyerDiff, 6)})`);
    logger.info(`  Seller: ${ethers.formatUnits(sellerBalanceAfter, 6)} USDC (${sellerDiff >= 0 ? '+' : ''}${ethers.formatUnits(sellerDiff, 6)})`);
    
    if (buyerDiff !== -transferAmount) {
      logger.error(`  ❌ Buyer balance change incorrect (expected ${ethers.formatUnits(-transferAmount, 6)})`);
      process.exit(1);
    }
    if (sellerDiff !== transferAmount) {
      logger.error(`  ❌ Seller balance change incorrect (expected ${ethers.formatUnits(transferAmount, 6)})`);
      process.exit(1);
    }
    
    logger.info('  ✅ Balance changes verified');
    console.log();

    // Summary
    const totalDuration = Date.now() - startTime;
    logger.info('═'.repeat(70));
    logger.info('✅ TEST PASSED');
    logger.info('═'.repeat(70));
    logger.info(`Chain: ${config.name} (${config.chainId})`);
    logger.info(`Transaction: ${tx.hash}`);
    logger.info(`Block: ${receipt.blockNumber}`);
    logger.info(`Gas Used: ${receipt.gasUsed.toString()}`);
    logger.info(`Total Duration: ${totalDuration}ms`);
    logger.info(`Signing: ${signDuration}ms, Settlement: ${txDuration}ms`);
    logger.info('═'.repeat(70));

    // Return results for comparison
    return {
      success: true,
      chain: config.name,
      chainId: config.chainId,
      txHash: tx.hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      totalDuration,
      signDuration,
      txDuration,
      explorer: `${config.explorer}/${tx.hash}`
    };

  } catch (error: any) {
    logger.error('═'.repeat(70));
    logger.error('❌ TEST FAILED');
    logger.error('═'.repeat(70));
    logger.error(`Error: ${error.message}`);
    if (error.data) {
      logger.error(`Error data: ${error.data}`);
    }
    if (error.transaction) {
      logger.error(`Transaction: ${JSON.stringify(error.transaction, null, 2)}`);
    }
    logger.error('═'.repeat(70));
    process.exit(1);
  }
}

// Main execution
const chainKey = process.argv[2];

if (!chainKey) {
  console.log('Usage: tsx scripts/test-chain-e2e.ts <chain>');
  console.log('');
  console.log('Available chains:');
  Object.entries(CHAIN_CONFIGS).forEach(([key, config]) => {
    console.log(`  ${key.padEnd(20)} - ${config.name} (${config.chainId})`);
  });
  process.exit(1);
}

testChain(chainKey)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

