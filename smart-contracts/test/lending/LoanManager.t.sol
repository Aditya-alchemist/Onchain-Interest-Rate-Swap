// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockPriceOracle} from "../../src/mocks/MockPriceOracle.sol";
import {Governance} from "../../src/governance/Governance.sol";
import {InterestRateModel} from "../../src/lending/InterestRateModel.sol";
import {CollateralVault} from "../../src/lending/CollateralVault.sol";
import {LendingPool} from "../../src/lending/LendingPool.sol";
import {LoanManager} from "../../src/lending/LoanManager.sol";

contract LoanManagerTest is Test {
    MockUSDC usdc;
    MockPriceOracle oracle;
    Governance gov;
    InterestRateModel model;
    CollateralVault vault;
    LendingPool pool;
    LoanManager manager;

    address lender = address(0xB0B);
    address borrower = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC(address(this));
        oracle = new MockPriceOracle(address(this));
        gov = new Governance(address(this), address(this));
        model = new InterestRateModel(address(this));
        vault = new CollateralVault(address(this));

        pool = new LendingPool(
            address(usdc),
            address(model),
            address(gov),
            address(this)
        );

        manager = new LoanManager(
            address(pool),
            address(vault),
            address(oracle),
            address(usdc),
            address(this)
        );

        pool.setLoanManager(address(manager));
        vault.transferOwnership(address(manager));

        usdc.mint(lender, 100_000e6);

        vm.startPrank(lender);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(100_000e6);
        vm.stopPrank();

        vm.deal(borrower, 10 ether);
    }

    function testBorrowWithETHCollateral() public {
        vm.prank(borrower);
        manager.borrow{value: 2 ether}(5_000e6);

        (
    uint256 collateralEth,
    uint256 principalUsdc,
    ,
    ,
    ,
    bool active
) = manager.loans(borrower);

        assertEq(collateralEth, 2 ether);
        assertEq(principalUsdc, 5_000e6);
        assertTrue(active);

        assertEq(vault.getCollateral(borrower), 2 ether);
        assertEq(usdc.balanceOf(borrower), 5_000e6);
    }

    function testBorrowExceedsLimitReverts() public {
        vm.prank(borrower);
        vm.expectRevert();

        manager.borrow{value: 1 ether}(10_000e6);
    }

    function testCannotOpenSecondLoan() public {
        vm.prank(borrower);
        manager.borrow{value: 2 ether}(5_000e6);

        vm.prank(borrower);
        vm.expectRevert();

        manager.borrow{value: 1 ether}(1_000e6);
    }

    function testRepayLoan() public {
        vm.prank(borrower);
        manager.borrow{value: 2 ether}(5_000e6);

        vm.startPrank(borrower);
        usdc.approve(address(manager), 5_000e6);
        manager.repay();
        vm.stopPrank();

       (
    ,
    uint256 principal,
    ,
    ,
    ,
    bool active
) = manager.loans(borrower);

        assertEq(principal, 0);
        assertFalse(active);
        assertEq(vault.getCollateral(borrower), 0);
    }

    function testRepayWithoutLoanReverts() public {
        vm.prank(borrower);
        vm.expectRevert();

        manager.repay();
    }

    function testMaxBorrowable() public {
        uint256 maxBorrow = manager.maxBorrowable(2 ether);

        assertEq(maxBorrow, 6_000e6);
    }
}