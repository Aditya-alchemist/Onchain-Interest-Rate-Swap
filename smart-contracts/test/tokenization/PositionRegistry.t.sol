// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PositionRegistry} from "../../src/tokenization/PositionRegistry.sol";

contract PositionRegistryTest is Test {
PositionRegistry registry;


address owner = address(this);
address loanManager = address(0xA11CE);
address swapEngine = address(0xBEEF);
address attacker = address(0xBAD);

uint256 loanTokenId = 12;
uint256 swapTokenId = 3;

function setUp() public {
    registry = new PositionRegistry(owner);

    registry.setLoanManager(loanManager);
    registry.setSwapEngine(swapEngine);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function testSetLoanManager() public {
    address newManager = address(0x1234);

    registry.setLoanManager(newManager);

    assertEq(registry.loanManager(), newManager);
}

function testSetSwapEngine() public {
    address newEngine = address(0x5678);

    registry.setSwapEngine(newEngine);

    assertEq(registry.swapEngine(), newEngine);
}

function testOnlyOwnerCanConfigure() public {
    vm.prank(attacker);
    vm.expectRevert();
    registry.setLoanManager(attacker);

    vm.prank(attacker);
    vm.expectRevert();
    registry.setSwapEngine(attacker);
}

// --------------------------------------------------
// Linking
// --------------------------------------------------

function testLinkPositionFromLoanManager() public {
    vm.prank(loanManager);
    registry.linkPosition(loanTokenId, swapTokenId);

    PositionRegistry.PositionLink memory position =
        registry.getPosition(loanTokenId);

    assertEq(position.loanTokenId, loanTokenId);
    assertEq(position.swapTokenId, swapTokenId);
    assertTrue(position.active);

    assertEq(
        registry.getSwapTokenId(loanTokenId),
        swapTokenId
    );

    assertEq(
        registry.getLoanTokenId(swapTokenId),
        loanTokenId
    );

    assertTrue(
        registry.hasActiveHedge(loanTokenId)
    );
}

function testLinkPositionFromSwapEngine() public {
    vm.prank(swapEngine);
    registry.linkPosition(loanTokenId, swapTokenId);

    assertTrue(
        registry.hasActiveHedge(loanTokenId)
    );
}

function testCannotLinkSameLoanTwice() public {
    vm.prank(loanManager);
    registry.linkPosition(loanTokenId, swapTokenId);

    vm.prank(loanManager);
    vm.expectRevert();
    registry.linkPosition(loanTokenId, 99);
}

function testUnauthorizedCannotLink() public {
    vm.prank(attacker);
    vm.expectRevert();
    registry.linkPosition(loanTokenId, swapTokenId);
}

// --------------------------------------------------
// Unlinking
// --------------------------------------------------

function testUnlinkPosition() public {
    vm.prank(loanManager);
    registry.linkPosition(loanTokenId, swapTokenId);

    vm.prank(loanManager);
    registry.unlinkPosition(loanTokenId);

    PositionRegistry.PositionLink memory position =
        registry.getPosition(loanTokenId);

    assertEq(position.loanTokenId, 0);
    assertEq(position.swapTokenId, 0);
    assertFalse(position.active);

    assertEq(
        registry.getSwapTokenId(loanTokenId),
        0
    );

    assertEq(
        registry.getLoanTokenId(swapTokenId),
        0
    );

    assertFalse(
        registry.hasActiveHedge(loanTokenId)
    );
}

function testCannotUnlinkNonexistentPosition() public {
    vm.prank(loanManager);
    vm.expectRevert();
    registry.unlinkPosition(loanTokenId);
}

function testUnauthorizedCannotUnlink() public {
    vm.prank(loanManager);
    registry.linkPosition(loanTokenId, swapTokenId);

    vm.prank(attacker);
    vm.expectRevert();
    registry.unlinkPosition(loanTokenId);
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function testHasActiveHedgeFalseInitially() public {
    assertFalse(
        registry.hasActiveHedge(loanTokenId)
    );
}

function testGetSwapTokenIdReturnsZeroWhenNotLinked() public {
    assertEq(
        registry.getSwapTokenId(loanTokenId),
        0
    );
}

function testGetLoanTokenIdReturnsZeroWhenNotLinked() public {
    assertEq(
        registry.getLoanTokenId(swapTokenId),
        0
    );
}


}
