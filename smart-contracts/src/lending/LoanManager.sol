// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {LendingPool} from "./LendingPool.sol";
import {CollateralVault} from "./CollateralVault.sol";
import {MockPriceOracle} from "../mocks/MockPriceOracle.sol";
import {InterestMath} from "../libraries/InterestMath.sol";

interface ILoanNFT {
function mintLoan(
address borrower,
uint256 principalUsdc,
uint256 collateralEth,
uint256 borrowRateBps
) external returns (uint256);


function burnLoan(uint256 tokenId) external;


}

/// @title LoanManager
/// @notice Creates loans, manages collateral, accrues interest, and coordinates repayments.
contract LoanManager is Ownable, ReentrancyGuard {
uint256 public constant BPS = 10_000;
uint256 public constant COLLATERAL_FACTOR_BPS = 7500; // 75%


LendingPool public immutable lendingPool;
CollateralVault public immutable collateralVault;
MockPriceOracle public immutable priceOracle;
IERC20 public immutable usdc;

ILoanNFT public loanNFT;

struct Loan {
    uint256 collateralEth;
    uint256 principalUsdc;
    uint256 borrowRateBps;
    uint256 startTime;
    uint256 tokenId;
    bool active;
}

mapping(address => Loan) public loans;

event LoanOpened(
    address indexed borrower,
    uint256 collateralEth,
    uint256 principalUsdc,
    uint256 borrowRateBps,
    uint256 tokenId
);

event LoanRepaid(
    address indexed borrower,
    uint256 principal,
    uint256 interest,
    uint256 collateralReturned,
    uint256 tokenId
);

event LoanNFTUpdated(address indexed loanNFT);

error LoanAlreadyExists();
error NoActiveLoan();
error ZeroCollateral();
error ZeroBorrow();
error ExceedsBorrowLimit();

constructor(
    address lendingPoolAddress,
    address collateralVaultAddress,
    address priceOracleAddress,
    address usdcAddress,
    address initialOwner
) Ownable(initialOwner) {
    lendingPool = LendingPool(lendingPoolAddress);
    collateralVault = CollateralVault(collateralVaultAddress);
    priceOracle = MockPriceOracle(priceOracleAddress);
    usdc = IERC20(usdcAddress);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setLoanNFT(address loanNFTAddress) external onlyOwner {
    loanNFT = ILoanNFT(loanNFTAddress);
    emit LoanNFTUpdated(loanNFTAddress);
}

// --------------------------------------------------
// Borrowing
// --------------------------------------------------

function borrow(uint256 borrowAmountUsdc) external payable nonReentrant {
    if (loans[msg.sender].active) revert LoanAlreadyExists();
    if (msg.value == 0) revert ZeroCollateral();
    if (borrowAmountUsdc == 0) revert ZeroBorrow();

    uint256 ethPrice = priceOracle.getEthPrice(); // 8 decimals

    // ETH collateral value in USD (8 decimals)
    uint256 collateralValueUsd = (msg.value * ethPrice) / 1e18;

    // Convert USD(8 decimals) -> USDC(6 decimals)
    uint256 maxBorrowUsdc =
        (collateralValueUsd * COLLATERAL_FACTOR_BPS) / BPS / 100;

    if (borrowAmountUsdc > maxBorrowUsdc) revert ExceedsBorrowLimit();

    uint256 rate = lendingPool.currentBorrowRateBps();

    // Lock ETH collateral
    collateralVault.depositFor{value: msg.value}(msg.sender);

    // Issue mUSDC loan
    lendingPool.issueLoan(msg.sender, borrowAmountUsdc);

    uint256 tokenId = 0;

    // Mint NFT if tokenization module is enabled
    if (address(loanNFT) != address(0)) {
        tokenId = loanNFT.mintLoan(
            msg.sender,
            borrowAmountUsdc,
            msg.value,
            rate
        );
    }

    loans[msg.sender] = Loan({
        collateralEth: msg.value,
        principalUsdc: borrowAmountUsdc,
        borrowRateBps: rate,
        startTime: block.timestamp,
        tokenId: tokenId,
        active: true
    });

    emit LoanOpened(
        msg.sender,
        msg.value,
        borrowAmountUsdc,
        rate,
        tokenId
    );
}

// --------------------------------------------------
// Repayment
// --------------------------------------------------

function repay() external nonReentrant {
    Loan storage loan = loans[msg.sender];
    if (!loan.active) revert NoActiveLoan();

    uint256 interest = InterestMath.calculateInterest(
        loan.principalUsdc,
        loan.borrowRateBps,
        loan.startTime,
        block.timestamp
    );

    uint256 totalRepayment = loan.principalUsdc + interest;

    // Pull repayment from borrower
    require(
        usdc.transferFrom(msg.sender, address(this), totalRepayment),
        "Transfer failed"
    );

    // Approve pool to pull repayment
    usdc.approve(address(lendingPool), totalRepayment);

    // Repay the pool
    lendingPool.receiveRepayment(
        address(this),
        msg.sender,
        loan.principalUsdc,
        interest
    );

    // Return ETH collateral
    collateralVault.withdrawTo(msg.sender, loan.collateralEth);

    // Burn NFT if enabled
    if (loan.tokenId != 0 && address(loanNFT) != address(0)) {
        loanNFT.burnLoan(loan.tokenId);
    }

    emit LoanRepaid(
        msg.sender,
        loan.principalUsdc,
        interest,
        loan.collateralEth,
        loan.tokenId
    );

    delete loans[msg.sender];
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function maxBorrowable(
    uint256 collateralEth
) external view returns (uint256) {
    uint256 ethPrice = priceOracle.getEthPrice();
    uint256 collateralValueUsd = (collateralEth * ethPrice) / 1e18;

    return (collateralValueUsd * COLLATERAL_FACTOR_BPS) / BPS / 100;
}

function hasActiveLoan(address borrower) external view returns (bool) {
    return loans[borrower].active;
}


}
