// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SwapMath} from "../../src/libraries/SwapMath.sol";

/// @notice Wrapper contract exposing library functions for testing.
contract SwapMathWrapper {
function fixedPayment(
uint256 notional,
uint256 fixedRateBps,
uint256 periodSeconds
) external pure returns (uint256) {
return
SwapMath.fixedPayment(
notional,
fixedRateBps,
periodSeconds
);
}

function floatingPayment(
    uint256 notional,
    uint256 floatingRateBps,
    uint256 periodSeconds
) external pure returns (uint256) {
    return
        SwapMath.floatingPayment(
            notional,
            floatingRateBps,
            periodSeconds
        );
}

function netSettlement(
    uint256 notional,
    uint256 fixedRateBps,
    uint256 floatingRateBps,
    uint256 periodSeconds
)
    external
    pure
    returns (
        uint256 amount,
        SwapMath.SettlementDirection direction
    )
{
    return
        SwapMath.netSettlement(
            notional,
            fixedRateBps,
            floatingRateBps,
            periodSeconds
        );
}

function dv01(
    uint256 notional,
    uint256 periodSeconds
) external pure returns (uint256) {
    return SwapMath.dv01(notional, periodSeconds);
}

function remainingPeriods(
    uint256 currentTime,
    uint256 maturityTime,
    uint256 settlementInterval
) external pure returns (uint256) {
    return
        SwapMath.remainingPeriods(
            currentTime,
            maturityTime,
            settlementInterval
        );
}


}

contract SwapMathTest is Test {
SwapMathWrapper wrapper;


uint256 constant NOTIONAL = 5_000e6;      // 5,000 USDC
uint256 constant PERIOD = 30 days;

function setUp() public {
    wrapper = new SwapMathWrapper();
}

// --------------------------------------------------
// Fixed Leg
// --------------------------------------------------

function testFixedPayment5Percent30Days() public {
    uint256 payment = wrapper.fixedPayment(
        NOTIONAL,
        500,        // 5%
        PERIOD
    );

    // ≈ 20.547945 USDC
    assertEq(payment, 20_547_945);
}

// --------------------------------------------------
// Floating Leg
// --------------------------------------------------

function testFloatingPayment7Percent30Days() public {
    uint256 payment = wrapper.floatingPayment(
        NOTIONAL,
        700,        // 7%
        PERIOD
    );

    // ≈ 28.767123 USDC
    assertEq(payment, 28_767_123);
}

// --------------------------------------------------
// Net Settlement
// --------------------------------------------------

function testNetSettlementFloatingHigher() public {
    (
        uint256 amount,
        SwapMath.SettlementDirection direction
    ) = wrapper.netSettlement(
        NOTIONAL,
        500,
        700,
        PERIOD
    );

    // 28.767123 - 20.547945 = 8.219178
    assertEq(amount, 8_219_178);

    assertEq(
        uint256(direction),
        uint256(SwapMath.SettlementDirection.FixedPayerReceives)
    );
}

function testNetSettlementFixedHigher() public {
    (
        uint256 amount,
        SwapMath.SettlementDirection direction
    ) = wrapper.netSettlement(
        NOTIONAL,
        700,
        500,
        PERIOD
    );

    assertEq(amount, 8_219_178);

    assertEq(
        uint256(direction),
        uint256(SwapMath.SettlementDirection.FloatingPayerReceives)
    );
}

function testNetSettlementEqualRates() public {
    (
        uint256 amount,
        SwapMath.SettlementDirection direction
    ) = wrapper.netSettlement(
        NOTIONAL,
        600,
        600,
        PERIOD
    );

    assertEq(amount, 0);

    assertEq(
        uint256(direction),
        uint256(SwapMath.SettlementDirection.NoPayment)
    );
}

// --------------------------------------------------
// DV01
// --------------------------------------------------

function testDV01() public {
    uint256 value = wrapper.dv01(
        NOTIONAL,
        PERIOD
    );

    // ≈ 0.041095 USDC
    assertEq(value, 41_095);
}

// --------------------------------------------------
// Remaining Periods
// --------------------------------------------------

function testRemainingPeriods() public {
    uint256 current = 100 days;
    uint256 maturity = 365 days;
    uint256 interval = 30 days;

    uint256 remaining = wrapper.remainingPeriods(
        current,
        maturity,
        interval
    );

    // (365 - 100) / 30 = 8
    assertEq(remaining, 8);
}

function testRemainingPeriodsAfterMaturity() public {
    uint256 remaining = wrapper.remainingPeriods(
        400 days,
        365 days,
        30 days
    );

    assertEq(remaining, 0);
}


}
