// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EscrowManager {
    event EscrowCreated(uint256 indexed escrowId);

    function createEscrow(uint256 escrowId) external {
        emit EscrowCreated(escrowId);
    }
}
