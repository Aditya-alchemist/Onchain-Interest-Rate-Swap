// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Governance {
    address public admin;

    event ProposalCreated(uint256 indexed id, string description);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function createProposal(uint256 id, string calldata description) external onlyAdmin {
        emit ProposalCreated(id, description);
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }
}
