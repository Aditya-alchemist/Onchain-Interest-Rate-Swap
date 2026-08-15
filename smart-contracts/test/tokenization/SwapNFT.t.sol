// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SwapNFT} from "../../src/tokenization/SwapNFT.sol";

contract SwapNFTTest is Test {
SwapNFT swapNFT;


address owner = address(this);
address swapEngine = address(0xBEEF);
address borrower = address(0xA11CE);
address attacker = address(0xBAD);

function setUp() public {
    swapNFT = new SwapNFT(owner);
    swapNFT.setSwapEngine(swapEngine);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function testSetSwapEngine() public {
    address newEngine = address(0x1234);

    swapNFT.setSwapEngine(newEngine);

    assertEq(swapNFT.swapEngine(), newEngine);
}

function testOnlyOwnerCanSetSwapEngine() public {
    vm.prank(attacker);
    vm.expectRevert();

    swapNFT.setSwapEngine(attacker);
}

// --------------------------------------------------
// Minting
// --------------------------------------------------

function testMintSwap() public {
    vm.prank(swapEngine);

    uint256 tokenId = swapNFT.mintSwap(
        borrower,
        1,              // swapId
        12,             // loanTokenId
        5_000e6,        // notional
        500,            // fixed rate
        block.timestamp + 180 days
    );

    assertEq(tokenId, 1);
    assertEq(swapNFT.ownerOf(tokenId), borrower);

    SwapNFT.SwapMetadata memory meta =
        swapNFT.getSwapMetadata(tokenId);

    assertEq(meta.swapId, 1);
    assertEq(meta.loanTokenId, 12);
    assertEq(meta.notionalUsdc, 5_000e6);
    assertEq(meta.fixedRateBps, 500);
    assertTrue(meta.active);
}

function testMintSwapIncrementsTokenIds() public {
    vm.startPrank(swapEngine);

    uint256 token1 = swapNFT.mintSwap(
        borrower,
        1,
        12,
        5_000e6,
        500,
        block.timestamp + 180 days
    );

    uint256 token2 = swapNFT.mintSwap(
        borrower,
        2,
        13,
        6_000e6,
        600,
        block.timestamp + 180 days
    );

    vm.stopPrank();

    assertEq(token1, 1);
    assertEq(token2, 2);
    assertEq(swapNFT.nextTokenId(), 2);
}

function testUnauthorizedCannotMint() public {
    vm.prank(attacker);
    vm.expectRevert();

    swapNFT.mintSwap(
        borrower,
        1,
        12,
        5_000e6,
        500,
        block.timestamp + 180 days
    );
}

// --------------------------------------------------
// Burning
// --------------------------------------------------

function testBurnSwap() public {
    vm.startPrank(swapEngine);

    uint256 tokenId = swapNFT.mintSwap(
        borrower,
        1,
        12,
        5_000e6,
        500,
        block.timestamp + 180 days
    );

    swapNFT.burnSwap(tokenId);

    vm.stopPrank();

    vm.expectRevert();
    swapNFT.ownerOf(tokenId);

    SwapNFT.SwapMetadata memory meta =
        swapNFT.getSwapMetadata(tokenId);

    assertEq(meta.swapId, 0);
    assertEq(meta.loanTokenId, 0);
    assertEq(meta.notionalUsdc, 0);
    assertEq(meta.fixedRateBps, 0);
    assertEq(meta.startTime, 0);
    assertEq(meta.maturityTime, 0);
    assertFalse(meta.active);
}

function testUnauthorizedCannotBurn() public {
    vm.prank(swapEngine);

    uint256 tokenId = swapNFT.mintSwap(
        borrower,
        1,
        12,
        5_000e6,
        500,
        block.timestamp + 180 days
    );

    vm.prank(attacker);
    vm.expectRevert();

    swapNFT.burnSwap(tokenId);
}

// --------------------------------------------------
// Metadata
// --------------------------------------------------

function testMetadataPersists() public {
    uint256 maturity = block.timestamp + 365 days;

    vm.prank(swapEngine);

    uint256 tokenId = swapNFT.mintSwap(
        borrower,
        42,
        77,
        10_000e6,
        750,
        maturity
    );

    SwapNFT.SwapMetadata memory meta =
        swapNFT.getSwapMetadata(tokenId);

    assertEq(meta.swapId, 42);
    assertEq(meta.loanTokenId, 77);
    assertEq(meta.notionalUsdc, 10_000e6);
    assertEq(meta.fixedRateBps, 750);
    assertEq(meta.maturityTime, maturity);
    assertTrue(meta.active);
}

function testOwnerOfMintedNFT() public {
    vm.prank(swapEngine);

    uint256 tokenId = swapNFT.mintSwap(
        borrower,
        1,
        12,
        5_000e6,
        500,
        block.timestamp + 180 days
    );

    assertEq(
        swapNFT.ownerOf(tokenId),
        borrower
    );
}


}
