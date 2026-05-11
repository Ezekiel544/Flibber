// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../staking/FIBStaking.sol";

/**
 * @title FlibberGovernance
 * @notice On-chain governance — 1 staked FIB = 1 vote
 * @dev Stakers vote on protocol parameters: fee rates, chain expansions,
 *      treasury spending, burn rates, and protocol upgrades.
 */
contract FlibberGovernance is AccessControl, ReentrancyGuard {

    FIBStaking public immutable staking;

    uint256 public constant VOTING_PERIOD  = 5 days;
    uint256 public constant TIMELOCK_DELAY = 2 days;
    uint256 public constant QUORUM_BPS     = 400; // 4% of total staked

    uint256 public proposalCount;

    enum ProposalState { ACTIVE, PASSED, FAILED, EXECUTED, CANCELLED }

    struct Proposal {
        uint256 id;
        address proposer;
        string  description;
        bytes   callData;      // encoded function call to execute
        address target;        // contract to call
        uint256 forVotes;
        uint256 againstVotes;
        uint256 startTime;
        uint256 endTime;
        uint256 executionTime; // timelock: endTime + TIMELOCK_DELAY
        ProposalState state;
        bool    executed;
    }

    mapping(uint256 => Proposal)                    public proposals;
    mapping(uint256 => mapping(address => bool))    public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public voteWeight;

    event ProposalCreated(uint256 indexed id, address indexed proposer, string description);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id);

    constructor(address _staking) {
        require(_staking != address(0), "Gov: zero staking");
        staking = FIBStaking(_staking);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ─────────────────────────────────────────────
    // PROPOSE
    // ─────────────────────────────────────────────

    function propose(
        string  calldata description,
        address target,
        bytes   calldata callData
    ) external returns (uint256 proposalId) {
        require(staking.votingPower(msg.sender) > 0, "Gov: no voting power");

        proposalId = ++proposalCount;

        proposals[proposalId] = Proposal({
            id:            proposalId,
            proposer:      msg.sender,
            description:   description,
            callData:      callData,
            target:        target,
            forVotes:      0,
            againstVotes:  0,
            startTime:     block.timestamp,
            endTime:       block.timestamp + VOTING_PERIOD,
            executionTime: block.timestamp + VOTING_PERIOD + TIMELOCK_DELAY,
            state:         ProposalState.ACTIVE,
            executed:      false
        });

        emit ProposalCreated(proposalId, msg.sender, description);
    }

    // ─────────────────────────────────────────────
    // VOTE
    // ─────────────────────────────────────────────

    function castVote(uint256 proposalId, bool support) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.state    == ProposalState.ACTIVE, "Gov: not active");
        require(block.timestamp <= p.endTime,       "Gov: voting ended");
        require(!hasVoted[proposalId][msg.sender],  "Gov: already voted");

        uint256 weight = staking.votingPower(msg.sender);
        require(weight > 0, "Gov: no voting power");

        hasVoted[proposalId][msg.sender]   = true;
        voteWeight[proposalId][msg.sender] = weight;

        if (support) {
            p.forVotes     += weight;
        } else {
            p.againstVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    // ─────────────────────────────────────────────
    // FINALIZE + EXECUTE
    // ─────────────────────────────────────────────

    function finalizeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.state    == ProposalState.ACTIVE, "Gov: not active");
        require(block.timestamp >  p.endTime,       "Gov: voting ongoing");

        uint256 totalStaked = staking.totalStaked();
        uint256 quorum      = (totalStaked * QUORUM_BPS) / 10_000;

        if (p.forVotes + p.againstVotes < quorum) {
            p.state = ProposalState.FAILED;
        } else if (p.forVotes > p.againstVotes) {
            p.state = ProposalState.PASSED;
        } else {
            p.state = ProposalState.FAILED;
        }
    }

    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.state    == ProposalState.PASSED, "Gov: not passed");
        require(block.timestamp >= p.executionTime, "Gov: timelock active");
        require(!p.executed,                        "Gov: already executed");

        p.executed = true;
        p.state    = ProposalState.EXECUTED;

        (bool success,) = p.target.call(p.callData);
        require(success, "Gov: execution failed");

        emit ProposalExecuted(proposalId);
    }

    // ─────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getVoteWeight(uint256 proposalId, address voter) external view returns (uint256) {
        return voteWeight[proposalId][voter];
    }
}
