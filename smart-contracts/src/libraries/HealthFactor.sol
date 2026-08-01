// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library HealthFactor {
    function compute(uint256 collateralValue, uint256 debtValue, uint256 liquidationThresholdBps) internal pure returns (uint256) {
        if (debtValue == 0) return type(uint256).max;
        return (collateralValue * liquidationThresholdBps) / debtValue;
    }
}
