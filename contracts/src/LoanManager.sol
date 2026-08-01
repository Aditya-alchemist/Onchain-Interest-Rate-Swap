// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LoanManager {
    struct LoanPosition {
        address borrower;
        uint256 principal;
        uint256 collateral;
        uint256 rateBps;
        uint64 maturity;
    }

    event LoanCreated(uint256 indexed loanId, address indexed borrower);

    function createLoan(uint256 loanId) external {
        emit LoanCreated(loanId, msg.sender);
    }
}
