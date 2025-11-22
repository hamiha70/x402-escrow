import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.ARC_TESTNET_RPC);
const buyer = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY, provider);
const facilitator = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, provider);

const usdcAddress = '0x3600000000000000000000000000000000000000';
const sellerAddress = process.env.SELLER_WALLET_ADDRESS;

const USDC_ABI = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

async function testFullEIP3009() {
  console.log('='.repeat(70));
  console.log('FULL EIP-3009 TEST ON ARC TESTNET');
  console.log('='.repeat(70));
  console.log();
  
  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, provider);
  const usdcWithBuyer = usdc.connect(buyer);
  const usdcWithFacilitator = usdc.connect(facilitator);
  
  // Get balances
  const buyerBalance = await usdc.balanceOf(buyer.address);
  const sellerBalance = await usdc.balanceOf(sellerAddress);
  const facilitatorBalance = await usdc.balanceOf(facilitator.address);
  
  console.log('Initial Balances:');
  console.log('  Buyer:', ethers.formatUnits(buyerBalance, 6), 'USDC');
  console.log('  Seller:', ethers.formatUnits(sellerBalance, 6), 'USDC');
  console.log('  Facilitator:', ethers.formatUnits(facilitatorBalance, 6), 'USDC');
  console.log();
  
  // Check if buyer has balance
  if (buyerBalance === 0n) {
    console.log('⚠️  Buyer has 0 USDC balance. Need to fund first.');
    console.log('Attempting to get funds from facilitator...');
    
    if (facilitatorBalance > 1000000n) {
      const fundTx = await usdcWithFacilitator.transfer(buyer.address, 10000000n); // 10 USDC
      console.log('Funding transaction:', fundTx.hash);
      await fundTx.wait();
      console.log('✅ Funded buyer with 10 USDC\n');
    } else {
      console.log('❌ Facilitator also has insufficient balance. Cannot proceed.');
      return false;
    }
  }
  
  // Get contract info
  const name = await usdc.name();
  const version = await usdc.version();
  const chainId = (await provider.getNetwork()).chainId;
  
  // Build domain
  const domain = {
    name,
    version,
    chainId: Number(chainId),
    verifyingContract: usdcAddress
  };
  
  console.log('EIP-712 Domain:');
  console.log('  name:', domain.name);
  console.log('  version:', domain.version);
  console.log('  chainId:', domain.chainId);
  console.log('  verifyingContract:', domain.verifyingContract);
  console.log();
  
  // Build transfer authorization
  const transferAmount = 1000000n; // 1 USDC
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  
  const transferAuth = {
    from: buyer.address,
    to: sellerAddress,
    value: transferAmount,
    validAfter,
    validBefore,
    nonce
  };
  
  console.log('Transfer Authorization:');
  console.log('  from:', transferAuth.from);
  console.log('  to:', transferAuth.to);
  console.log('  value:', ethers.formatUnits(transferAuth.value, 6), 'USDC');
  console.log('  validBefore:', new Date(validBefore * 1000).toISOString());
  console.log('  nonce:', nonce);
  console.log();
  
  // EIP-712 types
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
  
  // Sign
  console.log('Signing with buyer wallet...');
  const signature = await buyer.signTypedData(domain, types, transferAuth);
  const sig = ethers.Signature.from(signature);
  console.log('✅ Signature created');
  console.log('  v:', sig.v);
  console.log('  r:', sig.r);
  console.log('  s:', sig.s);
  console.log();
  
  // Execute transfer
  console.log('Executing transferWithAuthorization via facilitator...');
  try {
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
    
    console.log('Transaction hash:', tx.hash);
    console.log('Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed in block', receipt.blockNumber);
    console.log();
    
    // Get final balances
    const buyerBalanceFinal = await usdc.balanceOf(buyer.address);
    const sellerBalanceFinal = await usdc.balanceOf(sellerAddress);
    
    console.log('Final Balances:');
    console.log('  Buyer:', ethers.formatUnits(buyerBalanceFinal, 6), 'USDC');
    console.log('  Seller:', ethers.formatUnits(sellerBalanceFinal, 6), 'USDC');
    console.log();
    
    console.log('='.repeat(70));
    console.log('✅ EIP-3009 WORKS PERFECTLY ON ARC TESTNET!');
    console.log('='.repeat(70));
    return true;
    
  } catch (error) {
    console.log('❌ Transaction failed:', error.message);
    if (error.data) {
      console.log('Error data:', error.data);
    }
    console.log();
    console.log('='.repeat(70));
    console.log('❌ EIP-3009 FAILED');
    console.log('='.repeat(70));
    return false;
  }
}

testFullEIP3009()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

