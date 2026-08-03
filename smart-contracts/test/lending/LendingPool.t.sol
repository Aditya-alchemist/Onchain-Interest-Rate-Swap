// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {Governance} from "../../src/governance/Governance.sol";
import {InterestRateModel} from "../../src/lending/InterestRateModel.sol";
import {LendingPool} from "../../src/lending/LendingPool.sol";

contract LendingPoolTest is Test {
    MockUSDC usdc;
    Governance gov;
    InterestRateModel model;
    LendingPool pool;

    address alice = address(0xA11CE);
    address loanManager = address(0xBEEF);

    function setUp() public {
        usdc = new MockUSDC(address(this));
        gov = new Governance(address(this), address(this));
        model = new InterestRateModel(address(this));

        pool = new LendingPool(
            address(usdc),
            address(model),
            address(gov),
            address(this)
        );

        pool.setLoanManager(loanManager);

        usdc.mint(alice, 100_000e6);

        vm.prank(alice);
        usdc.approve(address(pool), type(uint256).max);
    }

    function testDepositUSDC() public {
        vm.prank(alice);
        pool.deposit(10_000e6);

        assertEq(pool.totalDeposits(), 10_000e6);
        assertEq(pool.deposits(alice), 10_000e6);
        assertEq(usdc.balanceOf(address(pool)), 10_000e6);
    }

    function testWithdrawUSDC() public {
        vm.prank(alice);
        pool.deposit(10_000e6);

        vm.prank(alice);
        pool.withdraw(4_000e6);

        assertEq(pool.totalDeposits(), 6_000e6);
        assertEq(pool.deposits(alice), 6_000e6);
        assertEq(usdc.balanceOf(alice), 94_000e6);
    }

    function testIssueLoan() public {
        vm.prank(alice);
        pool.deposit(20_000e6);

        vm.prank(loanManager);
        pool.issueLoan(alice, 5_000e6);

        assertEq(pool.totalBorrows(), 5_000e6);
        assertEq(usdc.balanceOf(alice), 85_000e6);
    }

    function testReceiveRepayment() public {
        vm.prank(alice);
        pool.deposit(20_000e6);

        vm.prank(loanManager);
        pool.issueLoan(alice, 5_000e6);

        vm.startPrank(alice);
        usdc.approve(address(pool), 5_000e6);
        vm.stopPrank();

        vm.prank(loanManager);
        pool.receiveRepayment(alice, 5_000e6);

        assertEq(pool.totalBorrows(), 0);
        assertEq(usdc.balanceOf(address(pool)), 20_000e6);
    }

    function testCannotWithdrawMoreThanBalance() public {
        vm.prank(alice);
        pool.deposit(1_000e6);

        vm.prank(alice);
        vm.expectRevert();

        pool.withdraw(2_000e6);
    }

    function testOnlyLoanManagerCanIssueLoan() public {
        vm.prank(alice);
        pool.deposit(10_000e6);

        vm.prank(alice);
        vm.expectRevert();

        pool.issueLoan(alice, 1_000e6);
    }

    function testCurrentBorrowRate() public {
        vm.prank(alice);
        pool.deposit(100_000e6);

        vm.prank(loanManager);
        pool.issueLoan(alice, 50_000e6);

        uint256 rate = pool.currentBorrowRateBps();

        assertEq(rate, 700);
    }
}