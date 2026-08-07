// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title PositionRegistry
/// @notice Canonical registry linking loan positions and hedge positions.
/// @dev Keeps LoanNFT and SwapNFT relationships in one place.
contract PositionRegistry is Ownable {
struct PositionLink {
uint256 loanTokenId;
uint256 swapTokenId;
bool active;
}


/// @notice LoanNFT token => linked swap position.
mapping(uint256 => PositionLink) private loanToPosition;

/// @notice SwapNFT token => linked loan position.
mapping(uint256 => uint256) private swapToLoan;

address public loanManager;
address public swapEngine;

event LoanManagerUpdated(address indexed newLoanManager);
event SwapEngineUpdated(address indexed newSwapEngine);

event PositionLinked(
    uint256 indexed loanTokenId,
    uint256 indexed swapTokenId
);

event PositionUnlinked(
    uint256 indexed loanTokenId,
    uint256 indexed swapTokenId
);

error Unauthorized();
error PositionAlreadyLinked();
error PositionNotLinked();

constructor(address initialOwner) Ownable(initialOwner) {}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setLoanManager(address manager) external onlyOwner {
    loanManager = manager;
    emit LoanManagerUpdated(manager);
}

function setSwapEngine(address engine) external onlyOwner {
    swapEngine = engine;
    emit SwapEngineUpdated(engine);
}

modifier onlyAuthorized() {
    if (
        msg.sender != loanManager &&
        msg.sender != swapEngine
    ) {
        revert Unauthorized();
    }
    _;
}

// --------------------------------------------------
// Linking
// --------------------------------------------------

/// @notice Link a LoanNFT position to a SwapNFT position.
function linkPosition(
    uint256 loanTokenId,
    uint256 swapTokenId
) external onlyAuthorized {
    if (loanToPosition[loanTokenId].active) {
        revert PositionAlreadyLinked();
    }

    loanToPosition[loanTokenId] = PositionLink({
        loanTokenId: loanTokenId,
        swapTokenId: swapTokenId,
        active: true
    });

    swapToLoan[swapTokenId] = loanTokenId;

    emit PositionLinked(
        loanTokenId,
        swapTokenId
    );
}

/// @notice Remove the link between a loan and swap position.
function unlinkPosition(
    uint256 loanTokenId
) external onlyAuthorized {
    PositionLink memory position =
        loanToPosition[loanTokenId];

    if (!position.active) {
        revert PositionNotLinked();
    }

    delete swapToLoan[position.swapTokenId];
    delete loanToPosition[loanTokenId];

    emit PositionUnlinked(
        loanTokenId,
        position.swapTokenId
    );
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function getPosition(
    uint256 loanTokenId
) external view returns (PositionLink memory) {
    return loanToPosition[loanTokenId];
}

function getSwapTokenId(
    uint256 loanTokenId
) external view returns (uint256) {
    return loanToPosition[loanTokenId].swapTokenId;
}

function getLoanTokenId(
    uint256 swapTokenId
) external view returns (uint256) {
    return swapToLoan[swapTokenId];
}

function hasActiveHedge(
    uint256 loanTokenId
) external view returns (bool) {
    return loanToPosition[loanTokenId].active;
}


}
