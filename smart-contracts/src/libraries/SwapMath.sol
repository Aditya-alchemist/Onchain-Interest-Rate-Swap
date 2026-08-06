// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SwapMath
/// @notice Financial math library for HedgeFi interest-rate swaps.
/// @dev Rates are expressed in basis points (BPS). USDC uses 6 decimals.
library SwapMath {
uint256 internal constant BPS = 10_000;
uint256 internal constant YEAR = 365 days;


enum SettlementDirection {
    FixedPayerReceives,
    FloatingPayerReceives,
    NoPayment
}

/// @notice Fixed-leg payment for a settlement period.
function fixedPayment(
    uint256 notional,
    uint256 fixedRateBps,
    uint256 periodSeconds
) internal pure returns (uint256) {
    return
        (notional * fixedRateBps * periodSeconds) /
        (BPS * YEAR);
}

/// @notice Floating-leg payment for a settlement period.
function floatingPayment(
    uint256 notional,
    uint256 floatingRateBps,
    uint256 periodSeconds
) internal pure returns (uint256) {
    return
        (notional * floatingRateBps * periodSeconds) /
        (BPS * YEAR);
}

/// @notice Net settlement amount and payment direction.
function netSettlement(
    uint256 notional,
    uint256 fixedRateBps,
    uint256 floatingRateBps,
    uint256 periodSeconds
)
    internal
    pure
    returns (
        uint256 amount,
        SettlementDirection direction
    )
{
    uint256 fixedLeg = fixedPayment(
        notional,
        fixedRateBps,
        periodSeconds
    );

    uint256 floatingLeg = floatingPayment(
        notional,
        floatingRateBps,
        periodSeconds
    );

    if (fixedLeg > floatingLeg) {
        return (
            fixedLeg - floatingLeg,
            SettlementDirection.FloatingPayerReceives
        );
    }

    if (floatingLeg > fixedLeg) {
        return (
            floatingLeg - fixedLeg,
            SettlementDirection.FixedPayerReceives
        );
    }

    return (0, SettlementDirection.NoPayment);
}

/// @notice Approximate DV01 for one settlement period.
function dv01(
    uint256 notional,
    uint256 periodSeconds
) internal pure returns (uint256) {
    return
        (notional * periodSeconds) /
        (BPS * YEAR);
}

/// @notice Number of settlement periods remaining until maturity.
function remainingPeriods(
    uint256 currentTime,
    uint256 maturityTime,
    uint256 settlementInterval
) internal pure returns (uint256) {
    if (currentTime >= maturityTime) {
        return 0;
    }

    return
        (maturityTime - currentTime) /
        settlementInterval;
}

}
