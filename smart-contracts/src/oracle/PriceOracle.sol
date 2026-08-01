// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PriceOracle {
    event PriceUpdated(bytes32 indexed symbol, uint256 price);

    function updatePrice(bytes32 symbol, uint256 price) external {
        emit PriceUpdated(symbol, price);
    }
}
