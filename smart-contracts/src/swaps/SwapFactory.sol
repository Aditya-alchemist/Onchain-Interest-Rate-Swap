// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SwapFactory {
    event SwapCreated(uint256 indexed swapId);

    function createSwap(uint256 swapId) external {
        emit SwapCreated(swapId);
    }
}
