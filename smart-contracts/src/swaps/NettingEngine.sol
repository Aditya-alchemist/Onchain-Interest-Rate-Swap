// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {SettlementEngine} from "./SettlementEngine.sol";
import {SwapMath} from "../libraries/SwapMath.sol";

/// @title NettingEngine
/// @notice Aggregates pending swap settlements into a single net obligation.
/// @dev Used by DvPEngine before atomic settlement.
contract NettingEngine is Ownable {
SettlementEngine public immutable settlementEngine;


struct NetObligation {
    address payer;
    address payee;
    uint256 amountUsdc;
}

constructor(
    address settlementEngineAddress,
    address initialOwner
) Ownable(initialOwner) {
    settlementEngine = SettlementEngine(settlementEngineAddress);
}

/// @notice Compute the net obligation for a single swap.
/// @return obligation Net payer/payee and amount.
function calculateNetForSwap(
    uint256 swapId
) public view returns (NetObligation memory obligation) {
    uint256[] memory settlementIds =
        settlementEngine.getSettlementsForSwap(swapId);

    if (settlementIds.length == 0) {
        return
            NetObligation({
                payer: address(0),
                payee: address(0),
                amountUsdc: 0
            });
    }

    int256 net;
    address fixedPayer;
    address floatingPayer;

    for (uint256 i = 0; i < settlementIds.length; i++) {
        SettlementEngine.Settlement memory settlement =
            settlementEngine.getSettlement(settlementIds[i]);

        if (
            settlement.status !=
            SettlementEngine.SettlementStatus.Pending
        ) {
            continue;
        }

        fixedPayer = settlement.fixedPayer;
        floatingPayer = settlement.floatingPayer;

        if (
            settlement.direction ==
            SwapMath.SettlementDirection.FixedPayerReceives
        ) {
            // Floating owes Fixed
            net += int256(settlement.amountUsdc);
        } else if (
            settlement.direction ==
            SwapMath.SettlementDirection.FloatingPayerReceives
        ) {
            // Fixed owes Floating
            net -= int256(settlement.amountUsdc);
        }
    }

    if (net > 0) {
        obligation = NetObligation({
            payer: floatingPayer,
            payee: fixedPayer,
            amountUsdc: uint256(net)
        });
    } else if (net < 0) {
        obligation = NetObligation({
            payer: fixedPayer,
            payee: floatingPayer,
            amountUsdc: uint256(-net)
        });
    } else {
        obligation = NetObligation({
            payer: address(0),
            payee: address(0),
            amountUsdc: 0
        });
    }
}

/// @notice Returns true if the swap has a non-zero pending net obligation.
function hasNetObligation(
    uint256 swapId
) external view returns (bool) {
    return calculateNetForSwap(swapId).amountUsdc > 0;
}


}
