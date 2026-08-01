// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CollateralVault {
    event CollateralLocked(address indexed user, address indexed asset, uint256 amount);

    function lockCollateral(address asset, uint256 amount) external {
        emit CollateralLocked(msg.sender, asset, amount);
    }
}
