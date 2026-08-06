// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

import {SwapFactory} from "./SwapFactory.sol";
import {SwapMath} from "../libraries/SwapMath.sol";
import {LendingPool} from "../lending/LendingPool.sol";

/// @title SwapEngine
/// @notice Opens and settles interest-rate swaps for HedgeFi.
/// @dev V1 records settlement amounts but does not transfer funds yet.
contract SwapEngine is Ownable {
SwapFactory public immutable swapFactory;
LendingPool public immutable lendingPool;


/// @notice Cumulative settlement amount for each swap.
mapping(uint256 => uint256) public cumulativeSettlement;

event SwapOpened(
    uint256 indexed swapId,
    uint256 indexed loanTokenId
);

event SwapSettled(
    uint256 indexed swapId,
    uint256 floatingRateBps,
    uint256 settlementAmount,
    SwapMath.SettlementDirection direction,
    uint256 periodSeconds
);

event SwapMatured(uint256 indexed swapId);

constructor(
    address swapFactoryAddress,
    address lendingPoolAddress,
    address initialOwner
) Ownable(initialOwner) {
    swapFactory = SwapFactory(swapFactoryAddress);
    lendingPool = LendingPool(lendingPoolAddress);
}

// --------------------------------------------------
// Open Swap
// --------------------------------------------------

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

function settleSwap(
    uint256 swapId
)
    public
    returns (
        uint256 amount,
        SwapMath.SettlementDirection direction
    )
{
    SwapFactory.SwapPosition memory position =
        swapFactory.getSwap(swapId);

    require(position.active, "Swap inactive");

    uint256 currentTime = block.timestamp;

    if (currentTime > position.maturityTime) {
        currentTime = position.maturityTime;
    }

    uint256 periodSeconds =
        currentTime - position.lastSettlementTime;

    if (periodSeconds == 0) {
        return (
            0,
            SwapMath.SettlementDirection.NoPayment
        );
    }

    uint256 floatingRate =
        lendingPool.currentBorrowRateBps();

    (amount, direction) = SwapMath.netSettlement(
        position.notionalUsdc,
        position.fixedRateBps,
        floatingRate,
        periodSeconds
    );

    cumulativeSettlement[swapId] += amount;

    swapFactory.updateLastSettlementTime(swapId);

    emit SwapSettled(
        swapId,
        floatingRate,
        amount,
        direction,
        periodSeconds
    );

    if (currentTime == position.maturityTime) {
        swapFactory.closeSwap(swapId);
        emit SwapMatured(swapId);
    }
}

// --------------------------------------------------
// Batch Settlement
// --------------------------------------------------

function settleSwaps(
    uint256[] calldata swapIds
) external {
    uint256 length = swapIds.length;

    for (uint256 i = 0; i < length; i++) {
        settleSwap(swapIds[i]);
    }
}


}
