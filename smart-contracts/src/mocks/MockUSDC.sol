// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice Mock USDC token for HedgeFi development and testing.
/// @dev Uses 6 decimals to match real USDC behavior.
contract MockUSDC is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("Mock USD Coin", "mUSDC")
        Ownable(initialOwner)
    {}

    /// @notice USDC uses 6 decimals instead of 18.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens for testing.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn tokens for testing.
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}