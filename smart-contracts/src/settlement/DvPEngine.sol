// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

import {SettlementEngine} from "../swaps/SettlementEngine.sol";
import {NettingEngine} from "../swaps/NettingEngine.sol";
import {EscrowManager} from "./EscrowManager.sol";

/// @title DvPEngine
/// @notice Executes atomic Delivery-versus-Payment settlement for HedgeFi swaps.
/// @dev Uses net obligations from NettingEngine and escrow balances from EscrowManager.
contract DvPEngine is Ownable {
SettlementEngine public immutable settlementEngine;
NettingEngine public immutable nettingEngine;
EscrowManager public immutable escrowManager;


event AtomicSettlementExecuted(
    uint256 indexed settlementId,
    uint256 indexed swapId,
    address indexed payer,
    address payee,
    uint256 amountUsdc
);

constructor(
    address settlementEngineAddress,
    address nettingEngineAddress,
    address escrowManagerAddress,
    address initialOwner
) Ownable(initialOwner) {
    settlementEngine = SettlementEngine(settlementEngineAddress);
    nettingEngine = NettingEngine(nettingEngineAddress);
    escrowManager = EscrowManager(escrowManagerAddress);
}

/// @notice Execute a settlement atomically using escrowed balances.
/// @dev If any step fails, the entire transaction reverts.
function executeSettlement(
    uint256 settlementId
) external onlyOwner {
    SettlementEngine.Settlement memory settlement =
        settlementEngine.getSettlement(settlementId);

    require(
        settlement.status ==
            SettlementEngine.SettlementStatus.Pending,
        "Settlement not pending"
    );

    NettingEngine.NetObligation memory obligation =
        nettingEngine.calculateNetForSwap(
            settlement.swapId
        );

    require(
        obligation.amountUsdc > 0,
        "Nothing to settle"
    );

    // Lock funds from payer.
    escrowManager.lock(
        obligation.payer,
        obligation.amountUsdc
    );

    // Atomically deliver payment to payee.
    escrowManager.release(
        obligation.payer,
        obligation.payee,
        obligation.amountUsdc
    );

    // Mark settlement as executed.
    settlementEngine.markExecuted(settlementId);

    emit AtomicSettlementExecuted(
        settlementId,
        settlement.swapId,
        obligation.payer,
        obligation.payee,
        obligation.amountUsdc
    );
}


}
