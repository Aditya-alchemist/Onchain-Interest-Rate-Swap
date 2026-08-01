// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NettingEngine {
    event Netted(uint256 indexed a, uint256 indexed b);

    function netPositions(uint256 a, uint256 b) external {
        emit Netted(a, b);
    }
}
