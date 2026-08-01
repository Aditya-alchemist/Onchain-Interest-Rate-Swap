// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library InterestMath {
    function ratePerSecond(uint256 annualBps) internal pure returns (uint256) {
        return annualBps / 31_536;
    }
}
