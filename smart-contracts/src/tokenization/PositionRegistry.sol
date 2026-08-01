// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PositionRegistry {
    event Registered(uint256 indexed positionId, address indexed owner);

    function register(uint256 positionId, address owner) external {
        emit Registered(positionId, owner);
    }
}
