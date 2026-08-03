// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "../../lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

contract LoanNFT is ERC721, Ownable {
    uint256 public nextTokenId;

    address public loanManager;

    struct LoanMetadata {
        uint256 principalUsdc;
        uint256 collateralEth;
        uint256 borrowRateBps;
        uint256 startTime;
        bool active;
    }

    mapping(uint256 => LoanMetadata) public loanData;

    event LoanManagerUpdated(address indexed newLoanManager);

    event LoanMinted(
        address indexed borrower,
        uint256 indexed tokenId,
        uint256 principalUsdc,
        uint256 collateralEth
    );

    event LoanBurned(uint256 indexed tokenId);

    error Unauthorized();

    constructor(address initialOwner)
        ERC721("HedgeFi Loan Position", "HF-LOAN")
        Ownable(initialOwner)
    {}

    function setLoanManager(address manager) external onlyOwner {
        loanManager = manager;

        emit LoanManagerUpdated(manager);
    }

    modifier onlyLoanManager() {
        if (msg.sender != loanManager) revert Unauthorized();
        _;
    }

    function mintLoan(
        address borrower,
        uint256 principalUsdc,
        uint256 collateralEth,
        uint256 borrowRateBps
    ) external onlyLoanManager returns (uint256 tokenId) {
        tokenId = ++nextTokenId;

        _safeMint(borrower, tokenId);

        loanData[tokenId] = LoanMetadata({
            principalUsdc: principalUsdc,
            collateralEth: collateralEth,
            borrowRateBps: borrowRateBps,
            startTime: block.timestamp,
            active: true
        });

        emit LoanMinted(
            borrower,
            tokenId,
            principalUsdc,
            collateralEth
        );
    }

    function burnLoan(uint256 tokenId) external onlyLoanManager {
        delete loanData[tokenId];

        _burn(tokenId);

        emit LoanBurned(tokenId);
    }

    function getLoanMetadata(
        uint256 tokenId
    ) external view returns (LoanMetadata memory) {
        return loanData[tokenId];
    }
}