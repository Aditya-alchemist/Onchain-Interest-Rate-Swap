// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PriceOracle {
    function latestPrice() external pure returns (uint256) {
        return 1_000_000_000;
    }
}
