// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {SettlementEngine} from "../../src/swaps/SettlementEngine.sol";
import {SwapMath} from "../../src/libraries/SwapMath.sol";

contract SettlementEngineTest is Test {
SettlementEngine engine;


address owner = address(this);
address swapEngine = address(0xBEEF);
address dvpEngine = address(0xCAFE);
address alice = address(0xA11CE);
address bob = address(0xB0B);
address attacker = address(0xBAD);

function setUp() public {
    engine = new SettlementEngine(owner);

    engine.setSwapEngine(swapEngine);
    engine.setDvPEngine(dvpEngine);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function testSetSwapEngine() public {
    address newEngine = address(0x1234);

    engine.setSwapEngine(newEngine);

    assertEq(engine.swapEngine(), newEngine);
}

function testSetDvPEngine() public {
    address newEngine = address(0x5678);

    engine.setDvPEngine(newEngine);

    assertEq(engine.dvpEngine(), newEngine);
}

function testOnlyOwnerCanSetSwapEngine() public {
    vm.prank(attacker);
    vm.expectRevert();

    engine.setSwapEngine(attacker);
}

function testOnlyOwnerCanSetDvPEngine() public {
    vm.prank(attacker);
    vm.expectRevert();

    engine.setDvPEngine(attacker);
}

function testCannotSetZeroAddress() public {
    vm.expectRevert();
    engine.setSwapEngine(address(0));

    vm.expectRevert();
    engine.setDvPEngine(address(0));
}

// --------------------------------------------------
// Settlement Recording
// --------------------------------------------------

function testRecordSettlement() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    assertEq(settlementId, 1);
    assertEq(engine.nextSettlementId(), 1);

    SettlementEngine.Settlement memory s =
        engine.getSettlement(settlementId);

    assertEq(s.settlementId, 1);
    assertEq(s.swapId, 1);
    assertEq(s.fixedPayer, alice);
    assertEq(s.floatingPayer, bob);
    assertEq(s.amountUsdc, 1_000e6);
    assertEq(
        uint256(s.direction),
        uint256(SwapMath.SettlementDirection.FixedPayerReceives)
    );
    assertEq(
        uint256(s.status),
        uint256(SettlementEngine.SettlementStatus.Pending)
    );
    assertEq(s.settlementTime, block.timestamp);
}

function testSettlementIdIncrements() public {
    vm.startPrank(swapEngine);

    uint256 first = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    uint256 second = engine.recordSettlement(
        2,
        alice,
        bob,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    assertEq(first, 1);
    assertEq(second, 2);
    assertEq(engine.nextSettlementId(), 2);
}

function testUnauthorizedCannotRecordSettlement() public {
    vm.prank(attacker);
    vm.expectRevert();

    engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );
}

// --------------------------------------------------
// Execution
// --------------------------------------------------

function testMarkSettlementExecuted() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.prank(dvpEngine);
    engine.markExecuted(settlementId);

    SettlementEngine.Settlement memory s =
        engine.getSettlement(settlementId);

    assertEq(
        uint256(s.status),
        uint256(SettlementEngine.SettlementStatus.Executed)
    );
}

function testCannotExecuteTwice() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.startPrank(dvpEngine);

    engine.markExecuted(settlementId);

    vm.expectRevert();

    engine.markExecuted(settlementId);

    vm.stopPrank();
}

function testUnauthorizedCannotMarkExecuted() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.prank(attacker);
    vm.expectRevert();

    engine.markExecuted(settlementId);
}

// --------------------------------------------------
// Cancellation
// --------------------------------------------------

function testCancelSettlement() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.prank(dvpEngine);
    engine.cancelSettlement(settlementId);

    SettlementEngine.Settlement memory s =
        engine.getSettlement(settlementId);

    assertEq(
        uint256(s.status),
        uint256(SettlementEngine.SettlementStatus.Cancelled)
    );
}

function testCannotCancelTwice() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.startPrank(dvpEngine);

    engine.cancelSettlement(settlementId);

    vm.expectRevert();

    engine.cancelSettlement(settlementId);

    vm.stopPrank();
}

function testCannotCancelExecutedSettlement() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.startPrank(dvpEngine);

    engine.markExecuted(settlementId);

    vm.expectRevert();

    engine.cancelSettlement(settlementId);

    vm.stopPrank();
}

function testUnauthorizedCannotCancel() public {
    vm.prank(swapEngine);

    uint256 settlementId = engine.recordSettlement(
        1,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    vm.prank(attacker);
    vm.expectRevert();

    engine.cancelSettlement(settlementId);
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function testGetSettlementsForSwap() public {
    vm.startPrank(swapEngine);

    uint256 first = engine.recordSettlement(
        42,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    uint256 second = engine.recordSettlement(
        42,
        alice,
        bob,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    uint256[] memory ids =
        engine.getSettlementsForSwap(42);

    assertEq(ids.length, 2);
    assertEq(ids[0], first);
    assertEq(ids[1], second);
}

function testPendingSettlementsForSwap() public {
    vm.startPrank(swapEngine);

    uint256 first = engine.recordSettlement(
        7,
        alice,
        bob,
        1_000e6,
        SwapMath.SettlementDirection.FixedPayerReceives
    );

    engine.recordSettlement(
        7,
        alice,
        bob,
        2_000e6,
        SwapMath.SettlementDirection.FloatingPayerReceives
    );

    vm.stopPrank();

    assertEq(
        engine.pendingSettlementsForSwap(7),
        2
    );

    vm.prank(dvpEngine);
    engine.markExecuted(first);

    assertEq(
        engine.pendingSettlementsForSwap(7),
        1
    );
}

function testPendingSettlementsZeroForUnknownSwap() public {
    assertEq(
        engine.pendingSettlementsForSwap(999),
        0
    );
}


}
