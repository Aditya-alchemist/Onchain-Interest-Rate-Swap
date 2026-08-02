// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "../../lib/openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Pausable} from "../../lib/openzeppelin-contracts/contracts/utils/Pausable.sol";

contract Governance is AccessControl, Pausable {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // Lending parameters
    uint256 public collateralFactorBps;       // 75% = 7500
    uint256 public liquidationThresholdBps;   // 80% = 8000
    uint256 public liquidationBonusBps;       // 5% = 500

    // Interest rate parameters
    uint256 public baseBorrowRateBps;         // 2% = 200
    uint256 public maxBorrowRateBps;          // 20% = 2000

    // Swap parameters
    uint256 public settlementInterval;        // seconds
    uint256 public protocolFeeBps;            // 1% = 100

    address public treasury;

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event CollateralFactorUpdated(uint256 oldValue, uint256 newValue);
    event LiquidationThresholdUpdated(uint256 oldValue, uint256 newValue);
    event LiquidationBonusUpdated(uint256 oldValue, uint256 newValue);
    event BorrowRateUpdated(uint256 oldBase, uint256 newBase, uint256 oldMax, uint256 newMax);
    event SettlementIntervalUpdated(uint256 oldValue, uint256 newValue);
    event ProtocolFeeUpdated(uint256 oldValue, uint256 newValue);

    constructor(address governor, address treasuryAddress) {
        require(governor != address(0), "Invalid governor");
        require(treasuryAddress != address(0), "Invalid treasury");

        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GOVERNOR_ROLE, governor);

        treasury = treasuryAddress;

        collateralFactorBps = 7500;
        liquidationThresholdBps = 8000;
        liquidationBonusBps = 500;

        baseBorrowRateBps = 200;
        maxBorrowRateBps = 2000;

        settlementInterval = 30 days;
        protocolFeeBps = 100;
    }

    modifier onlyGovernor() {
        require(hasRole(GOVERNOR_ROLE, msg.sender), "Not governor");
        _;
    }

    // ---------- Emergency ----------

    function pause() external onlyGovernor {
        _pause();
    }

    function unpause() external onlyGovernor {
        _unpause();
    }

    // ---------- Treasury ----------

    function setTreasury(address newTreasury) external onlyGovernor {
        require(newTreasury != address(0), "Zero address");

        address old = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(old, newTreasury);
    }

    // ---------- Lending ----------

    function setCollateralFactor(uint256 value) external onlyGovernor {
        require(value <= 9000, "Too high");

        uint256 old = collateralFactorBps;
        collateralFactorBps = value;

        emit CollateralFactorUpdated(old, value);
    }

    function setLiquidationThreshold(uint256 value) external onlyGovernor {
        require(value >= collateralFactorBps, "Invalid threshold");
        require(value <= 9500, "Too high");

        uint256 old = liquidationThresholdBps;
        liquidationThresholdBps = value;

        emit LiquidationThresholdUpdated(old, value);
    }

    function setLiquidationBonus(uint256 value) external onlyGovernor {
        require(value <= 2000, "Too high");

        uint256 old = liquidationBonusBps;
        liquidationBonusBps = value;

        emit LiquidationBonusUpdated(old, value);
    }

    // ---------- Interest Rates ----------

    function setBorrowRateBounds(uint256 baseRate, uint256 maxRate) external onlyGovernor {
        require(baseRate < maxRate, "Invalid rates");
        require(maxRate <= 10000, "Invalid max");

        uint256 oldBase = baseBorrowRateBps;
        uint256 oldMax = maxBorrowRateBps;

        baseBorrowRateBps = baseRate;
        maxBorrowRateBps = maxRate;

        emit BorrowRateUpdated(oldBase, baseRate, oldMax, maxRate);
    }

    // ---------- Swaps ----------

    function setSettlementInterval(uint256 interval) external onlyGovernor {
        require(interval >= 1 days, "Too short");

        uint256 old = settlementInterval;
        settlementInterval = interval;

        emit SettlementIntervalUpdated(old, interval);
    }

    function setProtocolFee(uint256 feeBps) external onlyGovernor {
        require(feeBps <= 1000, "Fee too high");

        uint256 old = protocolFeeBps;
        protocolFeeBps = feeBps;

        emit ProtocolFeeUpdated(old, feeBps);
    }

    // ---------- Keeper Management ----------

    function grantKeeper(address keeper) external onlyGovernor {
        _grantRole(KEEPER_ROLE, keeper);
    }

    function revokeKeeper(address keeper) external onlyGovernor {
        _revokeRole(KEEPER_ROLE, keeper);
    }

    function isKeeper(address account) external view returns (bool) {
        return hasRole(KEEPER_ROLE, account);
    }
}