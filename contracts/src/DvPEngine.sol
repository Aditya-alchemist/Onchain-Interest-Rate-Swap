// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DvPEngine {
    event TradeSettled(address indexed seller, address indexed buyer, uint256 assetId, uint256 payment);

    function settleTrade(address seller, address buyer, uint256 assetId, uint256 payment) external {
        emit TradeSettled(seller, buyer, assetId, payment);
    }
}
