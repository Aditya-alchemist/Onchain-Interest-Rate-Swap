// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {EscrowManager} from "../../src/settlement/EscrowManager.sol";

contract EscrowManagerTest is Test {
MockUSDC usdc;
EscrowManager escrow;


address owner = address(this);
address dvpEngine = address(0xCAFE);
address alice = address(0xA11CE);
address bob = address(0xB0B);
address attacker = address(0xBAD);

function setUp() public {
    usdc = new MockUSDC(owner);

    escrow = new EscrowManager(
        address(usdc),
        owner
    );

    escrow.setDvPEngine(dvpEngine);

    usdc.mint(alice, 100_000e6);
    usdc.mint(bob, 100_000e6);

    vm.prank(alice);
    usdc.approve(address(escrow), type(uint256).max);

    vm.prank(bob);
    usdc.approve(address(escrow), type(uint256).max);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function testSetDvPEngine() public {
    address newEngine = address(0x1234);

    escrow.setDvPEngine(newEngine);

    assertEq(escrow.dvpEngine(), newEngine);
}

function testOnlyOwnerCanSetDvPEngine() public {
    vm.prank(attacker);
    vm.expectRevert();

    escrow.setDvPEngine(attacker);
}

function testCannotSetZeroAddress() public {
    vm.expectRevert();

    escrow.setDvPEngine(address(0));
}

// --------------------------------------------------
// Deposits
// --------------------------------------------------

function testDeposit() public {
    vm.prank(alice);
    escrow.deposit(10_000e6);

    assertEq(
        escrow.availableBalance(alice),
        10_000e6
    );

    assertEq(
        escrow.lockedBalance(alice),
        0
    );

    assertEq(
        usdc.balanceOf(address(escrow)),
        10_000e6
    );
}

function testMultipleDeposits() public {
    vm.startPrank(alice);

    escrow.deposit(10_000e6);
    escrow.deposit(5_000e6);

    vm.stopPrank();

    assertEq(
        escrow.availableBalance(alice),
        15_000e6
    );

    assertEq(
        usdc.balanceOf(address(escrow)),
        15_000e6
    );
}

function testCannotDepositZero() public {
    vm.prank(alice);
    vm.expectRevert();

    escrow.deposit(0);
}

// --------------------------------------------------
// Withdrawals
// --------------------------------------------------

function testWithdraw() public {
    vm.startPrank(alice);

    escrow.deposit(10_000e6);
    escrow.withdraw(4_000e6);

    vm.stopPrank();

    assertEq(
        escrow.availableBalance(alice),
        6_000e6
    );

    assertEq(
        usdc.balanceOf(alice),
        94_000e6
    );

    assertEq(
        usdc.balanceOf(address(escrow)),
        6_000e6
    );
}

function testWithdrawFullBalance() public {
    vm.startPrank(alice);

    escrow.deposit(5_000e6);
    escrow.withdraw(5_000e6);

    vm.stopPrank();

    assertEq(
        escrow.availableBalance(alice),
        0
    );

    assertEq(
        usdc.balanceOf(address(escrow)),
        0
    );
}

function testCannotWithdrawZero() public {
    vm.prank(alice);
    vm.expectRevert();

    escrow.withdraw(0);
}

function testCannotWithdrawMoreThanAvailable() public {
    vm.startPrank(alice);

    escrow.deposit(5_000e6);

    vm.expectRevert();

    escrow.withdraw(6_000e6);

    vm.stopPrank();
}

// --------------------------------------------------
// Locking
// --------------------------------------------------

function testLockFunds() public {
    vm.prank(alice);
    escrow.deposit(10_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 4_000e6);

    assertEq(
        escrow.availableBalance(alice),
        6_000e6
    );

    assertEq(
        escrow.lockedBalance(alice),
        4_000e6
    );

    assertEq(
        escrow.totalBalance(alice),
        10_000e6
    );
}

function testCannotLockMoreThanAvailable() public {
    vm.prank(alice);
    escrow.deposit(5_000e6);

    vm.prank(dvpEngine);
    vm.expectRevert();

    escrow.lock(alice, 6_000e6);
}

function testUnauthorizedCannotLock() public {
    vm.prank(attacker);
    vm.expectRevert();

    escrow.lock(alice, 1_000e6);
}

// --------------------------------------------------
// Release
// --------------------------------------------------

function testReleaseFunds() public {
    vm.prank(alice);
    escrow.deposit(10_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 4_000e6);

    vm.prank(dvpEngine);
    escrow.release(alice, bob, 4_000e6);

    assertEq(
        escrow.availableBalance(alice),
        6_000e6
    );

    assertEq(
        escrow.lockedBalance(alice),
        0
    );

    assertEq(
        escrow.availableBalance(bob),
        4_000e6
    );
}

function testCannotReleaseMoreThanLocked() public {
    vm.prank(alice);
    escrow.deposit(5_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 2_000e6);

    vm.prank(dvpEngine);
    vm.expectRevert();

    escrow.release(alice, bob, 3_000e6);
}

function testUnauthorizedCannotRelease() public {
    vm.prank(attacker);
    vm.expectRevert();

    escrow.release(alice, bob, 1_000e6);
}

// --------------------------------------------------
// Refund
// --------------------------------------------------

function testRefundFunds() public {
    vm.prank(alice);
    escrow.deposit(10_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 4_000e6);

    vm.prank(dvpEngine);
    escrow.refund(alice, 4_000e6);

    assertEq(
        escrow.availableBalance(alice),
        10_000e6
    );

    assertEq(
        escrow.lockedBalance(alice),
        0
    );

    assertEq(
        escrow.totalBalance(alice),
        10_000e6
    );
}

function testCannotRefundMoreThanLocked() public {
    vm.prank(alice);
    escrow.deposit(5_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 2_000e6);

    vm.prank(dvpEngine);
    vm.expectRevert();

    escrow.refund(alice, 3_000e6);
}

function testUnauthorizedCannotRefund() public {
    vm.prank(attacker);
    vm.expectRevert();

    escrow.refund(alice, 1_000e6);
}

// --------------------------------------------------
// Balance Accounting
// --------------------------------------------------

function testTotalBalanceTracksAvailableAndLocked() public {
    vm.prank(alice);
    escrow.deposit(10_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 3_000e6);

    assertEq(
        escrow.availableBalance(alice),
        7_000e6
    );

    assertEq(
        escrow.lockedBalance(alice),
        3_000e6
    );

    assertEq(
        escrow.totalBalance(alice),
        10_000e6
    );
}

function testMultipleUsersRemainIndependent() public {
    vm.prank(alice);
    escrow.deposit(10_000e6);

    vm.prank(bob);
    escrow.deposit(20_000e6);

    vm.prank(dvpEngine);
    escrow.lock(alice, 2_000e6);

    assertEq(
        escrow.availableBalance(alice),
        8_000e6
    );

    assertEq(
        escrow.lockedBalance(alice),
        2_000e6
    );

    assertEq(
        escrow.availableBalance(bob),
        20_000e6
    );

    assertEq(
        escrow.lockedBalance(bob),
        0
    );
}


}
