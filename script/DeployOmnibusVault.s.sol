// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OmnibusVault} from "../src/OmnibusVault.sol";

/**
 * @title DeployOmnibusVault
 * @notice Deployment script for OmnibusVault (TEE facilitator scheme)
 * 
 * Usage:
 *   forge script script/DeployOmnibusVault.s.sol:DeployOmnibusVault \
 *     --rpc-url base_sepolia \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 * 
 * Required environment variables:
 *   - USDC_BASE_SEPOLIA (or other chain)
 *   - TEE_FACILITATOR_ADDRESS (from ROFL deployment)
 */
contract DeployOmnibusVault is Script {
    function run() external {
        // Get USDC address from environment
        address usdc = vm.envAddress("USDC_BASE_SEPOLIA");
        
        // Get TEE facilitator address (ROFL-managed wallet)
        address facilitator = vm.envAddress("TEE_FACILITATOR_ADDRESS");
        
        console.log("Deploying OmnibusVault...");
        console.log("USDC:", usdc);
        console.log("Facilitator:", facilitator);

        vm.startBroadcast();

        OmnibusVault vault = new OmnibusVault(usdc, facilitator);

        vm.stopBroadcast();

        console.log("OmnibusVault deployed at:", address(vault));
        console.log("");
        console.log("Add to deployed-tee.env:");
        console.log("OMNIBUS_VAULT_BASE_SEPOLIA=", address(vault));
    }
}

