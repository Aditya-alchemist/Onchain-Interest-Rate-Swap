// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SwapMath {
    function notionalToPremium(uint256 notional, uint256 rateBps, uint256 termSeconds) internal pure returns (uint256) {
        return (notional * rateBps * termSeconds) / (10000 * 365 days);
    }
}
