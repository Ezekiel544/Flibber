// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFIBStaking {
    function votingPower(address user) external view returns (uint256);
}

/**
 * @title GovernanceModule
 * @notice On-chain governance — staked $FIB holders vote on protocol decisions
 */
contract GovernanceModule is Ownable, ReentrancyGuard {

    IFIBStaking public fibStaking;

    enum ProposalState { Active, Passed, Failed, Executed, Cancelled }

    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        bytes callData;
        address target;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 startTime;
        uint256 endTime;
        ProposalState state;
        bool executed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public proposalCount;
    uint256 public constant VOTING_PERIOD = 3 days;
    uint256 public constant TIMELOCK_DELAY = 2 days;
    uint256 public constant PROPOSAL_THRESHOLD = 10_000 * 1e18;

    event ProposalCreated(uint256 indexed id, address proposer, string title, uint256 endTime);
    event VoteCast(uint256 indexed proposalId, address voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);

    error InsufficientVotingPower(uint256 required, uint256 available);
    error AlreadyVoted(address voter, uint256 proposalId);
    error VotingNotActive(uint256 proposalId);
    error ProposalNotPassed(uint256 proposalId);
    error TimelockNotElapsed();
    error ZeroAddress();

    constructor(address _fibStaking) Ownable(msg.sender) {
        if (_fibStaking == address(0)) revert ZeroAddress();
        fibStaking = IFIBStaking(_fibStaking);
    }

    function propose(
        string calldata title,
        string calldata description,
        address target,
        bytes calldata callData
    ) external returns (uint256 proposalId) {
        uint256 power = fibStaking.votingPower(msg.sender);
        if (power < PROPOSAL_THRESHOLD)
            revert InsufficientVotingPower(PROPOSAL_THRESHOLD, power);

        proposalId = ++proposalCount;
        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            title: title,
            description: description,
            callData: callData,
            target: target,
            forVotes: 0,
            againstVotes: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + VOTING_PERIOD,
            state: ProposalState.Active,
            executed: false
        });

        emit ProposalCreated(proposalId, msg.sender, title, block.timestamp + VOTING_PERIOD);
    }

    function vote(uint256 proposalId, bool support) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.state != ProposalState.Active || block.timestamp > proposal.endTime)
            revert VotingNotActive(proposalId);
        if (hasVoted[proposalId][msg.sender])
            revert AlreadyVoted(msg.sender, proposalId);

        uint256 weight = fibStaking.votingPower(msg.sender);
        hasVoted[proposalId][msg.sender] = true;

        if (support) { proposal.forVotes += weight; }
        else { proposal.againstVotes += weight; }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    function finalizeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp > proposal.endTime, "Voting still active");
        require(proposal.state == ProposalState.Active, "Already finalized");
        proposal.state = proposal.forVotes > proposal.againstVotes
            ? ProposalState.Passed : ProposalState.Failed;
    }

    function execute(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.state != ProposalState.Passed) revert ProposalNotPassed(proposalId);
        if (block.timestamp < proposal.endTime + TIMELOCK_DELAY) revert TimelockNotElapsed();
        if (proposal.executed) revert ProposalNotPassed(proposalId);

        proposal.executed = true;
        proposal.state = ProposalState.Executed;

        if (proposal.target != address(0) && proposal.callData.length > 0) {
            (bool success,) = proposal.target.call(proposal.callData);
            require(success, "Execution failed");
        }

        emit ProposalExecuted(proposalId);
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }
}
