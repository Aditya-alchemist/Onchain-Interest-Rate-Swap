// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InterestRateModel} from "../../src/lending/InterestRateModel.sol";

contract InterestRateModelTest is Test {
    InterestRateModel model;

    address alice = address(0xA11CE);

    function setUp() public {
        model = new InterestRateModel(address(this));
    }

    function testBorrowRateAtZeroUtilization() public {
        uint256 rate = model.getBorrowRate(100_000e6, 0);

        assertEq(rate, 200); // 2%
    }

    function testBorrowRateAtHalfUtilization() public {
        uint256 rate = model.getBorrowRate(100_000e6, 50_000e6);

        assertEq(rate, 700); // 7%
    }

    function testBorrowRateAtKink() public {
        uint256 rate = model.getBorrowRate(100_000e6, 80_000e6);

        assertEq(rate, 1000); // 10%
    }

    function testBorrowRateAboveKink() public {
        uint256 rate = model.getBorrowRate(100_000e6, 90_000e6);

        assertEq(rate, 2500); // 25%
    }

    function testUtilizationCalculation() public {
        uint256 util = model.getUtilization(100_000e6, 50_000e6);

        assertEq(util, 5000); // 50%
    }

    function testOwnerCanUpdateParameters() public {
        model.setParameters(300, 1000, 4000, 8500);

        assertEq(model.baseRateBps(), 300);
        assertEq(model.slope1Bps(), 1000);
        assertEq(model.slope2Bps(), 4000);
        assertEq(model.kinkBps(), 8500);
    }

    function testNonOwnerCannotUpdateParameters() public {
        vm.prank(alice);
        vm.expectRevert();

        model.setParameters(300, 1000, 4000, 8500);
    }
}