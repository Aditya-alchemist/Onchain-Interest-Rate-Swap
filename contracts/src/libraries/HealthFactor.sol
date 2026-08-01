// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library HealthFactor {
    function compute(uint256 collateral, uint256 debt) internal pure returns (uint256) {
        if (debt == 0) return type(uint256).max;
        return (collateral * 1e18) / debt;
    }
}
