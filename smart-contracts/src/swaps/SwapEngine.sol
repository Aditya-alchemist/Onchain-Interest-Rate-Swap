// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

import {SwapFactory} from "./SwapFactory.sol";
import {SettlementEngine} from "./SettlementEngine.sol";
import {SwapMath} from "../libraries/SwapMath.sol";
import {LendingPool} from "../lending/LendingPool.sol";
import {DvPEngine} from "../settlement/DvPEngine.sol";

/// @title SwapEngine
/// @notice Creates swaps, calculates floating-vs-fixed obligations,
///         records settlements, and triggers atomic DvP settlement.
contract SwapEngine is Ownable {
SwapFactory public immutable swapFactory;
SettlementEngine public immutable settlementEngine;
LendingPool public immutable lendingPool;
DvPEngine public immutable dvpEngine;


event SwapOpened(
    uint256 indexed swapId,
    uint256 indexed loanTokenId
);

event SettlementCalculated(
    uint256 indexed settlementId,
    uint256 indexed swapId,
    uint256 floatingRateBps,
    uint256 amountUsdc,
    SwapMath.SettlementDirection direction
);

event SwapMatured(uint256 indexed swapId);

constructor(
    address swapFactoryAddress,
    address settlementEngineAddress,
    address lendingPoolAddress,
    address dvpEngineAddress,
    address initialOwner
) Ownable(initialOwner) {
    swapFactory = SwapFactory(swapFactoryAddress);
    settlementEngine = SettlementEngine(settlementEngineAddress);
    lendingPool = LendingPool(lendingPoolAddress);
    dvpEngine = DvPEngine(dvpEngineAddress);
}

// --------------------------------------------------
// Swap Creation
// --------------------------------------------------

/// @notice Create a new hedge for a floating-rate loan.
function openSwap(
    uint256 loanTokenId,
    address borrower,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 duration,
    uint256 settlementInterval
) external onlyOwner returns (uint256 swapId) {
    swapId = swapFactory.createSwap(
        loanTokenId,
        borrower,
        address(this),
        notionalUsdc,
        fixedRateBps,
        block.timestamp + duration,
        settlementInterval
    );

    emit SwapOpened(swapId, loanTokenId);
}

// --------------------------------------------------
// Settlement
// --------------------------------------------------

/// @notice Calculate one settlement period and execute atomic DvP.
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

    // Execute atomic DvP only when there is a payment obligation.
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
        swapFactory.markMatured(swapId);
        swapFactory.closeSwap(swapId);

        emit SwapMatured(swapId);
    }
}

/// @notice Batch settlement for multiple swaps.
function settleSwaps(
    uint256[] calldata swapIds
) external {
    uint256 length = swapIds.length;

    for (uint256 i = 0; i < length; i++) {
        settleSwap(swapIds[i]);
    }
}


}
