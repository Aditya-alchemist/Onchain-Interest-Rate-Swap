// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC(address(this));
    }

    function testDecimals() public {
        assertEq(usdc.decimals(), 6);
    }

    function testMint() public {
        usdc.mint(alice, 1000e6);

        assertEq(usdc.balanceOf(alice), 1000e6);
    }

    function testBurn() public {
        usdc.mint(alice, 1000e6);
        usdc.burn(alice, 400e6);

        assertEq(usdc.balanceOf(alice), 600e6);
    }

    function testOnlyOwnerCanMint() public {
        vm.prank(alice);
        vm.expectRevert();

        usdc.mint(bob, 100e6);
    }

    function testOnlyOwnerCanBurn() public {
        usdc.mint(alice, 1000e6);

        vm.prank(alice);
        vm.expectRevert();

        usdc.burn(alice, 100e6);
    }
}