// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title EscrowManager
/// @notice Custody layer for swap settlement funds.
/// @dev Holds USDC balances and allows only DvPEngine to lock/release funds.
contract EscrowManager is Ownable, ReentrancyGuard {
IERC20 public immutable usdc;


address public dvpEngine;

/// @notice Free balance available for future settlements.
mapping(address => uint256) public availableBalance;

/// @notice Balance currently reserved for an in-flight settlement.
mapping(address => uint256) public lockedBalance;

event DvPEngineUpdated(address indexed newEngine);

event Deposited(address indexed account, uint256 amount);
event Withdrawn(address indexed account, uint256 amount);

event Locked(address indexed account, uint256 amount);
event Released(
    address indexed from,
    address indexed to,
    uint256 amount
);
event Refunded(address indexed account, uint256 amount);

error Unauthorized();
error ZeroAmount();
error InsufficientBalance();
error InvalidAddress();

constructor(
    address usdcAddress,
    address initialOwner
) Ownable(initialOwner) {
    if (usdcAddress == address(0)) revert InvalidAddress();

    usdc = IERC20(usdcAddress);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setDvPEngine(address engine) external onlyOwner {
    if (engine == address(0)) revert InvalidAddress();

    dvpEngine = engine;

    emit DvPEngineUpdated(engine);
}

modifier onlyDvPEngine() {
    if (msg.sender != dvpEngine) revert Unauthorized();
    _;
}

// --------------------------------------------------
// User Escrow
// --------------------------------------------------

/// @notice Deposit USDC into escrow.
function deposit(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();

    require(
        usdc.transferFrom(msg.sender, address(this), amount),
        "Transfer failed"
    );

    availableBalance[msg.sender] += amount;

    emit Deposited(msg.sender, amount);
}

/// @notice Withdraw unlocked USDC from escrow.
function withdraw(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();

    if (availableBalance[msg.sender] < amount) {
        revert InsufficientBalance();
    }

    availableBalance[msg.sender] -= amount;

    require(
        usdc.transfer(msg.sender, amount),
        "Transfer failed"
    );

    emit Withdrawn(msg.sender, amount);
}

// --------------------------------------------------
// DvP Operations
// --------------------------------------------------

/// @notice Reserve funds before atomic settlement.
function lock(
    address account,
    uint256 amount
) external onlyDvPEngine {
    if (availableBalance[account] < amount) {
        revert InsufficientBalance();
    }

    availableBalance[account] -= amount;
    lockedBalance[account] += amount;

    emit Locked(account, amount);
}

/// @notice Complete settlement by moving locked funds to the receiver.
function release(
    address from,
    address to,
    uint256 amount
) external onlyDvPEngine {
    if (lockedBalance[from] < amount) {
        revert InsufficientBalance();
    }

    lockedBalance[from] -= amount;
    availableBalance[to] += amount;

    emit Released(from, to, amount);
}

/// @notice Return locked funds when settlement fails.
function refund(
    address account,
    uint256 amount
) external onlyDvPEngine {
    if (lockedBalance[account] < amount) {
        revert InsufficientBalance();
    }

    lockedBalance[account] -= amount;
    availableBalance[account] += amount;

    emit Refunded(account, amount);
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function totalBalance(
    address account
) external view returns (uint256) {
    return
        availableBalance[account] +
        lockedBalance[account];
}


}
