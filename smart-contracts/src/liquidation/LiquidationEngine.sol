// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LiquidationEngine {
    event Liquidated(uint256 indexed loanId, address indexed liquidator);

    function liquidate(uint256 loanId) external {
        emit Liquidated(loanId, msg.sender);
    }
}
