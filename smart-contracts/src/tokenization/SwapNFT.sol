// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "../../lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title SwapNFT
/// @notice Tokenized representation of a HedgeFi interest-rate swap position.
/// @dev Minted by SwapEngine when a hedge is created and burned when the swap closes.
contract SwapNFT is ERC721, Ownable {
uint256 public nextTokenId;


address public swapEngine;

struct SwapMetadata {
    uint256 swapId;
    uint256 loanTokenId;
    uint256 notionalUsdc;
    uint256 fixedRateBps;
    uint256 startTime;
    uint256 maturityTime;
    bool active;
}

mapping(uint256 => SwapMetadata) public swapData;

event SwapEngineUpdated(address indexed newSwapEngine);

event SwapMinted(
    address indexed borrower,
    uint256 indexed tokenId,
    uint256 indexed swapId,
    uint256 loanTokenId
);

event SwapBurned(
    uint256 indexed tokenId,
    uint256 indexed swapId
);

error Unauthorized();

constructor(address initialOwner)
    ERC721("HedgeFi Swap Position", "HF-SWAP")
    Ownable(initialOwner)
{}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function setSwapEngine(address engine) external onlyOwner {
    swapEngine = engine;

    emit SwapEngineUpdated(engine);
}

modifier onlySwapEngine() {
    if (msg.sender != swapEngine) revert Unauthorized();
    _;
}

// --------------------------------------------------
// Mint / Burn
// --------------------------------------------------

function mintSwap(
    address borrower,
    uint256 swapId,
    uint256 loanTokenId,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 maturityTime
) external onlySwapEngine returns (uint256 tokenId) {
    tokenId = ++nextTokenId;

    _safeMint(borrower, tokenId);

    swapData[tokenId] = SwapMetadata({
        swapId: swapId,
        loanTokenId: loanTokenId,
        notionalUsdc: notionalUsdc,
        fixedRateBps: fixedRateBps,
        startTime: block.timestamp,
        maturityTime: maturityTime,
        active: true
    });

    emit SwapMinted(
        borrower,
        tokenId,
        swapId,
        loanTokenId
    );
}

function burnSwap(
    uint256 tokenId
) external onlySwapEngine {
    uint256 swapId = swapData[tokenId].swapId;

    delete swapData[tokenId];

    _burn(tokenId);

    emit SwapBurned(tokenId, swapId);
}

// --------------------------------------------------
// Views
// --------------------------------------------------

function getSwapMetadata(
    uint256 tokenId
) external view returns (SwapMetadata memory) {
    return swapData[tokenId];
}


}
