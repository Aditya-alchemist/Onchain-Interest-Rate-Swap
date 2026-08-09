// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";

import {Governance} from "../src/governance/Governance.sol";

import {InterestRateModel} from "../src/lending/InterestRateModel.sol";
import {CollateralVault} from "../src/lending/CollateralVault.sol";
import {LendingPool} from "../src/lending/LendingPool.sol";
import {LoanManager} from "../src/lending/LoanManager.sol";

import {LoanNFT} from "../src/tokenization/LoanNFT.sol";
import {SwapNFT} from "../src/tokenization/SwapNFT.sol";
import {PositionRegistry} from "../src/tokenization/PositionRegistry.sol";

import {SettlementEngine} from "../src/swaps/SettlementEngine.sol";
import {NettingEngine} from "../src/swaps/NettingEngine.sol";
import {SwapFactory} from "../src/swaps/SwapFactory.sol";
import {SwapEngine} from "../src/swaps/SwapEngine.sol";

import {EscrowManager} from "../src/settlement/EscrowManager.sol";
import {DvPEngine} from "../src/settlement/DvPEngine.sol";

contract Deploy is Script {
function run() external {
vm.startBroadcast();


    address deployer = msg.sender;

    // --------------------------------------------------
    // Core Infrastructure
    // --------------------------------------------------

    MockUSDC usdc = new MockUSDC(deployer);
    MockPriceOracle oracle = new MockPriceOracle(deployer);

    Governance governance = new Governance(
        deployer,
        deployer
    );

    InterestRateModel interestModel =
        new InterestRateModel(deployer);

    // --------------------------------------------------
    // Lending
    // --------------------------------------------------

    CollateralVault vault =
        new CollateralVault(deployer);

    LendingPool lendingPool = new LendingPool(
        address(usdc),
        address(interestModel),
        address(governance),
        deployer
    );

    LoanNFT loanNFT = new LoanNFT(deployer);

    PositionRegistry registry =
        new PositionRegistry(deployer);

    LoanManager loanManager = new LoanManager(
        address(lendingPool),
        address(vault),
        address(oracle),
        address(usdc),
        deployer
    );

    // --------------------------------------------------
    // Settlement Layer
    // --------------------------------------------------

    SettlementEngine settlementEngine =
        new SettlementEngine(deployer);

    NettingEngine nettingEngine =
        new NettingEngine(
            address(settlementEngine),
            deployer
        );

    EscrowManager escrow =
        new EscrowManager(
            address(usdc),
            deployer
        );

    DvPEngine dvpEngine = new DvPEngine(
        address(settlementEngine),
        address(nettingEngine),
        address(escrow),
        deployer
    );

    // --------------------------------------------------
    // Swap Layer
    // --------------------------------------------------

    SwapFactory swapFactory =
        new SwapFactory(deployer);

    SwapNFT swapNFT = new SwapNFT(deployer);

    SwapEngine swapEngine = new SwapEngine(
        address(swapFactory),
        address(settlementEngine),
        address(lendingPool),
        address(dvpEngine),
        address(swapNFT),
        address(registry),
        address(loanNFT),
        deployer
    );

    // --------------------------------------------------
    // Wire Permissions
    // --------------------------------------------------

    // Lending
    lendingPool.setLoanManager(address(loanManager));
    vault.transferOwnership(address(loanManager));

    // Loan NFT
    loanNFT.setLoanManager(address(loanManager));

    // LoanManager integrations
    loanManager.setLoanNFT(address(loanNFT));
    loanManager.setPositionRegistry(address(registry));
    loanManager.setSwapEngine(address(swapEngine));

    // Position registry
    registry.setLoanManager(address(loanManager));
    registry.setSwapEngine(address(swapEngine));

    // Swap NFT
    swapNFT.setSwapEngine(address(swapEngine));

    // SwapFactory
    swapFactory.setSwapEngine(address(swapEngine));

    // Settlement layer
    settlementEngine.setSwapEngine(address(swapEngine));
    settlementEngine.setDvPEngine(address(dvpEngine));

    // Escrow / DvP
    escrow.setDvPEngine(address(dvpEngine));

    vm.stopBroadcast();

    // --------------------------------------------------
    // Output
    // --------------------------------------------------

    console2.log("================ HedgeFi Deployment ================");
    console2.log("Deployer:", deployer);
    console2.log("MockUSDC:", address(usdc));
    console2.log("MockPriceOracle:", address(oracle));
    console2.log("Governance:", address(governance));
    console2.log("InterestRateModel:", address(interestModel));
    console2.log("CollateralVault:", address(vault));
    console2.log("LendingPool:", address(lendingPool));
    console2.log("LoanManager:", address(loanManager));
    console2.log("LoanNFT:", address(loanNFT));
    console2.log("PositionRegistry:", address(registry));
    console2.log("SwapFactory:", address(swapFactory));
    console2.log("SwapNFT:", address(swapNFT));
    console2.log("SettlementEngine:", address(settlementEngine));
    console2.log("NettingEngine:", address(nettingEngine));
    console2.log("EscrowManager:", address(escrow));
    console2.log("DvPEngine:", address(dvpEngine));
    console2.log("SwapEngine:", address(swapEngine));
    console2.log("====================================================");
}


}
