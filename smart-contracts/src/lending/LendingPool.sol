// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {InterestRateModel} from "./InterestRateModel.sol";
import {Governance} from "../governance/Governance.sol";

/// @title LendingPool
/// @notice Holds lender liquidity and issues loans through LoanManager.
contract LendingPool is Ownable, ReentrancyGuard {
IERC20 public immutable usdc;
InterestRateModel public immutable interestRateModel;
Governance public immutable governance;


// Total liquidity supplied by lenders
uint256 public totalDeposits;

// Outstanding principal currently borrowed
uint256 public totalBorrows;

// Lender balances (MVP accounting)
mapping(address => uint256) public deposits;

// LoanManager is the only contract allowed to issue and receive loans
address public loanManager;

event Deposited(address indexed lender, uint256 amount);
event Withdrawn(address indexed lender, uint256 amount);
event BorrowIssued(address indexed borrower, uint256 amount);
event LoanRepaid(
    address indexed borrower,
    uint256 principal,
    uint256 interest
);
event LoanManagerUpdated(address indexed newLoanManager);

error ZeroAmount();
error InsufficientBalance();
error InsufficientLiquidity();
error Unauthorized();

constructor(
    address usdcAddress,
    address interestModelAddress,
    address governanceAddress,
    address initialOwner
) Ownable(initialOwner) {
    usdc = IERC20(usdcAddress);
    interestRateModel = InterestRateModel(interestModelAddress);
    governance = Governance(governanceAddress);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setLoanManager(address manager) external onlyOwner {
    loanManager = manager;
    emit LoanManagerUpdated(manager);
}

modifier onlyLoanManager() {
    if (msg.sender != loanManager) revert Unauthorized();
    _;
}

// --------------------------------------------------
// Lender Functions
// --------------------------------------------------

function deposit(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();

    deposits[msg.sender] += amount;
    totalDeposits += amount;

    require(
        usdc.transferFrom(msg.sender, address(this), amount),
        "Transfer failed"
    );

    emit Deposited(msg.sender, amount);
}

function withdraw(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    if (deposits[msg.sender] < amount) revert InsufficientBalance();

    uint256 liquidity = usdc.balanceOf(address(this));
    if (liquidity < amount) revert InsufficientLiquidity();

    deposits[msg.sender] -= amount;
    totalDeposits -= amount;

    require(usdc.transfer(msg.sender, amount), "Transfer failed");

    emit Withdrawn(msg.sender, amount);
}

// --------------------------------------------------
// Borrowing (LoanManager Only)
// --------------------------------------------------

function issueLoan(
    address borrower,
    uint256 amount
) external onlyLoanManager nonReentrant {
    if (amount == 0) revert ZeroAmount();

    uint256 liquidity = usdc.balanceOf(address(this));
    if (liquidity < amount) revert InsufficientLiquidity();

    totalBorrows += amount;

    require(usdc.transfer(borrower, amount), "Transfer failed");

    emit BorrowIssued(borrower, amount);
}

/// @notice Receives repayment from LoanManager.
/// @dev Principal reduces totalBorrows; interest remains inside the pool as lender yield.
function receiveRepayment(
    address payer,
    address borrower,
    uint256 principal,
    uint256 interest
) external onlyLoanManager nonReentrant {
    if (principal == 0 && interest == 0) revert ZeroAmount();

    uint256 total = principal + interest;

    require(
        usdc.transferFrom(payer, address(this), total),
        "Transfer failed"
    );

    totalBorrows -= principal;

    emit LoanRepaid(borrower, principal, interest);
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function availableLiquidity() external view returns (uint256) {
    return usdc.balanceOf(address(this));
}

function currentBorrowRateBps() external view returns (uint256) {
    return
        interestRateModel.getBorrowRate(
            totalDeposits,
            totalBorrows
        );
}


}
