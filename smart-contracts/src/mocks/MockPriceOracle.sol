// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title MockPriceOracle
/// @notice Mock ETH/USD oracle for HedgeFi development and testing.
/// @dev Price uses 8 decimals, matching Chainlink ETH/USD feeds.
contract MockPriceOracle is Ownable {
    uint256 private ethPrice;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(address initialOwner) Ownable(initialOwner) {
        // Initial ETH price = $4,000
        // Chainlink ETH/USD feeds use 8 decimals
        ethPrice = 4000 * 1e8;
    }

    /// @notice Returns the current ETH price in USD (8 decimals).
    function getEthPrice() external view returns (uint256) {
        return ethPrice;
    }

    /// @notice Update the ETH price (owner only).
    function setEthPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Invalid price");

        uint256 oldPrice = ethPrice;
        ethPrice = newPrice;

        emit PriceUpdated(oldPrice, newPrice);
    }

    /// @notice Returns price with Chainlink-like decimals.
    function decimals() external pure returns (uint8) {
        return 8;
    }
}