// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SwapFactory} from "../../src/swaps/SwapFactory.sol";

contract SwapFactoryTest is Test {
SwapFactory factory;


address owner = address(this);
address swapEngine = address(0xBEEF);
address borrower = address(0xA11CE);
address counterparty = address(0xCAFE);
address attacker = address(0xBAD);

uint256 loanTokenId = 12;

function setUp() public {
    factory = new SwapFactory(owner);
    factory.setSwapEngine(swapEngine);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function testSetSwapEngine() public {
    address newEngine = address(0x1234);

    factory.setSwapEngine(newEngine);

    assertEq(factory.swapEngine(), newEngine);
}

function testOnlyOwnerCanSetSwapEngine() public {
    vm.prank(attacker);
    vm.expectRevert();

    factory.setSwapEngine(attacker);
}

// --------------------------------------------------
// Swap Creation
// --------------------------------------------------

function testCreateSwap() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.prank(swapEngine);

    uint256 swapId = factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    assertEq(swapId, 1);

    SwapFactory.SwapPosition memory position =
        factory.getSwap(swapId);

    assertEq(position.loanTokenId, loanTokenId);
    assertEq(position.fixedPayer, borrower);
    assertEq(position.floatingPayer, counterparty);
    assertEq(position.notionalUsdc, 5_000e6);
    assertEq(position.fixedRateBps, 500);
    assertEq(position.maturityTime, maturity);
    assertEq(position.settlementInterval, 30 days);
    assertEq(
        uint256(position.status),
        uint256(SwapFactory.SwapStatus.Active)
    );

    assertEq(factory.getSwapForLoan(loanTokenId), swapId);
    assertTrue(factory.hasActiveSwap(loanTokenId));
}
function testCannotCreateDuplicateSwapForLoan() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.startPrank(swapEngine);

    factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    vm.expectRevert();

    factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        6_000e6,
        600,
        maturity,
        30 days
    );

    vm.stopPrank();
}

function testUnauthorizedCannotCreateSwap() public {
    vm.prank(attacker);
    vm.expectRevert();

    factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        block.timestamp + 180 days,
        30 days
    );
}

// --------------------------------------------------
// Settlement Updates
// --------------------------------------------------

function testUpdateSettlement() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.prank(swapEngine);

    uint256 swapId = factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    uint256 newTime = block.timestamp + 30 days;

    vm.prank(swapEngine);

    factory.updateSettlement(
        swapId,
        newTime
    );

    SwapFactory.SwapPosition memory position =
        factory.getSwap(swapId);

    assertEq(
        position.lastSettlementTime,
        newTime
    );
}

function testUnauthorizedCannotUpdateSettlement() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.prank(swapEngine);

    uint256 swapId = factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    vm.prank(attacker);
    vm.expectRevert();

    factory.updateSettlement(
        swapId,
        block.timestamp + 30 days
    );
}

// --------------------------------------------------
// Lifecycle
// --------------------------------------------------

function testMarkMatured() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.prank(swapEngine);

    uint256 swapId = factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    vm.prank(swapEngine);

    factory.markMatured(swapId);

    SwapFactory.SwapPosition memory position =
        factory.getSwap(swapId);

    assertEq(
        uint256(position.status),
        uint256(SwapFactory.SwapStatus.Matured)
    );
}

function testCloseSwap() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.prank(swapEngine);

    uint256 swapId = factory.createSwap(
        loanTokenId,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    vm.prank(swapEngine);

    factory.closeSwap(swapId);

    SwapFactory.SwapPosition memory position =
        factory.getSwap(swapId);

    assertEq(
        uint256(position.status),
        uint256(SwapFactory.SwapStatus.Closed)
    );

    assertEq(
        factory.getSwapForLoan(loanTokenId),
        0
    );

    assertFalse(
        factory.hasActiveSwap(loanTokenId)
    );
}

function testCloseSwapTwiceIsSafe() public {
uint256 maturity = block.timestamp + 180 days;

vm.prank(swapEngine);
uint256 swapId = factory.createSwap(
    loanTokenId,
    borrower,
    counterparty,
    5_000e6,
    500,
    maturity,
    30 days
);

vm.startPrank(swapEngine);

// First close
factory.closeSwap(swapId);

// Second close should NOT revert
factory.closeSwap(swapId);

vm.stopPrank();

SwapFactory.SwapPosition memory position =
    factory.getSwap(swapId);

assertEq(
    uint256(position.status),
    uint256(SwapFactory.SwapStatus.Closed)
);

assertEq(factory.getSwapForLoan(loanTokenId), 0);
assertFalse(factory.hasActiveSwap(loanTokenId));

}

// --------------------------------------------------
// Views
// --------------------------------------------------

function testHasActiveSwapFalseInitially() public {
    assertFalse(
        factory.hasActiveSwap(loanTokenId)
    );
}

function testGetSwapForLoanReturnsZeroInitially() public {
    assertEq(
        factory.getSwapForLoan(loanTokenId),
        0
    );
}

function testSwapIdIncrements() public {
    uint256 maturity = block.timestamp + 180 days;

    vm.startPrank(swapEngine);

    uint256 swap1 = factory.createSwap(
        12,
        borrower,
        counterparty,
        5_000e6,
        500,
        maturity,
        30 days
    );

    uint256 swap2 = factory.createSwap(
        13,
        borrower,
        counterparty,
        6_000e6,
        600,
        maturity,
        30 days
    );

    vm.stopPrank();

    assertEq(swap1, 1);
    assertEq(swap2, 2);
    assertEq(factory.nextSwapId(), 2);
}


}
