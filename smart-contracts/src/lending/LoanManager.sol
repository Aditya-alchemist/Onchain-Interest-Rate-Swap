// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {LendingPool} from "./LendingPool.sol";
import {CollateralVault} from "./CollateralVault.sol";
import {MockPriceOracle} from "../mocks/MockPriceOracle.sol";

contract LoanManager is Ownable, ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant COLLATERAL_FACTOR_BPS = 7500; // 75%

    LendingPool public immutable lendingPool;
    CollateralVault public immutable collateralVault;
    MockPriceOracle public immutable priceOracle;
    IERC20 public immutable usdc;

    struct Loan {
        uint256 collateralEth;
        uint256 principalUsdc;
        uint256 borrowRateBps;
        uint256 startTime;
        bool active;
    }

    mapping(address => Loan) public loans;

    event LoanOpened(
        address indexed borrower,
        uint256 collateralEth,
        uint256 principalUsdc,
        uint256 borrowRateBps
    );

    event LoanRepaid(
        address indexed borrower,
        uint256 repaidAmount,
        uint256 collateralReturned
    );

    error LoanAlreadyExists();
    error NoActiveLoan();
    error ZeroCollateral();
    error ZeroBorrow();
    error ExceedsBorrowLimit();
    error InsufficientLiquidity();

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

    /// @notice Borrow MockUSDC by depositing native ETH as collateral.
    function borrow(uint256 borrowAmountUsdc) external payable nonReentrant {
        if (loans[msg.sender].active) revert LoanAlreadyExists();
        if (msg.value == 0) revert ZeroCollateral();
        if (borrowAmountUsdc == 0) revert ZeroBorrow();

        uint256 ethPrice = priceOracle.getEthPrice(); // 8 decimals

        // Collateral value in USD (8 decimals)
        uint256 collateralValueUsd = (msg.value * ethPrice) / 1e18;

        // Maximum borrow allowed in USDC (6 decimals)
        uint256 maxBorrowUsdc = (collateralValueUsd * COLLATERAL_FACTOR_BPS) /
            BPS /
            100;

        if (borrowAmountUsdc > maxBorrowUsdc) revert ExceedsBorrowLimit();

        uint256 rate = lendingPool.currentBorrowRateBps();

        collateralVault.depositFor{value: msg.value}(msg.sender);

        lendingPool.issueLoan(msg.sender, borrowAmountUsdc);

        loans[msg.sender] = Loan({
            collateralEth: msg.value,
            principalUsdc: borrowAmountUsdc,
            borrowRateBps: rate,
            startTime: block.timestamp,
            active: true
        });

        emit LoanOpened(msg.sender, msg.value, borrowAmountUsdc, rate);
    }

    /// @notice Repay the entire loan and receive collateral back.
    function repay() external nonReentrant {
        Loan storage loan = loans[msg.sender];
        if (!loan.active) revert NoActiveLoan();

        uint256 repayment = loan.principalUsdc;

        usdc.transferFrom(msg.sender, address(this), repayment);

        usdc.approve(address(lendingPool), repayment);
        lendingPool.receiveRepayment(address(this), repayment);

        collateralVault.withdrawTo(msg.sender, loan.collateralEth);

        emit LoanRepaid(msg.sender, repayment, loan.collateralEth);

        delete loans[msg.sender];
    }

    /// @notice Return the maximum borrow amount for a given ETH collateral amount.
    function maxBorrowable(
        uint256 collateralEth
    ) external view returns (uint256) {
        uint256 ethPrice = priceOracle.getEthPrice();
        uint256 collateralValueUsd = (collateralEth * ethPrice) / 1e18;

        return
            (collateralValueUsd * COLLATERAL_FACTOR_BPS) /
            BPS /
            100;
    }

    function hasActiveLoan(address borrower) external view returns (bool) {
        return loans[borrower].active;
    }
}