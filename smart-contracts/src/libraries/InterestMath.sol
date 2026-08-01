// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library InterestMath {
    function accrue(uint256 principal, uint256 rateBps, uint256 timeSeconds) internal pure returns (uint256) {
        return principal + (principal * rateBps * timeSeconds) / (10000 * 365 days);
    }
}
