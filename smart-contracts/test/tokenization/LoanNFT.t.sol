// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LoanNFT} from "../../src/tokenization/LoanNFT.sol";

contract LoanNFTTest is Test {
LoanNFT loanNFT;


address owner = address(this);
address loanManager = address(0xBEEF);
address borrower = address(0xA11CE);
address attacker = address(0xBAD);

function setUp() public {
    loanNFT = new LoanNFT(owner);
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

function testSetLoanManager() public {
    loanNFT.setLoanManager(loanManager);
    assertEq(loanNFT.loanManager(), loanManager);
}

function testOnlyOwnerCanSetLoanManager() public {
    vm.prank(attacker);
    vm.expectRevert();
    loanNFT.setLoanManager(attacker);
}

// --------------------------------------------------
// Minting
// --------------------------------------------------

function testMintLoan() public {
    loanNFT.setLoanManager(loanManager);

    vm.prank(loanManager);
    uint256 tokenId = loanNFT.mintLoan(
        borrower,
        5_000e6,
        2 ether,
        700
    );

    assertEq(tokenId, 1);
    assertEq(loanNFT.ownerOf(tokenId), borrower);

    LoanNFT.LoanMetadata memory meta =
        loanNFT.getLoanMetadata(tokenId);

    assertEq(meta.principalUsdc, 5_000e6);
    assertEq(meta.collateralEth, 2 ether);
    assertEq(meta.borrowRateBps, 700);
    assertEq(meta.startTime, block.timestamp);
    assertTrue(meta.active);
}

function testTokenIdIncrements() public {
    loanNFT.setLoanManager(loanManager);

    vm.startPrank(loanManager);

    uint256 first = loanNFT.mintLoan(
        borrower,
        1_000e6,
        1 ether,
        500
    );

    uint256 second = loanNFT.mintLoan(
        borrower,
        2_000e6,
        2 ether,
        600
    );

    vm.stopPrank();

    assertEq(first, 1);
    assertEq(second, 2);
    assertEq(loanNFT.nextTokenId(), 2);
}

function testUnauthorizedCannotMintLoan() public {
    vm.expectRevert(LoanNFT.Unauthorized.selector);

    loanNFT.mintLoan(
        borrower,
        5_000e6,
        2 ether,
        700
    );
}

// --------------------------------------------------
// Burning
// --------------------------------------------------

function testBurnLoan() public {
    loanNFT.setLoanManager(loanManager);

    vm.prank(loanManager);
    uint256 tokenId = loanNFT.mintLoan(
        borrower,
        5_000e6,
        2 ether,
        700
    );

    assertEq(loanNFT.ownerOf(tokenId), borrower);

    vm.prank(loanManager);
    loanNFT.burnLoan(tokenId);

    vm.expectRevert();
    loanNFT.ownerOf(tokenId);

    LoanNFT.LoanMetadata memory meta =
        loanNFT.getLoanMetadata(tokenId);

    assertEq(meta.principalUsdc, 0);
    assertEq(meta.collateralEth, 0);
    assertEq(meta.borrowRateBps, 0);
    assertEq(meta.startTime, 0);
    assertFalse(meta.active);
}

function testUnauthorizedCannotBurnLoan() public {
    loanNFT.setLoanManager(loanManager);

    vm.prank(loanManager);
    uint256 tokenId = loanNFT.mintLoan(
        borrower,
        5_000e6,
        2 ether,
        700
    );

    vm.prank(attacker);
    vm.expectRevert(LoanNFT.Unauthorized.selector);
    loanNFT.burnLoan(tokenId);
}

// --------------------------------------------------
// Ownership
// --------------------------------------------------

function testLoanNFTOwnership() public {
    loanNFT.setLoanManager(loanManager);

    vm.prank(loanManager);
    uint256 tokenId = loanNFT.mintLoan(
        borrower,
        5_000e6,
        2 ether,
        700
    );

    assertEq(loanNFT.ownerOf(tokenId), borrower);
}

// --------------------------------------------------
// Metadata
// --------------------------------------------------

function testMetadataInitiallyEmpty() public {
    LoanNFT.LoanMetadata memory meta =
        loanNFT.getLoanMetadata(999);

    assertEq(meta.principalUsdc, 0);
    assertEq(meta.collateralEth, 0);
    assertEq(meta.borrowRateBps, 0);
    assertEq(meta.startTime, 0);
    assertFalse(meta.active);
}

function testMetadataPersistsAcrossReads() public {
    loanNFT.setLoanManager(loanManager);

    vm.prank(loanManager);
    uint256 tokenId = loanNFT.mintLoan(
        borrower,
        7_500e6,
        3 ether,
        850
    );

    LoanNFT.LoanMetadata memory first =
        loanNFT.getLoanMetadata(tokenId);

    LoanNFT.LoanMetadata memory second =
        loanNFT.getLoanMetadata(tokenId);

    assertEq(first.principalUsdc, second.principalUsdc);
    assertEq(first.collateralEth, second.collateralEth);
    assertEq(first.borrowRateBps, second.borrowRateBps);
    assertEq(first.startTime, second.startTime);
    assertEq(first.active, second.active);
}


}
