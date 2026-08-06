// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title SwapFactory
/// @notice Stores and manages interest-rate swap positions for HedgeFi.
/// @dev One active swap is allowed per LoanNFT token.
contract SwapFactory is Ownable {
/// @notice Swap position representing a hedge for a floating-rate loan.
struct SwapPosition {
uint256 loanTokenId;          // LoanNFT token being hedged

    address fixedPayer;           // Pays fixed, receives floating
    address floatingPayer;        // Pays floating, receives fixed

    uint256 notionalUsdc;         // Amount being hedged (6 decimals)
    uint256 fixedRateBps;         // Locked fixed rate (basis points)

    uint256 startTime;
    uint256 maturityTime;

    uint256 settlementInterval;   // e.g. 30 days
    uint256 lastSettlementTime;   // Updated after every settlement

    bool active;
}

uint256 public nextSwapId;

/// @notice swapId => SwapPosition
mapping(uint256 => SwapPosition) public swaps;

/// @notice loanTokenId => active swapId (0 if none)
mapping(uint256 => uint256) public loanToSwap;

/// @notice Only SwapEngine may create or close swaps.
address public swapEngine;

event SwapEngineUpdated(address indexed newSwapEngine);

event SwapCreated(
    uint256 indexed swapId,
    uint256 indexed loanTokenId,
    address indexed fixedPayer,
    address floatingPayer,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 maturityTime
);

event SwapClosed(uint256 indexed swapId);

error Unauthorized();
error InvalidAddress();
error InvalidNotional();
error InvalidRate();
error InvalidMaturity();
error InvalidSettlementInterval();
error SwapAlreadyExistsForLoan();
error SwapNotActive();

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
// Swap Creation
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

    uint256 existingSwap = loanToSwap[loanTokenId];

    if (existingSwap != 0 && swaps[existingSwap].active) {
        revert SwapAlreadyExistsForLoan();
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
        active: true
    });

    loanToSwap[loanTokenId] = swapId;

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

// --------------------------------------------------
// Swap Closure
// --------------------------------------------------

function closeSwap(uint256 swapId) external onlySwapEngine {
    SwapPosition storage position = swaps[swapId];

    if (!position.active) revert SwapNotActive();

    position.active = false;
    loanToSwap[position.loanTokenId] = 0;

    emit SwapClosed(swapId);
}

// --------------------------------------------------
// Settlement Tracking
// --------------------------------------------------

function updateLastSettlementTime(
    uint256 swapId
) external onlySwapEngine {
    SwapPosition storage position = swaps[swapId];

    if (!position.active) revert SwapNotActive();

    position.lastSettlementTime = block.timestamp;
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

    return swapId != 0 && swaps[swapId].active;
}


}
