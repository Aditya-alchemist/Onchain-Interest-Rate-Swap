// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HealthFactor
/// @notice Library for calculating collateral health metrics in HedgeFi.
/// @dev Uses 1e18 precision for health factor calculations.
library HealthFactor {
uint256 internal constant BPS = 10_000;
uint256 internal constant WAD = 1e18;


/// @notice Calculate health factor with 1e18 precision.
/// @param collateralEth ETH collateral amount (18 decimals)
/// @param ethPrice ETH/USD price (8 decimals)
/// @param debtUsdc Outstanding debt in USDC (6 decimals)
/// @param liquidationThresholdBps Liquidation threshold in basis points
/// @return healthFactor 1e18 precision (1e18 = healthy threshold)
function calculate(
    uint256 collateralEth,
    uint256 ethPrice,
    uint256 debtUsdc,
    uint256 liquidationThresholdBps
) internal pure returns (uint256 healthFactor) {
    if (debtUsdc == 0) {
        return type(uint256).max;
    }

    // ETH collateral value in USD with 8 decimals
    uint256 collateralValueUsd = (collateralEth * ethPrice) / 1e18;

    // Apply liquidation threshold (still 8 decimals)
    uint256 adjustedCollateral =
        (collateralValueUsd * liquidationThresholdBps) / BPS;

    // Convert debt from USDC (6 decimals) to USD (8 decimals)
    uint256 debtUsd = debtUsdc * 100;

    // Return health factor with 1e18 precision
    healthFactor = (adjustedCollateral * WAD) / debtUsd;
}

/// @notice Returns true if a position is liquidatable.
function isLiquidatable(
    uint256 collateralEth,
    uint256 ethPrice,
    uint256 debtUsdc,
    uint256 liquidationThresholdBps
) internal pure returns (bool) {
    return
        calculate(
            collateralEth,
            ethPrice,
            debtUsdc,
            liquidationThresholdBps
        ) < WAD;
}


}
