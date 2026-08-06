// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {SwapMath} from "../libraries/SwapMath.sol";

/// @title SettlementEngine
/// @notice Records settlement obligations for interest-rate swaps.
/// @dev SwapEngine creates settlement records; DvPEngine marks them executed.
contract SettlementEngine is Ownable {
enum SettlementStatus {
Pending,
Executed,
Cancelled
}


struct Settlement {
    uint256 settlementId;
    uint256 swapId;

    address fixedPayer;
    address floatingPayer;

    uint256 amountUsdc;

    SwapMath.SettlementDirection direction;

    uint256 settlementTime;

    SettlementStatus status;
}

uint256 public nextSettlementId;

mapping(uint256 => Settlement) public settlements;

mapping(uint256 => uint256[]) private swapSettlements;

address public swapEngine;
address public dvpEngine;

event SwapEngineUpdated(address indexed newEngine);
event DvPEngineUpdated(address indexed newEngine);

event SettlementRecorded(
    uint256 indexed settlementId,
    uint256 indexed swapId,
    uint256 amountUsdc,
    SwapMath.SettlementDirection direction
);

event SettlementExecuted(uint256 indexed settlementId);

event SettlementCancelled(uint256 indexed settlementId);

error Unauthorized();
error InvalidAddress();
error SettlementNotPending();

constructor(address initialOwner) Ownable(initialOwner) {}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setSwapEngine(address engine) external onlyOwner {
    if (engine == address(0)) revert InvalidAddress();

    swapEngine = engine;

    emit SwapEngineUpdated(engine);
}

function setDvPEngine(address engine) external onlyOwner {
    if (engine == address(0)) revert InvalidAddress();

    dvpEngine = engine;

    emit DvPEngineUpdated(engine);
}

modifier onlySwapEngine() {
    if (msg.sender != swapEngine) revert Unauthorized();
    _;
}

modifier onlyDvPEngine() {
    if (msg.sender != dvpEngine) revert Unauthorized();
    _;
}

// --------------------------------------------------
// Settlement Lifecycle
// --------------------------------------------------

function recordSettlement(
    uint256 swapId,
    address fixedPayer,
    address floatingPayer,
    uint256 amountUsdc,
    SwapMath.SettlementDirection direction
) external onlySwapEngine returns (uint256 settlementId) {
    settlementId = ++nextSettlementId;

    settlements[settlementId] = Settlement({
        settlementId: settlementId,
        swapId: swapId,
        fixedPayer: fixedPayer,
        floatingPayer: floatingPayer,
        amountUsdc: amountUsdc,
        direction: direction,
        settlementTime: block.timestamp,
        status: SettlementStatus.Pending
    });

    swapSettlements[swapId].push(settlementId);

    emit SettlementRecorded(
        settlementId,
        swapId,
        amountUsdc,
        direction
    );
}

function markExecuted(
    uint256 settlementId
) external onlyDvPEngine {
    Settlement storage settlement = settlements[settlementId];

    if (settlement.status != SettlementStatus.Pending) {
        revert SettlementNotPending();
    }

    settlement.status = SettlementStatus.Executed;

    emit SettlementExecuted(settlementId);
}

function cancelSettlement(
    uint256 settlementId
) external onlyDvPEngine {
    Settlement storage settlement = settlements[settlementId];

    if (settlement.status != SettlementStatus.Pending) {
        revert SettlementNotPending();
    }

    settlement.status = SettlementStatus.Cancelled;

    emit SettlementCancelled(settlementId);
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function getSettlement(
    uint256 settlementId
) external view returns (Settlement memory) {
    return settlements[settlementId];
}

function getSettlementsForSwap(
    uint256 swapId
) external view returns (uint256[] memory) {
    return swapSettlements[swapId];
}

function pendingSettlementsForSwap(
    uint256 swapId
) external view returns (uint256 count) {
    uint256[] storage ids = swapSettlements[swapId];

    for (uint256 i = 0; i < ids.length; i++) {
        if (
            settlements[ids[i]].status ==
            SettlementStatus.Pending
        ) {
            count++;
        }
    }
}


}
