// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CollateralVault} from "../../src/lending/CollateralVault.sol";

contract CollateralVaultTest is Test {
    CollateralVault vault;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        vault = new CollateralVault(address(this));

        vm.deal(alice, 10 ether);
    }

    function testDepositCollateral() public {
        // Owner (LoanManager in production) deposits for Alice
        vault.depositFor{value: 2 ether}(alice);

        assertEq(vault.getCollateral(alice), 2 ether);
        assertEq(vault.totalCollateral(), 2 ether);
    }

    function testWithdrawCollateral() public {
        vault.depositFor{value: 3 ether}(alice);

        uint256 beforeBal = alice.balance;

        vault.withdrawTo(alice, 1 ether);

        assertEq(vault.getCollateral(alice), 2 ether);
        assertEq(vault.totalCollateral(), 2 ether);
        assertEq(alice.balance, beforeBal + 1 ether);
    }

    function testCannotWithdrawMoreThanDeposited() public {
        vault.depositFor{value: 1 ether}(alice);

        vm.expectRevert();

        vault.withdrawTo(alice, 2 ether);
    }

    function testOnlyOwnerCanWithdraw() public {
        vault.depositFor{value: 1 ether}(alice);

        vm.prank(bob);
        vm.expectRevert();

        vault.withdrawTo(alice, 1 ether);
    }

    function testOnlyOwnerCanDeposit() public {
        vm.prank(alice);
        vm.expectRevert();

        vault.depositFor{value: 1 ether}(alice);
    }

    function testRejectZeroDeposit() public {
        vm.expectRevert();

        vault.depositFor{value: 0}(alice);
    }
}