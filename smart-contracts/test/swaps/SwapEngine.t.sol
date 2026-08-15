// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SwapEngine} from "../../src/swaps/SwapEngine.sol";
import {SwapMath} from "../../src/libraries/SwapMath.sol";

// --------------------------------------------------
// Mocks
// --------------------------------------------------

contract MockLoanNFT {
mapping(uint256 => address) public owners;


function setOwner(uint256 tokenId, address owner) external {
    owners[tokenId] = owner;
}

function ownerOf(uint256 tokenId) external view returns (address) {
    return owners[tokenId];
}


}

contract MockSwapNFT {
uint256 public nextTokenId;

function mintSwap(
    address,
    uint256,
    uint256,
    uint256,
    uint256,
    uint256
) external returns (uint256) {
    nextTokenId++;
    return nextTokenId;
}

function burnSwap(uint256) external {}


}

contract MockPositionRegistry {
mapping(uint256 => bool) public hedged;
mapping(uint256 => uint256) public linked;


function hasActiveHedge(uint256 loanTokenId)
    external
    view
    returns (bool)
{
    return hedged[loanTokenId];
}

function linkPosition(uint256 loanTokenId, uint256 swapTokenId)
    external
{
    hedged[loanTokenId] = true;
    linked[loanTokenId] = swapTokenId;
}

function unlinkPosition(uint256 loanTokenId) external {
    hedged[loanTokenId] = false;
    linked[loanTokenId] = 0;
}


}

contract MockSwapFactory {
enum SwapStatus {
Active,
Matured,
Closed
}


struct SwapPosition {
    uint256 loanTokenId;
    uint256 notionalUsdc;
    uint256 fixedRateBps;
    uint256 lastSettlementTime;
    uint256 maturityTime;
    address fixedPayer;
    address floatingPayer;
    SwapStatus status;
}

uint256 public nextSwapId;
mapping(uint256 => SwapPosition) public swaps;

function createSwap(
    uint256 loanTokenId,
    address fixedPayer,
    address floatingPayer,
    uint256 notionalUsdc,
    uint256 fixedRateBps,
    uint256 maturityTime,
    uint256
) external returns (uint256 swapId) {
    swapId = ++nextSwapId;

    swaps[swapId] = SwapPosition({
        loanTokenId: loanTokenId,
        notionalUsdc: notionalUsdc,
        fixedRateBps: fixedRateBps,
        lastSettlementTime: block.timestamp,
        maturityTime: maturityTime,
        fixedPayer: fixedPayer,
        floatingPayer: floatingPayer,
        status: SwapStatus.Active
    });
}

function getSwap(uint256 swapId)
    external
    view
    returns (SwapPosition memory)
{
    return swaps[swapId];
}

function updateSettlement(uint256 swapId, uint256 ts) external {
    swaps[swapId].lastSettlementTime = ts;
}

function markMatured(uint256 swapId) external {
    swaps[swapId].status = SwapStatus.Matured;
}

function closeSwap(uint256 swapId) external {
    swaps[swapId].status = SwapStatus.Closed;
}


}

contract MockSettlementEngine {
uint256 public nextSettlementId;


function recordSettlement(
    uint256,
    address,
    address,
    uint256,
    SwapMath.SettlementDirection
) external returns (uint256) {
    return ++nextSettlementId;
}


}

contract MockLendingPool {
uint256 public rate = 700;


function currentBorrowRateBps() external view returns (uint256) {
    return rate;
}


}

contract MockDvPEngine {
uint256 public lastSettlementId;


function executeSettlement(uint256 settlementId) external {
    lastSettlementId = settlementId;
}


}

// --------------------------------------------------
// Tests
// --------------------------------------------------

contract SwapEngineTest is Test {
MockSwapFactory factory;
MockSettlementEngine settlement;
MockLendingPool pool;
MockDvPEngine dvp;
MockSwapNFT swapNFT;
MockPositionRegistry registry;
MockLoanNFT loanNFT;


SwapEngine engine;

address owner = address(this);
address borrower = address(0xA11CE);

function setUp() public {
    factory = new MockSwapFactory();
    settlement = new MockSettlementEngine();
    pool = new MockLendingPool();
    dvp = new MockDvPEngine();
    swapNFT = new MockSwapNFT();
    registry = new MockPositionRegistry();
    loanNFT = new MockLoanNFT();

    engine = new SwapEngine(
        address(factory),
        address(settlement),
        address(pool),
        address(dvp),
        address(swapNFT),
        address(registry),
        address(loanNFT),
        owner
    );

    loanNFT.setOwner(1, borrower);
}

// --------------------------------------------------
// openSwap
// --------------------------------------------------

function testOpenSwap() public {
    vm.prank(borrower);

    uint256 swapId = engine.openSwap(
        1,
        5_000e6,
        500,
        180 days,
        30 days
    );

    assertEq(swapId, 1);
    assertEq(engine.loanToSwapId(1), 1);
    assertEq(engine.swapToTokenId(1), 1);
    assertTrue(registry.hedged(1));
    assertEq(registry.linked(1), 1);
}

function testCannotOpenSwapIfNotLoanOwner() public {
    vm.expectRevert("Not loan owner");

    engine.openSwap(
        1,
        5_000e6,
        500,
        180 days,
        30 days
    );
}

function testCannotOpenSecondSwapForSameLoan() public {
    vm.startPrank(borrower);

    engine.openSwap(
        1,
        5_000e6,
        500,
        180 days,
        30 days
    );

    vm.expectRevert("Loan already hedged");

    engine.openSwap(
        1,
        5_000e6,
        500,
        180 days,
        30 days
    );

    vm.stopPrank();
}

// --------------------------------------------------
// closeSwapByLoan
// --------------------------------------------------

function testCloseSwapByLoan() public {
    vm.prank(borrower);

    engine.openSwap(
        1,
        5_000e6,
        500,
        180 days,
        30 days
    );

    engine.closeSwapByLoan(1);

    assertEq(engine.loanToSwapId(1), 0);
    assertEq(engine.swapToTokenId(1), 0);
    assertFalse(registry.hedged(1));
}

function testCloseSwapByLoanNoSwap() public {
    engine.closeSwapByLoan(999);

    assertEq(engine.loanToSwapId(999), 0);
}

// --------------------------------------------------
// Ownership
// --------------------------------------------------

function testOnlyOwnerCanCloseSwapByLoan() public {
    vm.prank(borrower);

    engine.openSwap(
        1,
        5_000e6,
        500,
        180 days,
        30 days
    );

    vm.prank(address(0xBAD));
    vm.expectRevert();

    engine.closeSwapByLoan(1);
}


}
