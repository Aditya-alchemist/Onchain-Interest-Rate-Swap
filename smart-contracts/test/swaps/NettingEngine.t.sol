// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {SettlementEngine} from "../../src/swaps/SettlementEngine.sol";
import {NettingEngine} from "../../src/swaps/NettingEngine.sol";
import {SwapMath} from "../../src/libraries/SwapMath.sol";

contract NettingEngineTest is Test {
SettlementEngine settlementEngine;
NettingEngine nettingEngine;


address owner = address(this);
address swapEngine = address(0xBEEF);
address dvpEngine = address(0xCAFE);

address fixedPayer = address(0xA11CE);
address floatingPayer = address(0xB0B);

function setUp() public {
    settlementEngine = new SettlementEngine(owner);

    settlementEngine.setSwapEngine(swapEngine);
    settlementEngine.setDvPEngine(dvpEngine);

    nettingEngine = new NettingEngine(
        address(settlementEngine),
        owner
    );
}

// --------------------------------------------------
// Empty State
// --------------------------------------------------

function testNoSettlementsReturnsZeroObligation() public {
    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, address(0));
    assertEq(obligation.payee, address(0));
    assertEq(obligation.amountUsdc, 0);
}

function testHasNetObligationFalseInitially() public {
    assertFalse(nettingEngine.hasNetObligation(1));
}

// --------------------------------------------------
// Single Settlement
// --------------------------------------------------

function testSingleFixedPayerReceivesSettlement() public {
    vm.prank(swapEngine);

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, floatingPayer);
    assertEq(obligation.payee, fixedPayer);
    assertEq(obligation.amountUsdc, 1_000e6);

    assertTrue(nettingEngine.hasNetObligation(1));
}

function testSingleFloatingPayerReceivesSettlement() public {
    vm.prank(swapEngine);

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, fixedPayer);
    assertEq(obligation.payee, floatingPayer);
    assertEq(obligation.amountUsdc, 2_000e6);

    assertTrue(nettingEngine.hasNetObligation(1));
}

// --------------------------------------------------
// Multiple Settlements
// --------------------------------------------------

function testNettingOffsetsOppositeDirections() public {
    vm.startPrank(swapEngine);

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        5_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, floatingPayer);
    assertEq(obligation.payee, fixedPayer);
    assertEq(obligation.amountUsdc, 3_000e6);
}

function testNettingExactOffsetReturnsZero() public {
    vm.startPrank(swapEngine);

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        4_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        4_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, address(0));
    assertEq(obligation.payee, address(0));
    assertEq(obligation.amountUsdc, 0);

    assertFalse(nettingEngine.hasNetObligation(1));
}

function testNettingMultipleFixedReceivesSettlements() public {
    vm.startPrank(swapEngine);

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        2_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        3_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.stopPrank();

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, floatingPayer);
    assertEq(obligation.payee, fixedPayer);
    assertEq(obligation.amountUsdc, 6_000e6);
}

// --------------------------------------------------
// Executed / Cancelled Settlements
// --------------------------------------------------

function testExecutedSettlementIgnored() public {
    vm.startPrank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            1,
            fixedPayer,
            floatingPayer,
            5_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    vm.prank(dvpEngine);
    settlementEngine.markExecuted(settlementId);

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, fixedPayer);
    assertEq(obligation.payee, floatingPayer);
    assertEq(obligation.amountUsdc, 2_000e6);
}

function testCancelledSettlementIgnored() public {
    vm.startPrank(swapEngine);

    uint256 settlementId =
        settlementEngine.recordSettlement(
            1,
            fixedPayer,
            floatingPayer,
            5_000e6,
            SwapMath.SettlementDirection.FixedPayerReceives
        );

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    vm.prank(dvpEngine);
    settlementEngine.cancelSettlement(settlementId);

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(1);

    assertEq(obligation.payer, fixedPayer);
    assertEq(obligation.payee, floatingPayer);
    assertEq(obligation.amountUsdc, 2_000e6);
}

// --------------------------------------------------
// Multiple Swaps
// --------------------------------------------------

function testDifferentSwapsRemainIndependent() public {
    vm.startPrank(swapEngine);

    settlementEngine.recordSettlement(
        1,
        fixedPayer,
        floatingPayer,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    settlementEngine.recordSettlement(
        2,
        fixedPayer,
        floatingPayer,
        7_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    NettingEngine.NetObligation memory swapOne =
        nettingEngine.calculateNetForSwap(1);

    NettingEngine.NetObligation memory swapTwo =
        nettingEngine.calculateNetForSwap(2);

    assertEq(swapOne.payer, floatingPayer);
    assertEq(swapOne.payee, fixedPayer);
    assertEq(swapOne.amountUsdc, 1_000e6);

    assertEq(swapTwo.payer, fixedPayer);
    assertEq(swapTwo.payee, floatingPayer);
    assertEq(swapTwo.amountUsdc, 7_000e6);
}


}
