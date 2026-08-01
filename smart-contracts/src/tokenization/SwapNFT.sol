// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SwapNFT {
    event Minted(address indexed owner, uint256 indexed tokenId);

    function mint(address owner, uint256 tokenId) external {
        emit Minted(owner, tokenId);
    }
}
