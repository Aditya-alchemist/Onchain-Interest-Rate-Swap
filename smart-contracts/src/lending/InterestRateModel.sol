// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title InterestRateModel
/// @notice Utilization-based interest rate model for HedgeFi.
/// @dev Rates are expressed in basis points (BPS).
contract InterestRateModel is Ownable {
    uint256 public constant BPS = 10_000;

    // Example:
    // baseRateBps = 200  (2%)
    // slope1Bps   = 800  (8%)
    // slope2Bps   = 3000 (30%)
    // kinkBps     = 8000 (80%)

    uint256 public baseRateBps;
    uint256 public slope1Bps;
    uint256 public slope2Bps;
    uint256 public kinkBps;

    event ParametersUpdated(
        uint256 baseRateBps,
        uint256 slope1Bps,
        uint256 slope2Bps,
        uint256 kinkBps
    );

    constructor(address initialOwner) Ownable(initialOwner) {
        baseRateBps = 200;   // 2%
        slope1Bps = 800;     // +8%
        slope2Bps = 3000;    // +30%
        kinkBps = 8000;      // 80%
    }

    /// @notice Calculate annual borrow rate in basis points.
    /// @param totalDeposits Total USDC supplied.
    /// @param totalBorrows Total USDC borrowed.
    function getBorrowRate(
        uint256 totalDeposits,
        uint256 totalBorrows
    ) external view returns (uint256) {
        if (totalDeposits == 0) {
            return baseRateBps;
        }

        uint256 utilizationBps = (totalBorrows * BPS) / totalDeposits;

        if (utilizationBps <= kinkBps) {
            // Linear increase before the kink
            return
                baseRateBps +
                (utilizationBps * slope1Bps) /
                kinkBps;
        }

        // After the kink, rates rise much faster
        uint256 excessUtilization = utilizationBps - kinkBps;

        return
            baseRateBps +
            slope1Bps +
            (excessUtilization * slope2Bps) /
            (BPS - kinkBps);
    }

    /// @notice Update interest rate parameters.
    function setParameters(
        uint256 _baseRateBps,
        uint256 _slope1Bps,
        uint256 _slope2Bps,
        uint256 _kinkBps
    ) external onlyOwner {
        require(_kinkBps > 0 && _kinkBps < BPS, "Invalid kink");

        baseRateBps = _baseRateBps;
        slope1Bps = _slope1Bps;
        slope2Bps = _slope2Bps;
        kinkBps = _kinkBps;

        emit ParametersUpdated(
            _baseRateBps,
            _slope1Bps,
            _slope2Bps,
            _kinkBps
        );
    }

    /// @notice Return utilization in basis points.
    function getUtilization(
        uint256 totalDeposits,
        uint256 totalBorrows
    ) external pure returns (uint256) {
        if (totalDeposits == 0) return 0;
        return (totalBorrows * BPS) / totalDeposits;
    }
}