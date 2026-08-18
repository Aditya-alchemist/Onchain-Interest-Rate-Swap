// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

// Core
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {Governance} from "../src/governance/Governance.sol";

// Lending
import {InterestRateModel} from "../src/lending/InterestRateModel.sol";
import {CollateralVault} from "../src/lending/CollateralVault.sol";
import {LendingPool} from "../src/lending/LendingPool.sol";
import {LoanManager} from "../src/lending/LoanManager.sol";

// Tokenization
import {LoanNFT} from "../src/tokenization/LoanNFT.sol";
import {SwapNFT} from "../src/tokenization/SwapNFT.sol";
import {PositionRegistry} from "../src/tokenization/PositionRegistry.sol";

// Swaps
import {SettlementEngine} from "../src/swaps/SettlementEngine.sol";
import {NettingEngine} from "../src/swaps/NettingEngine.sol";
import {SwapFactory} from "../src/swaps/SwapFactory.sol";
import {SwapEngine} from "../src/swaps/SwapEngine.sol";

// Settlement
import {EscrowManager} from "../src/settlement/EscrowManager.sol";
import {DvPEngine} from "../src/settlement/DvPEngine.sol";

// Liquidation
import {LiquidationEngine} from "../src/liquidation/LiquidationEngine.sol";


contract Deploy is Script {

    function run() external {

        uint256 deployerPrivateKey =
            vm.envUint("PRIVATE_KEY");

        address deployer =
            vm.addr(deployerPrivateKey);

        console2.log("");
        console2.log(
            "================================================="
        );
        console2.log(
            "             HedgeFi Deployment"
        );
        console2.log(
            "================================================="
        );
        console2.log(
            "Deployer:"
        );
        console2.logAddress(deployer);

        vm.startBroadcast(
            deployerPrivateKey
        );

        // ====================================================
        // CORE
        // ====================================================

        MockUSDC usdc =
            new MockUSDC(deployer);

        MockPriceOracle oracle =
            new MockPriceOracle(deployer);

        Governance governance =
            new Governance(
                deployer,
                deployer
            );

        InterestRateModel interestModel =
            new InterestRateModel(
                deployer
            );

        // ====================================================
        // LENDING
        // ====================================================

        CollateralVault vault =
            new CollateralVault(
                deployer
            );

        LendingPool lendingPool =
            new LendingPool(
                address(usdc),
                address(interestModel),
                address(governance),
                deployer
            );

        LoanNFT loanNFT =
            new LoanNFT(
                deployer
            );

        PositionRegistry registry =
            new PositionRegistry(
                deployer
            );

        LoanManager loanManager =
            new LoanManager(
                address(lendingPool),
                address(vault),
                address(oracle),
                address(usdc),
                deployer
            );

        // ====================================================
        // SETTLEMENT
        // ====================================================

        SettlementEngine settlementEngine =
            new SettlementEngine(
                deployer
            );

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

        DvPEngine dvpEngine =
            new DvPEngine(
                address(settlementEngine),
                address(nettingEngine),
                address(escrow),
                deployer
            );

        // ====================================================
        // SWAPS
        // ====================================================

        SwapFactory swapFactory =
            new SwapFactory(
                deployer
            );

        SwapNFT swapNFT =
            new SwapNFT(
                deployer
            );

        SwapEngine swapEngine =
            new SwapEngine(
                address(swapFactory),
                address(settlementEngine),
                address(lendingPool),
                address(dvpEngine),
                address(swapNFT),
                address(registry),
                address(loanNFT),
                deployer
            );

        // ====================================================
        // LIQUIDATION
        // ====================================================

        LiquidationEngine liquidationEngine =
            new LiquidationEngine(
                deployer,
                address(loanManager)
            );

        // ====================================================
        // WIRING
        // ====================================================

        // LendingPool
        lendingPool.setLoanManager(
            address(loanManager)
        );

        // CollateralVault
        vault.transferOwnership(
            address(loanManager)
        );

        // LoanNFT
        loanNFT.setLoanManager(
            address(loanManager)
        );

        // LoanManager
        loanManager.setLoanNFT(
            address(loanNFT)
        );

        loanManager.setPositionRegistry(
            address(registry)
        );

        loanManager.setSwapEngine(
            address(swapEngine)
        );

        loanManager.setLiquidationEngine(
            address(liquidationEngine)
        );

        // PositionRegistry
        registry.setLoanManager(
            address(loanManager)
        );

        registry.setSwapEngine(
            address(swapEngine)
        );

        // SwapNFT
        swapNFT.setSwapEngine(
            address(swapEngine)
        );

        // SwapFactory
        swapFactory.setSwapEngine(
            address(swapEngine)
        );

        // SettlementEngine
        settlementEngine.setSwapEngine(
            address(swapEngine)
        );

        settlementEngine.setDvPEngine(
            address(dvpEngine)
        );

        // Escrow
        escrow.setDvPEngine(
            address(dvpEngine)
        );

        // DvP
        dvpEngine.setSwapEngine(
            address(swapEngine)
        );

        vm.stopBroadcast();

        // ====================================================
        // OUTPUT
        // ====================================================

        console2.log("");
        console2.log(
            "================================================="
        );
        console2.log(
            "          HedgeFi Deployment Complete"
        );
        console2.log(
            "================================================="
        );

        console2.log("");
        console2.log("MockUSDC:");
        console2.logAddress(address(usdc));

        console2.log("MockPriceOracle:");
        console2.logAddress(address(oracle));

        console2.log("Governance:");
        console2.logAddress(address(governance));

        console2.log("InterestRateModel:");
        console2.logAddress(address(interestModel));

        console2.log("CollateralVault:");
        console2.logAddress(address(vault));

        console2.log("LendingPool:");
        console2.logAddress(address(lendingPool));

        console2.log("LoanManager:");
        console2.logAddress(address(loanManager));

        console2.log("LoanNFT:");
        console2.logAddress(address(loanNFT));

        console2.log("PositionRegistry:");
        console2.logAddress(address(registry));

        console2.log("SwapNFT:");
        console2.logAddress(address(swapNFT));

        console2.log("SwapFactory:");
        console2.logAddress(address(swapFactory));

        console2.log("SwapEngine:");
        console2.logAddress(address(swapEngine));

        console2.log("SettlementEngine:");
        console2.logAddress(
            address(settlementEngine)
        );

        console2.log("NettingEngine:");
        console2.logAddress(
            address(nettingEngine)
        );

        console2.log("EscrowManager:");
        console2.logAddress(
            address(escrow)
        );

        console2.log("DvPEngine:");
        console2.logAddress(
            address(dvpEngine)
        );

        console2.log("LiquidationEngine:");
        console2.logAddress(
            address(liquidationEngine)
        );

        console2.log("");
        console2.log(
            "================================================="
        );
    }
}