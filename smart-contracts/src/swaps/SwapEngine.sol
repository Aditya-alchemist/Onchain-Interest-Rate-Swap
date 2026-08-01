// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SwapEngine {
    event SwapOpened(uint256 indexed swapId, address indexed maker, uint256 notional);

    function openSwap(uint256 swapId, uint256 notional) external {
        emit SwapOpened(swapId, msg.sender, notional);
    }
}
