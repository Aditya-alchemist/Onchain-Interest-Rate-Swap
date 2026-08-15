// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title SwapFactory
/// @notice Stores immutable swap terms and lifecycle state for HedgeFi.
/// @dev Settlement history is handled by SettlementEngine.
contract SwapFactory is Ownable {
enum SwapStatus {
None,
Active,
Matured,
Closed
}


struct SwapPosition {
    uint256 loanTokenId;

    address fixedPayer;
    address floatingPayer;

    uint256 notionalUsdc;
    uint256 fixedRateBps;

    uint256 startTime;
    uint256 maturityTime;

    uint256 settlementInterval;
    uint256 lastSettlementTime;

    SwapStatus status;
}

uint256 public nextSwapId;

mapping(uint256 => SwapPosition) public swaps;
mapping(uint256 => uint256) public loanToSwap;

// --------------------------------------------------
// Active swap indexing (for keeper bots)
// --------------------------------------------------

uint256[] private activeSwapIds;
mapping(uint256 => uint256) private activeSwapIndex;

address public swapEngine;

event SwapEngineUpdated(address indexed newEngine);

event SwapCreated(
    uint256 indexed swapId,
    uint256 indexed loanTokenId,
    address indexed fixedPayer,
    address floatingPayer,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 maturityTime
);

event SwapSettlementUpdated(
    uint256 indexed swapId,
    uint256 settlementTime
);

event SwapStatusUpdated(
    uint256 indexed swapId,
    SwapStatus status
);

error Unauthorized();
error InvalidAddress();
error InvalidNotional();
error InvalidRate();
error InvalidMaturity();
error InvalidSettlementInterval();
error ActiveSwapExists();

constructor(address initialOwner) Ownable(initialOwner) {}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setSwapEngine(address engine) external onlyOwner {
    if (engine == address(0)) revert InvalidAddress();

    swapEngine = engine;

    emit SwapEngineUpdated(engine);
}

modifier onlySwapEngine() {
    if (msg.sender != swapEngine) revert Unauthorized();
    _;
}

// --------------------------------------------------
// Swap Lifecycle
// --------------------------------------------------

function createSwap(
    uint256 loanTokenId,
    address fixedPayer,
    address floatingPayer,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 maturityTime,
    uint256 settlementInterval
) external onlySwapEngine returns (uint256 swapId) {
    if (fixedPayer == address(0) || floatingPayer == address(0)) {
        revert InvalidAddress();
    }

    if (notionalUsdc == 0) revert InvalidNotional();

    if (fixedRateBps == 0 || fixedRateBps > 10_000) {
        revert InvalidRate();
    }

    if (maturityTime <= block.timestamp) {
        revert InvalidMaturity();
    }

    if (settlementInterval == 0) {
        revert InvalidSettlementInterval();
    }

    uint256 existing = loanToSwap[loanTokenId];

    if (
        existing != 0 &&
        swaps[existing].status == SwapStatus.Active
    ) {
        revert ActiveSwapExists();
    }

    swapId = ++nextSwapId;

    swaps[swapId] = SwapPosition({
        loanTokenId: loanTokenId,
        fixedPayer: fixedPayer,
        floatingPayer: floatingPayer,
        notionalUsdc: notionalUsdc,
        fixedRateBps: fixedRateBps,
        startTime: block.timestamp,
        maturityTime: maturityTime,
        settlementInterval: settlementInterval,
        lastSettlementTime: block.timestamp,
        status: SwapStatus.Active
    });

    loanToSwap[loanTokenId] = swapId;

    // Add to active swap index
    activeSwapIndex[swapId] = activeSwapIds.length;
    activeSwapIds.push(swapId);

    emit SwapCreated(
        swapId,
        loanTokenId,
        fixedPayer,
        floatingPayer,
        notionalUsdc,
        fixedRateBps,
        maturityTime
    );
}

function updateSettlement(
    uint256 swapId,
    uint256 settlementTime
) external onlySwapEngine {
    swaps[swapId].lastSettlementTime = settlementTime;

    emit SwapSettlementUpdated(
        swapId,
        settlementTime
    );
}

function markMatured(
    uint256 swapId
) external onlySwapEngine {
    swaps[swapId].status = SwapStatus.Matured;

    emit SwapStatusUpdated(
        swapId,
        SwapStatus.Matured
    );
}

function closeSwap(
    uint256 swapId
) external onlySwapEngine {
    swaps[swapId].status = SwapStatus.Closed;

    loanToSwap[swaps[swapId].loanTokenId] = 0;

    _removeActiveSwap(swapId);

    emit SwapStatusUpdated(
        swapId,
        SwapStatus.Closed
    );
}

// --------------------------------------------------
// Internal
// --------------------------------------------------

function _removeActiveSwap(
    uint256 swapId
) internal {
    uint256 index = activeSwapIndex[swapId];
    uint256 lastIndex = activeSwapIds.length - 1;

    if (index != lastIndex) {
        uint256 lastSwapId = activeSwapIds[lastIndex];

        activeSwapIds[index] = lastSwapId;
        activeSwapIndex[lastSwapId] = index;
    }

    activeSwapIds.pop();
    delete activeSwapIndex[swapId];
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function getSwap(
    uint256 swapId
) external view returns (SwapPosition memory) {
    return swaps[swapId];
}

function getSwapForLoan(
    uint256 loanTokenId
) external view returns (uint256) {
    return loanToSwap[loanTokenId];
}

function hasActiveSwap(
    uint256 loanTokenId
) external view returns (bool) {
    uint256 swapId = loanToSwap[loanTokenId];

    return
        swapId != 0 &&
        swaps[swapId].status == SwapStatus.Active;
}

/// @notice Returns all currently active swap IDs.
function getActiveSwapIds()
    external
    view
    returns (uint256[] memory)
{
    return activeSwapIds;
}

/// @notice Returns the number of active swaps.
function activeSwapCount()
    external
    view
    returns (uint256)
{
    return activeSwapIds.length;
}


}
