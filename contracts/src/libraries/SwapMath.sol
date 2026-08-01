// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SwapMath {
    function fixedPayment(uint256 notional, uint256 rateBps) internal pure returns (uint256) {
        return (notional * rateBps) / 10_000;
    }
}
