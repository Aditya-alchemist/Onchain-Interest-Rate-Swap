// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockPriceOracle} from "../../src/mocks/MockPriceOracle.sol";

contract MockPriceOracleTest is Test {
    MockPriceOracle oracle;

    address alice = address(0xA11CE);

    function setUp() public {
        oracle = new MockPriceOracle(address(this));
    }

    function testInitialPrice() public {
        assertEq(oracle.getEthPrice(), 4000 * 1e8);
    }

    function testUpdatePrice() public {
        oracle.setEthPrice(3000 * 1e8);

        assertEq(oracle.getEthPrice(), 3000 * 1e8);
    }

    function testDecimals() public {
        assertEq(oracle.decimals(), 8);
    }

    function testOnlyOwnerCanUpdatePrice() public {
        vm.prank(alice);
        vm.expectRevert();

        oracle.setEthPrice(3500 * 1e8);
    }

    function testCannotSetZeroPrice() public {
        vm.expectRevert();

        oracle.setEthPrice(0);
    }
}