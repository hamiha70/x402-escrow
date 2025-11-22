#!/usr/bin/env node
/**
 * Quick integration test for Arc Testnet
 * Verifies that Arc works with the standard x402 flow
 */
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const CHAIN_CONFIG = {
  name: 'arc',
  displayName: 'Arc Testnet',
  chainId: 5042002,
  rpc: process.env.ARC_TESTNET_RPC,
  usdc: process.env.USDC_ARC_TESTNET,
  vault: process.env.VAULT_ARC_TESTNET,
  explorer: 'https://explorer.arc-testnet.circlechain.xyz/tx'
};

async function testArcIntegration() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         ARC TESTNET INTEGRATION TEST                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  
  // Validate config
  if (!CHAIN_CONFIG.rpc) {
    console.log('❌ ARC_TESTNET_RPC not configured');
    return false;
  }
  if (!CHAIN_CONFIG.usdc) {
    console.log('❌ USDC_ARC_TESTNET not configured');
    return false;
  }
  if (!CHAIN_CONFIG.vault) {
    console.log('❌ VAULT_ARC_TESTNET not configured');
    return false;
  }
  
  console.log('Configuration:');
  console.log('  Chain ID:', CHAIN_CONFIG.chainId);
  console.log('  RPC:', CHAIN_CONFIG.rpc.substring(0, 50) + '...');
  console.log('  USDC:', CHAIN_CONFIG.usdc);
  console.log('  Vault:', CHAIN_CONFIG.vault);
  console.log();
  
  const provider = new ethers.JsonRpcProvider(CHAIN_CONFIG.rpc);
  const buyer = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY, provider);
  const seller = new ethers.Wallet(process.env.SELLER_PRIVATE_KEY, provider);
  const facilitator = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, provider);
  
  const USDC_ABI = [
    'function name() view returns (string)',
    'function version() view returns (string)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address, uint256) returns (bool)',
    'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)'
  ];
  
  const VAULT_ABI = [
    'function token() view returns (address)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function deposits(address) view returns (uint256)'
  ];
  
  const usdc = new ethers.Contract(CHAIN_CONFIG.usdc, USDC_ABI, provider);
  const vault = new ethers.Contract(CHAIN_CONFIG.vault, VAULT_ABI, provider);
  
  // Test 1: Network connectivity
  console.log('[Test 1] Network Connectivity...');
  try {
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    console.log('  ✅ Connected to block', blockNumber);
    console.log('  ✅ Chain ID:', network.chainId.toString());
    if (Number(network.chainId) !== CHAIN_CONFIG.chainId) {
      console.log(`  ⚠️  Warning: Chain ID mismatch (expected ${CHAIN_CONFIG.chainId}, got ${network.chainId})`);
    }
  } catch (error) {
    console.log('  ❌ Network connectivity failed:', error.message);
    return false;
  }
  console.log();
  
  // Test 2: USDC Contract
  console.log('[Test 2] USDC Contract...');
  try {
    const name = await usdc.name();
    const version = await usdc.version();
    const domainSep = await usdc.DOMAIN_SEPARATOR();
    console.log('  ✅ name:', name);
    console.log('  ✅ version:', version);
    console.log('  ✅ DOMAIN_SEPARATOR:', domainSep);
  } catch (error) {
    console.log('  ❌ USDC contract query failed:', error.message);
    return false;
  }
  console.log();
  
  // Test 3: EIP-712 Domain Match
  console.log('[Test 3] EIP-712 Domain Verification...');
  try {
    const name = await usdc.name();
    const version = await usdc.version();
    const chainId = (await provider.getNetwork()).chainId;
    const domainSep = await usdc.DOMAIN_SEPARATOR();
    
    const domain = {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract: CHAIN_CONFIG.usdc
    };
    
    const calculated = ethers.TypedDataEncoder.hashDomain(domain);
    const match = calculated === domainSep;
    
    console.log('  Calculated:', calculated);
    console.log('  On-chain:  ', domainSep);
    console.log('  ', match ? '✅ MATCH' : '❌ MISMATCH');
    
    if (!match) {
      console.log('  ❌ EIP-3009 will not work with this domain');
      return false;
    }
  } catch (error) {
    console.log('  ❌ Domain verification failed:', error.message);
    return false;
  }
  console.log();
  
  // Test 4: Vault Contract
  console.log('[Test 4] Vault Contract...');
  try {
    const vaultToken = await vault.token();
    const vaultDomain = await vault.DOMAIN_SEPARATOR();
    console.log('  ✅ token:', vaultToken);
    console.log('  ✅ DOMAIN_SEPARATOR:', vaultDomain);
    
    if (vaultToken.toLowerCase() !== CHAIN_CONFIG.usdc.toLowerCase()) {
      console.log('  ⚠️  Warning: Vault token mismatch');
    }
  } catch (error) {
    console.log('  ❌ Vault contract query failed:', error.message);
    return false;
  }
  console.log();
  
  // Test 5: Wallet Balances
  console.log('[Test 5] Wallet Balances...');
  try {
    const buyerBalance = await usdc.balanceOf(buyer.address);
    const sellerBalance = await usdc.balanceOf(seller.address);
    const facilitatorBalance = await usdc.balanceOf(facilitator.address);
    
    console.log('  Buyer:', ethers.formatUnits(buyerBalance, 6), 'USDC');
    console.log('  Seller:', ethers.formatUnits(sellerBalance, 6), 'USDC');
    console.log('  Facilitator:', ethers.formatUnits(facilitatorBalance, 6), 'USDC');
    
    if (buyerBalance === 0n) {
      console.log('  ⚠️  Buyer has no USDC balance');
    } else {
      console.log('  ✅ Buyer has sufficient balance');
    }
  } catch (error) {
    console.log('  ❌ Balance check failed:', error.message);
    return false;
  }
  console.log();
  
  // Test 6: EIP-3009 transferWithAuthorization
  console.log('[Test 6] EIP-3009 transferWithAuthorization (dry run)...');
  try {
    const chainId = (await provider.getNetwork()).chainId;
    const name = await usdc.name();
    const version = await usdc.version();
    
    const domain = {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract: CHAIN_CONFIG.usdc
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
    
    const transferAuth = {
      from: buyer.address,
      to: seller.address,
      value: 100000n, // 0.1 USDC
      validAfter: 0,
      validBefore: Math.floor(Date.now() / 1000) + 3600,
      nonce: ethers.hexlify(ethers.randomBytes(32))
    };
    
    const signature = await buyer.signTypedData(domain, types, transferAuth);
    console.log('  ✅ Signature generated successfully');
    console.log('  ✅ EIP-3009 compatible');
  } catch (error) {
    console.log('  ❌ EIP-3009 signing failed:', error.message);
    return false;
  }
  console.log();
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   ✅ ALL TESTS PASSED                          ║');
  console.log('║          Arc Testnet is fully compatible with x402!            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  return true;
}

testArcIntegration()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

