// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract InterestRateModel {
    function borrowRate(uint256 utilizationBps) external pure returns (uint256) {
        return 300 + utilizationBps / 100;
    }
}
