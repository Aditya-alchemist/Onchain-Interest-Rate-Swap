// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title InterestMath
/// @notice Library for interest accrual calculations in HedgeFi.
/// @dev Rates are expressed in basis points (BPS).
library InterestMath {
uint256 internal constant BPS = 10_000;
uint256 internal constant YEAR = 365 days;


/// @notice Calculate simple interest accrued over time.
/// @param principal Principal amount (USDC 6 decimals)
/// @param annualRateBps Annual borrow rate in basis points
/// @param startTime Loan start timestamp
/// @param currentTime Current timestamp
/// @return interest Interest accrued
function calculateInterest(
    uint256 principal,
    uint256 annualRateBps,
    uint256 startTime,
    uint256 currentTime
) internal pure returns (uint256 interest) {
    if (principal == 0) return 0;
    if (currentTime <= startTime) return 0;

    uint256 elapsed = currentTime - startTime;

    interest =
        (principal * annualRateBps * elapsed) /
        (BPS * YEAR);
}

/// @notice Total debt = principal + accrued interest.
function calculateTotalDebt(
    uint256 principal,
    uint256 annualRateBps,
    uint256 startTime,
    uint256 currentTime
) internal pure returns (uint256 totalDebt) {
    totalDebt =
        principal +
        calculateInterest(
            principal,
            annualRateBps,
            startTime,
            currentTime
        );
}


}
