// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LendingPool {
    event Deposited(address indexed lender, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount);

    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function borrow(uint256 amount) external {
        emit Borrowed(msg.sender, amount);
    }
}
