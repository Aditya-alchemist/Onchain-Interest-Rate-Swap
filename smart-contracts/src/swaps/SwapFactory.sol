// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title SwapFactory
/// @notice Stores and manages interest-rate swap positions for HedgeFi.
contract SwapFactory is Ownable {
enum SwapType {
FloatingToFixed,
FixedToFloating
}

struct SwapPosition {
    uint256 loanTokenId;          // LoanNFT token being hedged
    address borrower;
    uint256 notionalUsdc;         // USDC amount being hedged
    uint256 fixedRateBps;         // Fixed rate agreed in the swap
    uint256 initialFloatingRateBps;
    uint256 startTime;
    uint256 maturityTime;
    uint256 settlementInterval;   // e.g. 30 days
    SwapType swapType;
    bool active;
}

uint256 public nextSwapId;

mapping(uint256 => SwapPosition) public swaps;
mapping(uint256 => uint256) public loanToSwap;

address public swapEngine;

event SwapEngineUpdated(address indexed newSwapEngine);

event SwapCreated(
    uint256 indexed swapId,
    uint256 indexed loanTokenId,
    address indexed borrower,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 maturityTime
);

event SwapClosed(uint256 indexed swapId);

error Unauthorized();
error SwapAlreadyExistsForLoan();
error SwapNotActive();

constructor(address initialOwner) Ownable(initialOwner) {}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setSwapEngine(address engine) external onlyOwner {
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
    address borrower,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 floatingRateBps,
    uint256 maturityTime,
    uint256 settlementInterval,
    SwapType swapType
) external onlySwapEngine returns (uint256 swapId) {
    if (loanToSwap[loanTokenId] != 0) {
        revert SwapAlreadyExistsForLoan();
    }

    swapId = ++nextSwapId;

    swaps[swapId] = SwapPosition({
        loanTokenId: loanTokenId,
        borrower: borrower,
        notionalUsdc: notionalUsdc,
        fixedRateBps: fixedRateBps,
        initialFloatingRateBps: floatingRateBps,
        startTime: block.timestamp,
        maturityTime: maturityTime,
        settlementInterval: settlementInterval,
        swapType: swapType,
        active: true
    });

    loanToSwap[loanTokenId] = swapId;

    emit SwapCreated(
        swapId,
        loanTokenId,
        borrower,
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

    if (swapId == 0) return false;

    return swaps[swapId].active;
}

}
