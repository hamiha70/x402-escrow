// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";

/**
 * @title DeployVaultArc
 * @notice Deployment script for x402 Vault contract to Arc Testnet
 * 
 * Usage:
 *   forge script script/DeployVaultArc.s.sol:DeployVaultArc \
 *     --rpc-url $ARC_TESTNET_RPC \
 *     --broadcast \
 *     --legacy \
 *     --timeout 300 \
 *     -vvvv
 */
contract DeployVaultArc is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("FACILITATOR_PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ARC_TESTNET");
        
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("====================================");
        console.log("Deploying x402 Vault to Arc Testnet");
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
        console.log("1. Update deployed.env with VAULT_ARC_TESTNET=%s", address(vault));
        console.log("2. Test deposit with ERC-20 flow (not EIP-3009)");
        console.log("3. Update facilitator/seller configs with vault address");
    }
}

