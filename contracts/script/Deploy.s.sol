// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentAllowance.sol";
import "../src/InvoiceSettlement.sol";
import "../src/RecurringPayments.sol";

/**
 * @title Deploy Agent Financial Stack
 * @notice Deploys all contracts to Base mainnet
 */
contract DeployAgentFinancialStack is Script {
    // $OPENWORK token on Base
    address constant OPENWORK_TOKEN = 0x299c30DD5974BF4D5bFE42C340CA40462816AB07;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying Agent Financial Stack to Base...");
        console.log("Deployer:", deployer);
        console.log("$OPENWORK Token:", OPENWORK_TOKEN);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy AgentAllowance
        AgentAllowance allowance = new AgentAllowance(OPENWORK_TOKEN);
        console.log("AgentAllowance deployed:", address(allowance));
        
        // Deploy InvoiceSettlement
        InvoiceSettlement invoices = new InvoiceSettlement(OPENWORK_TOKEN);
        console.log("InvoiceSettlement deployed:", address(invoices));
        
        // Deploy RecurringPayments
        RecurringPayments subscriptions = new RecurringPayments(
            OPENWORK_TOKEN,
            address(allowance)
        );
        console.log("RecurringPayments deployed:", address(subscriptions));
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Complete ===");
        console.log("AgentAllowance:", address(allowance));
        console.log("InvoiceSettlement:", address(invoices));
        console.log("RecurringPayments:", address(subscriptions));
        console.log("\nNext steps:");
        console.log("1. Verify contracts on Basescan");
        console.log("2. Update backend with contract addresses");
        console.log("3. Test allowance creation and invoice lifecycle");
    }
}
