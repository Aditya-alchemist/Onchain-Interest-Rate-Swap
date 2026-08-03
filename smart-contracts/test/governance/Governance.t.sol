// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Governance} from "../../src/governance/Governance.sol";

contract GovernanceTest is Test {
Governance gov;


address governor = address(this);
address treasury = address(0x1111);
address alice = address(0xA11CE);
address keeper = address(0xBEEF);

function setUp() public {
    gov = new Governance(governor, treasury);
}

// --------------------------------------------------
// Initial State
// --------------------------------------------------

function testInitialTreasury() public {
    assertEq(gov.treasury(), treasury);
}

function testInitialCollateralFactor() public {
    assertEq(gov.collateralFactorBps(), 7500);
}

function testInitialLiquidationThreshold() public {
    assertEq(gov.liquidationThresholdBps(), 8000);
}

function testInitialLiquidationBonus() public {
    assertEq(gov.liquidationBonusBps(), 500);
}

function testInitialBorrowRates() public {
    assertEq(gov.baseBorrowRateBps(), 200);
    assertEq(gov.maxBorrowRateBps(), 2000);
}

function testInitialSettlementInterval() public {
    assertEq(gov.settlementInterval(), 30 days);
}

function testInitialProtocolFee() public {
    assertEq(gov.protocolFeeBps(), 100);
}

// --------------------------------------------------
// Treasury
// --------------------------------------------------

function testSetTreasury() public {
    gov.setTreasury(alice);
    assertEq(gov.treasury(), alice);
}

function testNonGovernorCannotSetTreasury() public {
    vm.prank(alice);
    vm.expectRevert();

    gov.setTreasury(alice);
}

// --------------------------------------------------
// Collateral Parameters
// --------------------------------------------------

function testSetCollateralFactor() public {
    gov.setCollateralFactor(7000);
    assertEq(gov.collateralFactorBps(), 7000);
}

function testSetLiquidationThreshold() public {
    gov.setLiquidationThreshold(8500);
    assertEq(gov.liquidationThresholdBps(), 8500);
}

function testSetLiquidationBonus() public {
    gov.setLiquidationBonus(800);
    assertEq(gov.liquidationBonusBps(), 800);
}

function testInvalidLiquidationThresholdReverts() public {
    vm.expectRevert();

    gov.setLiquidationThreshold(7000); // below collateral factor
}

// --------------------------------------------------
// Interest Rates
// --------------------------------------------------

function testSetBorrowRateBounds() public {
    gov.setBorrowRateBounds(300, 2500);

    assertEq(gov.baseBorrowRateBps(), 300);
    assertEq(gov.maxBorrowRateBps(), 2500);
}

function testInvalidBorrowRateBoundsReverts() public {
    vm.expectRevert();

    gov.setBorrowRateBounds(3000, 2000);
}

// --------------------------------------------------
// Swap Parameters
// --------------------------------------------------

function testSetSettlementInterval() public {
    gov.setSettlementInterval(7 days);

    assertEq(gov.settlementInterval(), 7 days);
}

function testSetProtocolFee() public {
    gov.setProtocolFee(250);

    assertEq(gov.protocolFeeBps(), 250);
}

function testProtocolFeeTooHighReverts() public {
    vm.expectRevert();

    gov.setProtocolFee(1500);
}

// --------------------------------------------------
// Keeper Role
// --------------------------------------------------

function testGrantKeeper() public {
    gov.grantKeeper(keeper);

    assertTrue(gov.isKeeper(keeper));
}

function testRevokeKeeper() public {
    gov.grantKeeper(keeper);
    gov.revokeKeeper(keeper);

    assertFalse(gov.isKeeper(keeper));
}

function testNonGovernorCannotGrantKeeper() public {
    vm.prank(alice);
    vm.expectRevert();

    gov.grantKeeper(keeper);
}

// --------------------------------------------------
// Pause / Unpause
// --------------------------------------------------

function testPauseAndUnpause() public {
    gov.pause();

    assertTrue(gov.paused());

    gov.unpause();

    assertFalse(gov.paused());
}

function testNonGovernorCannotPause() public {
    vm.prank(alice);
    vm.expectRevert();

    gov.pause();
}


}
