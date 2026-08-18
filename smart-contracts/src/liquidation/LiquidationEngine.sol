// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

interface ILoanManagerLiquidation {
    function liquidate(
        uint256 tokenId,
        address liquidator
    ) external;

    function isLiquidatable(
        uint256 tokenId
    ) external view returns (bool);
}

contract LiquidationEngine is Ownable {
    ILoanManagerLiquidation public loanManager;

    event Liquidated(
        uint256 indexed loanId,
        address indexed liquidator
    );

    event LoanManagerUpdated(
        address indexed loanManager
    );

    error InvalidAddress();
    error NotLiquidatable();

    constructor(
        address initialOwner,
        address loanManagerAddress
    )
        Ownable(initialOwner)
    {
        if (
            loanManagerAddress ==
            address(0)
        ) {
            revert InvalidAddress();
        }

        loanManager =
            ILoanManagerLiquidation(
                loanManagerAddress
            );
    }

    function setLoanManager(
        address loanManagerAddress
    )
        external
        onlyOwner
    {
        if (
            loanManagerAddress ==
            address(0)
        ) {
            revert InvalidAddress();
        }

        loanManager =
            ILoanManagerLiquidation(
                loanManagerAddress
            );

        emit LoanManagerUpdated(
            loanManagerAddress
        );
    }

    function liquidate(
        uint256 loanId
    )
        external
    {
        if (
            !loanManager.isLiquidatable(
                loanId
            )
        ) {
            revert NotLiquidatable();
        }

        loanManager.liquidate(
            loanId,
            msg.sender
        );

        emit Liquidated(
            loanId,
            msg.sender
        );
    }
}