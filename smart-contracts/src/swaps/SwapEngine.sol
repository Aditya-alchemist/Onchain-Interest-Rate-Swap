// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

import {SwapFactory} from "./SwapFactory.sol";
import {SettlementEngine} from "./SettlementEngine.sol";
import {SwapMath} from "../libraries/SwapMath.sol";
import {LendingPool} from "../lending/LendingPool.sol";
import {DvPEngine} from "../settlement/DvPEngine.sol";
import {SwapNFT} from "../tokenization/SwapNFT.sol";
import {PositionRegistry} from "../tokenization/PositionRegistry.sol";

/// Minimal interface for LoanNFT ownership verification
interface ILoanNFT {
function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title SwapEngine
/// @notice Creates hedges, tokenizes them, records settlements,
///         and triggers atomic DvP settlement.
contract SwapEngine is Ownable {
SwapFactory public immutable swapFactory;
SettlementEngine public immutable settlementEngine;
LendingPool public immutable lendingPool;
DvPEngine public immutable dvpEngine;
SwapNFT public immutable swapNFT;
PositionRegistry public immutable positionRegistry;
ILoanNFT public immutable loanNFT;


// swapId => SwapNFT tokenId
mapping(uint256 => uint256) public swapToTokenId;

// loanTokenId => swapId
mapping(uint256 => uint256) public loanToSwapId;

event SwapOpened(
    uint256 indexed swapId,
    uint256 indexed loanTokenId,
    uint256 indexed swapTokenId
);

event SettlementCalculated(
    uint256 indexed settlementId,
    uint256 indexed swapId,
    uint256 floatingRateBps,
    uint256 amountUsdc,
    SwapMath.SettlementDirection direction
);

event SwapClosed(uint256 indexed swapId);

event SwapMatured(uint256 indexed swapId);

constructor(
    address swapFactoryAddress,
    address settlementEngineAddress,
    address lendingPoolAddress,
    address dvpEngineAddress,
    address swapNFTAddress,
    address positionRegistryAddress,
    address loanNFTAddress,
    address initialOwner
) Ownable(initialOwner) {
    swapFactory = SwapFactory(swapFactoryAddress);
    settlementEngine = SettlementEngine(settlementEngineAddress);
    lendingPool = LendingPool(lendingPoolAddress);
    dvpEngine = DvPEngine(dvpEngineAddress);
    swapNFT = SwapNFT(swapNFTAddress);
    positionRegistry = PositionRegistry(positionRegistryAddress);
    loanNFT = ILoanNFT(loanNFTAddress);
}

// --------------------------------------------------
// Swap Creation
// --------------------------------------------------

/// @notice Borrower converts a floating-rate loan into a hedged position.
function openSwap(
    uint256 loanTokenId,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 duration,
    uint256 settlementInterval
) external returns (uint256 swapId) {
    require(
        loanNFT.ownerOf(loanTokenId) == msg.sender,
        "Not loan owner"
    );

    require(
        !positionRegistry.hasActiveHedge(loanTokenId),
        "Loan already hedged"
    );

    uint256 maturityTime = block.timestamp + duration;

    swapId = swapFactory.createSwap(
        loanTokenId,
        msg.sender,
        address(this),
        notionalUsdc,
        fixedRateBps,
        maturityTime,
        settlementInterval
    );

    uint256 swapTokenId = swapNFT.mintSwap(
        msg.sender,
        swapId,
        loanTokenId,
        notionalUsdc,
        fixedRateBps,
        maturityTime
    );

    swapToTokenId[swapId] = swapTokenId;
    loanToSwapId[loanTokenId] = swapId;

    positionRegistry.linkPosition(
        loanTokenId,
        swapTokenId
    );

    emit SwapOpened(
        swapId,
        loanTokenId,
        swapTokenId
    );
}

// --------------------------------------------------
// Settlement
// --------------------------------------------------

function settleSwap(
    uint256 swapId
) public returns (uint256 settlementId) {
    SwapFactory.SwapPosition memory position =
        swapFactory.getSwap(swapId);

    require(
        position.status ==
            SwapFactory.SwapStatus.Active,
        "Swap inactive"
    );

    uint256 currentTime = block.timestamp;

    if (currentTime > position.maturityTime) {
        currentTime = position.maturityTime;
    }

    uint256 periodSeconds =
        currentTime - position.lastSettlementTime;

    require(periodSeconds > 0, "Already settled");

    uint256 floatingRate =
        lendingPool.currentBorrowRateBps();

    (
        uint256 amount,
        SwapMath.SettlementDirection direction
    ) = SwapMath.netSettlement(
            position.notionalUsdc,
            position.fixedRateBps,
            floatingRate,
            periodSeconds
        );

    settlementId = settlementEngine.recordSettlement(
        swapId,
        position.fixedPayer,
        position.floatingPayer,
        amount,
        direction
    );

    emit SettlementCalculated(
        settlementId,
        swapId,
        floatingRate,
        amount,
        direction
    );

    if (
        amount > 0 &&
        direction !=
            SwapMath.SettlementDirection.NoPayment
    ) {
        dvpEngine.executeSettlement(settlementId);
    }

    swapFactory.updateSettlement(
        swapId,
        currentTime
    );

    if (currentTime == position.maturityTime) {
        _closeSwap(swapId, position.loanTokenId);
    }
}

function settleSwaps(
    uint256[] calldata swapIds
) external {
    uint256 length = swapIds.length;

    for (uint256 i = 0; i < length; i++) {
        settleSwap(swapIds[i]);
    }
}

// --------------------------------------------------
// LoanManager Integration
// --------------------------------------------------

/// @notice Called by LoanManager when a loan is repaid.
function closeSwapByLoan(
    uint256 loanTokenId
) external onlyOwner {
    uint256 swapId = loanToSwapId[loanTokenId];

    if (swapId == 0) return;

    _closeSwap(swapId, loanTokenId);
}

// --------------------------------------------------
// Internal Closure
// --------------------------------------------------

function _closeSwap(
    uint256 swapId,
    uint256 loanTokenId
) internal {
    swapFactory.markMatured(swapId);
    swapFactory.closeSwap(swapId);

    uint256 swapTokenId = swapToTokenId[swapId];

    if (swapTokenId != 0) {
        swapNFT.burnSwap(swapTokenId);

        positionRegistry.unlinkPosition(
            loanTokenId
        );

        delete swapToTokenId[swapId];
        delete loanToSwapId[loanTokenId];
    }

    emit SwapClosed(swapId);
    emit SwapMatured(swapId);
}


}
