// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

import {SettlementEngine} from "../swaps/SettlementEngine.sol";
import {NettingEngine} from "../swaps/NettingEngine.sol";
import {EscrowManager} from "./EscrowManager.sol";

/// @title DvPEngine
/// @notice Delivery-versus-payment engine for HedgeFi settlements.
/// @dev Settlement execution can be triggered by the configured SwapEngine.
///      Administrative configuration remains restricted to the protocol owner.
contract DvPEngine is Ownable {
    SettlementEngine public immutable settlementEngine;
    NettingEngine public immutable nettingEngine;
    EscrowManager public immutable escrowManager;

    /// @notice SwapEngine authorized to trigger settlement execution.
    address public swapEngine;

    event SwapEngineUpdated(
        address indexed oldSwapEngine,
        address indexed newSwapEngine
    );

    event AtomicSettlementExecuted(
        uint256 indexed settlementId,
        uint256 indexed swapId,
        address indexed payer,
        address payee,
        uint256 amountUsdc
    );

    error InvalidSwapEngine();
    error UnauthorizedCaller(address caller);

    modifier onlyOwnerOrSwapEngine() {
        if (msg.sender != owner() && msg.sender != swapEngine) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }

    constructor(
        address settlementEngineAddress,
        address nettingEngineAddress,
        address escrowManagerAddress,
        address initialOwner
    ) Ownable(initialOwner) {
        require(
            settlementEngineAddress != address(0),
            "Invalid SettlementEngine"
        );

        require(
            nettingEngineAddress != address(0),
            "Invalid NettingEngine"
        );

        require(
            escrowManagerAddress != address(0),
            "Invalid EscrowManager"
        );

        settlementEngine =
            SettlementEngine(settlementEngineAddress);

        nettingEngine =
            NettingEngine(nettingEngineAddress);

        escrowManager =
            EscrowManager(escrowManagerAddress);
    }

    // --------------------------------------------------
    // Configuration
    // --------------------------------------------------

    /// @notice Configure the SwapEngine allowed to execute settlements.
    /// @dev Only the protocol owner can change this address.
    function setSwapEngine(
        address newSwapEngine
    ) external onlyOwner {
        if (newSwapEngine == address(0)) {
            revert InvalidSwapEngine();
        }

        address oldSwapEngine = swapEngine;

        swapEngine = newSwapEngine;

        emit SwapEngineUpdated(
            oldSwapEngine,
            newSwapEngine
        );
    }

    // --------------------------------------------------
    // Settlement Execution
    // --------------------------------------------------

    /// @notice Execute a settlement atomically using escrowed balances.
    /// @dev Can be called by the configured SwapEngine or the owner.
    function executeSettlement(
        uint256 settlementId
    ) external onlyOwnerOrSwapEngine {
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

        // --------------------------------------------------
        // Lock funds from payer
        // --------------------------------------------------

        escrowManager.lock(
            obligation.payer,
            obligation.amountUsdc
        );

        // --------------------------------------------------
        // Atomically deliver payment to payee
        // --------------------------------------------------

        escrowManager.release(
            obligation.payer,
            obligation.payee,
            obligation.amountUsdc
        );

        // --------------------------------------------------
        // Mark settlement executed
        // --------------------------------------------------

        settlementEngine.markExecuted(
            settlementId
        );

        emit AtomicSettlementExecuted(
            settlementId,
            settlement.swapId,
            obligation.payer,
            obligation.payee,
            obligation.amountUsdc
        );
    }
}