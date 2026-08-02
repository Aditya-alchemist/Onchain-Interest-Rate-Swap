// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title CollateralVault
/// @notice Stores native ETH collateral for HedgeFi borrowers.
/// @dev Only the protocol owner (LoanManager) can deposit or withdraw collateral.
contract CollateralVault is Ownable, ReentrancyGuard {
    /// @notice ETH collateral deposited for each borrower.
    mapping(address => uint256) private collateralBalance;

    /// @notice Total ETH held by the vault.
    uint256 public totalCollateral;

    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);

    error ZeroAmount();
    error InsufficientCollateral();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deposit ETH collateral for a borrower.
    /// @dev Called only by LoanManager.
    function depositFor(address borrower) external payable onlyOwner nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        collateralBalance[borrower] += msg.value;
        totalCollateral += msg.value;

        emit CollateralDeposited(borrower, msg.value);
    }

    /// @notice Withdraw collateral to a borrower.
    /// @dev Called only by LoanManager after loan repayment or during liquidation.
    function withdrawTo(
        address borrower,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (collateralBalance[borrower] < amount) revert InsufficientCollateral();

        collateralBalance[borrower] -= amount;
        totalCollateral -= amount;

        (bool success, ) = payable(borrower).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit CollateralWithdrawn(borrower, amount);
    }

    /// @notice Returns collateral deposited by a borrower.
    function getCollateral(address borrower) external view returns (uint256) {
        return collateralBalance[borrower];
    }
}