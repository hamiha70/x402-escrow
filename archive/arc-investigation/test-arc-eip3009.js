import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

// Arc Testnet with correct chain ID
const provider = new ethers.JsonRpcProvider(process.env.ARC_TESTNET_RPC);
const signer = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY, provider);

const usdcAddress = '0x3600000000000000000000000000000000000000';
const USDC_ABI = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function balanceOf(address) view returns (uint256)'
];

async function testEIP3009() {
  console.log('Testing EIP-3009 on Arc Testnet...\n');
  
  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, provider);
  
  // Get contract info
  const name = await usdc.name();
  const version = await usdc.version();
  const domainSep = await usdc.DOMAIN_SEPARATOR();
  const chainId = (await provider.getNetwork()).chainId;
  
  console.log('Contract Info:');
  console.log('  name:', name);
  console.log('  version:', version);
  console.log('  chainId:', chainId.toString());
  console.log('  DOMAIN_SEPARATOR (on-chain):', domainSep);
  console.log();
  
  // Build domain with CORRECT chain ID
  const domain = {
    name,
    version,
    chainId: Number(chainId),
    verifyingContract: usdcAddress
  };
  
  console.log('Domain for signing:');
  console.log('  name:', domain.name);
  console.log('  version:', domain.version);
  console.log('  chainId:', domain.chainId);
  console.log('  verifyingContract:', domain.verifyingContract);
  console.log();
  
  // Calculate domain separator
  const calculatedDomain = ethers.TypedDataEncoder.hashDomain(domain);
  console.log('Calculated DOMAIN_SEPARATOR:', calculatedDomain);
  console.log('On-chain DOMAIN_SEPARATOR:  ', domainSep);
  console.log('Match:', calculatedDomain === domainSep ? '✅ YES' : '❌ NO');
  console.log();
  
  // If they don't match, we can't proceed
  if (calculatedDomain !== domainSep) {
    console.log('❌ Domain mismatch - EIP-3009 will fail');
    console.log('\nTrying to find the correct parameters...');
    
    // Try with different chain IDs
    for (const testChainId of [1243, 5042002, 1, 0]) {
      const testDomain = { ...domain, chainId: testChainId };
      const testCalc = ethers.TypedDataEncoder.hashDomain(testDomain);
      if (testCalc === domainSep) {
        console.log(`✅ Found match with chainId ${testChainId}!`);
        return false;
      }
    }
    
    console.log('Could not find matching domain parameters.');
    return false;
  }
  
  console.log('✅ Domain matches! EIP-3009 should work!');
  return true;
}

testEIP3009()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });

