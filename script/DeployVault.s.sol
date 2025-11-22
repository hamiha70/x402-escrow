// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";

/**
 * @title DeployVault
 * @notice Deployment script for x402 Vault contract
 * 
 * Usage:
 *   forge script script/DeployVault.s.sol:DeployVault \
 *     --rpc-url base_sepolia \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 * 
 * Environment Variables Required:
 *   - BASE_SEPOLIA_RPC: RPC endpoint
 *   - FACILITATOR_PRIVATE_KEY: Deployer/facilitator private key
 *   - USDC_BASE_SEPOLIA: USDC contract address
 *   - BASESCAN_API_KEY: For contract verification
 */
contract DeployVault is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("FACILITATOR_PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_BASE_SEPOLIA");
        
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("====================================");
        console.log("Deploying x402 Vault to Base Sepolia");
        console.log("====================================");
        console.log("Deployer (Facilitator):", deployer);
        console.log("USDC Address:", usdcAddress);
        console.log("Chain ID:", block.chainid);
        console.log("");

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Vault
        Vault vault = new Vault(usdcAddress);

        vm.stopBroadcast();

        // Log deployment info
        console.log("====================================");
        console.log("Deployment Successful!");
        console.log("====================================");
        console.log("Vault Address:", address(vault));
        console.log("Vault Token:", address(vault.token()));
        console.log("Domain Separator:", vm.toString(vault.DOMAIN_SEPARATOR()));
        console.log("");
        console.log("Next Steps:");
        console.log("1. Update .env with VAULT_ADDRESS=%s", address(vault));
        console.log("2. Run fork tests: forge test --fork-url $BASE_SEPOLIA_RPC");
        console.log("3. Update facilitator/seller configs with vault address");
        console.log("4. Test deposit: cast send %s \"deposit(uint256)\" 10000000 --private-key $BUYER_PRIVATE_KEY", address(vault));
    }
}

