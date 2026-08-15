// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {SettlementEngine} from "../../src/swaps/SettlementEngine.sol";
import {NettingEngine} from "../../src/swaps/NettingEngine.sol";
import {EscrowManager} from "../../src/settlement/EscrowManager.sol";
import {DvPEngine} from "../../src/settlement/DvPEngine.sol";
import {SwapMath} from "../../src/libraries/SwapMath.sol";

contract DvPEngineTest is Test {
MockUSDC usdc;


SettlementEngine settlementEngine;
NettingEngine nettingEngine;
EscrowManager escrowManager;
DvPEngine dvpEngine;

address owner = address(this);
address swapEngine = address(0xBEEF);

address fixedPayer = address(0xA11CE);
address floatingPayer = address(0xB0B);

function setUp() public {
    usdc = new MockUSDC(owner);

    settlementEngine = new SettlementEngine(owner);

    escrowManager = new EscrowManager(
        address(usdc),
        owner
    );

    nettingEngine = new NettingEngine(
        address(settlementEngine),
        owner
    );

    dvpEngine = new DvPEngine(
        address(settlementEngine),
        address(nettingEngine),
        address(escrowManager),
        owner
    );

    settlementEngine.setSwapEngine(swapEngine);
    settlementEngine.setDvPEngine(address(dvpEngine));

    escrowManager.setDvPEngine(address(dvpEngine));

    usdc.mint(fixedPayer, 100_000e6);
    usdc.mint(floatingPayer, 100_000e6);

    vm.prank(fixedPayer);
    usdc.approve(address(escrowManager), type(uint256).max);

    vm.prank(floatingPayer);
    usdc.approve(address(escrowManager), type(uint256).max);
}

// --------------------------------------------------
// Atomic Settlement
// --------------------------------------------------

function testExecuteSettlementFixedPayerReceives() public {
    vm.prank(floatingPayer);
    escrowManager.deposit(10_000e6);

    vm.prank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            1,
            fixedPayer,
            floatingPayer,
            5_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    dvpEngine.executeSettlement(settlementId);

    assertEq(
        escrowManager.availableBalance(floatingPayer),
        5_000e6
    );

    assertEq(
        escrowManager.availableBalance(fixedPayer),
        5_000e6
    );

    assertEq(
        escrowManager.lockedBalance(floatingPayer),
        0
    );

    SettlementEngine.Settlement memory s =
        settlementEngine.getSettlement(settlementId);

    assertEq(
        uint256(s.status),
        uint256(SettlementEngine.SettlementStatus.Executed)
    );
}

function testExecuteSettlementFloatingPayerReceives() public {
    vm.prank(fixedPayer);
    escrowManager.deposit(8_000e6);

    vm.prank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            2,
            fixedPayer,
            floatingPayer,
            3_000e6,
            SwapMath.SettlementDirection.FloatingPayerReceives
        );

    dvpEngine.executeSettlement(settlementId);

    assertEq(
        escrowManager.availableBalance(fixedPayer),
        5_000e6
    );

    assertEq(
        escrowManager.availableBalance(floatingPayer),
        3_000e6
    );

    SettlementEngine.Settlement memory s =
        settlementEngine.getSettlement(settlementId);

    assertEq(
        uint256(s.status),
        uint256(SettlementEngine.SettlementStatus.Executed)
    );
}

// --------------------------------------------------
// Authorization
// --------------------------------------------------

function testOnlyOwnerCanExecuteSettlement() public {
    vm.prank(floatingPayer);
    escrowManager.deposit(5_000e6);

    vm.prank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            3,
            fixedPayer,
            floatingPayer,
            1_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    vm.prank(address(0xBAD));
    vm.expectRevert();

    dvpEngine.executeSettlement(settlementId);
}

// --------------------------------------------------
// Failure Cases
// --------------------------------------------------

function testCannotExecuteSettlementTwice() public {
    vm.prank(floatingPayer);
    escrowManager.deposit(5_000e6);

    vm.prank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            4,
            fixedPayer,
            floatingPayer,
            2_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    dvpEngine.executeSettlement(settlementId);

    vm.expectRevert();

    dvpEngine.executeSettlement(settlementId);
}

function testCannotExecuteCancelledSettlement() public {
    vm.prank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            5,
            fixedPayer,
            floatingPayer,
            2_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    vm.prank(address(dvpEngine));
    settlementEngine.cancelSettlement(settlementId);

    vm.expectRevert();

    dvpEngine.executeSettlement(settlementId);
}

function testCannotExecuteWithoutEscrowFunds() public {
    vm.prank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            6,
            fixedPayer,
            floatingPayer,
            5_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    vm.expectRevert();

    dvpEngine.executeSettlement(settlementId);
}

function testCannotExecuteWhenNothingToSettle() public {
    vm.startPrank(swapEngine);

    settlementEngine.recordSettlement(
        7,
        fixedPayer,
        floatingPayer,
        2_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    uint256 settlementId =
        settlementEngine.recordSettlement(
            7,
            fixedPayer,
            floatingPayer,
            2_000e6,
            SwapMath.SettlementDirection.FloatingPayerReceives
        );

    vm.stopPrank();

    vm.expectRevert();

    dvpEngine.executeSettlement(settlementId);
}

// --------------------------------------------------
// Netting Integration
// --------------------------------------------------

function testExecuteSettlementUsesNettedAmount() public {
    vm.prank(floatingPayer);
    escrowManager.deposit(10_000e6);

    vm.startPrank(swapEngine);

    settlementEngine.recordSettlement(
        8,
        fixedPayer,
        floatingPayer,
        5_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    uint256 settlementId =
        settlementEngine.recordSettlement(
            8,
            fixedPayer,
            floatingPayer,
            2_000e6,
            SwapMath.SettlementDirection.FloatingPayerReceives
        );

    vm.stopPrank();

    dvpEngine.executeSettlement(settlementId);

    assertEq(
        escrowManager.availableBalance(floatingPayer),
        7_000e6
    );

    assertEq(
        escrowManager.availableBalance(fixedPayer),
        3_000e6
    );
}

}
