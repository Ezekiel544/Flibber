// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFIBStaking {
    function votingPowerAt(address user) external view returns (uint256);
    function totalStaked() external view returns (uint256);
}

/**
 * @title FlibberGovernance
 * @notice On-chain governance for FLIBBER protocol
 * @dev Staked $FIB = voting power (1 staked FIB = 1 vote)
 *      Proposals: fee changes, new chain deployments, treasury spending, upgrades
 *
 * Proposal lifecycle:
 *   Created → Voting (3 days) → Queued (2 day timelock) → Executed / Defeated / Expired
 */
contract FlibberGovernance is Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────
    // Enums
    // ─────────────────────────────────────────────

    enum ProposalState {
        Pending,
        Active,
        Succeeded,
        Defeated,
        Queued,
        Executed,
        Expired,
        Cancelled
    }

    enum ProposalType {
        FeeChange,
        NewChain,
        TreasurySpend,
        ProtocolUpgrade,
        GeneralGovernance
    }

    // ─────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────

    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        string title;
        string description;
        bytes callData;          // Encoded function call to execute
        address target;          // Contract to call
        uint256 value;           // ETH value (usually 0)
        uint256 startTime;
        uint256 endTime;
        uint256 queuedAt;
        uint256 executedAt;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        ProposalState state;
        bool executed;
        bool cancelled;
    }

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    IFIBStaking public stakingContract;

    // Governance parameters
    uint256 public votingPeriod = 3 days;
    uint256 public timelockDelay = 2 days;
    uint256 public proposalThreshold = 100_000 * 1e18;  // 100k FIB staked to propose
    uint256 public quorumBps = 400;                      // 4% of total staked must vote

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public voteWeight;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string title, ProposalType proposalType);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint8 support, uint256 weight);
    event ProposalQueued(uint256 indexed proposalId, uint256 executeAfter);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event GovernanceParamsUpdated(uint256 votingPeriod, uint256 timelockDelay, uint256 threshold);

    // ─────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────

    error InsufficientVotingPower(uint256 required, uint256 actual);
    error ProposalNotActive(uint256 proposalId);
    error AlreadyVoted(address voter);
    error ProposalNotSucceeded(uint256 proposalId);
    error TimelockNotExpired(uint256 executeAfter);
    error ProposalNotQueued(uint256 proposalId);
    error QuorumNotReached(uint256 required, uint256 actual);
    error Unauthorized(address caller);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _stakingContract) Ownable(msg.sender) {
        stakingContract = IFIBStaking(_stakingContract);
    }

    // ─────────────────────────────────────────────
    // Propose
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new governance proposal
     * @dev Requires proposalThreshold staked FIB
     */
    function propose(
        string calldata title,
        string calldata description,
        ProposalType proposalType,
        address target,
        bytes calldata callData,
        uint256 value
    ) external returns (uint256 proposalId) {
        uint256 proposerPower = stakingContract.votingPowerAt(msg.sender);
        if (proposerPower < proposalThreshold)
            revert InsufficientVotingPower(proposalThreshold, proposerPower);

        proposalId = ++proposalCount;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            proposalType: proposalType,
            title: title,
            description: description,
            callData: callData,
            target: target,
            value: value,
            startTime: block.timestamp,
            endTime: block.timestamp + votingPeriod,
            queuedAt: 0,
            executedAt: 0,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            state: ProposalState.Active,
            executed: false,
            cancelled: false
        });

        emit ProposalCreated(proposalId, msg.sender, title, proposalType);
    }

    // ─────────────────────────────────────────────
    // Vote
    // ─────────────────────────────────────────────

    /**
     * @notice Cast a vote on an active proposal
     * @param proposalId  ID of the proposal
     * @param support     0 = Against, 1 = For, 2 = Abstain
     */
    function castVote(uint256 proposalId, uint8 support) external nonReentrant {
        Proposal storage p = proposals[proposalId];

        if (p.state != ProposalState.Active || block.timestamp > p.endTime)
            revert ProposalNotActive(proposalId);
        if (hasVoted[proposalId][msg.sender])
            revert AlreadyVoted(msg.sender);

        uint256 weight = stakingContract.votingPowerAt(msg.sender);

        hasVoted[proposalId][msg.sender] = true;
        voteWeight[proposalId][msg.sender] = weight;

        if (support == 1) {
            p.forVotes += weight;
        } else if (support == 0) {
            p.againstVotes += weight;
        } else {
            p.abstainVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    // ─────────────────────────────────────────────
    // Queue
    // ─────────────────────────────────────────────

    /**
     * @notice Queue a succeeded proposal for execution after timelock
     */
    function queueProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];

        // Check voting period ended
        require(block.timestamp > p.endTime, "Governance: voting not ended");

        // Check quorum
        uint256 totalVotes = p.forVotes + p.againstVotes + p.abstainVotes;
        uint256 quorumRequired = (stakingContract.totalStaked() * quorumBps) / 10000;
        if (totalVotes < quorumRequired)
            revert QuorumNotReached(quorumRequired, totalVotes);

        // Check majority
        if (p.forVotes <= p.againstVotes) {
            p.state = ProposalState.Defeated;
            return;
        }

        p.state = ProposalState.Queued;
        p.queuedAt = block.timestamp;

        emit ProposalQueued(proposalId, block.timestamp + timelockDelay);
    }

    // ─────────────────────────────────────────────
    // Execute
    // ─────────────────────────────────────────────

    /**
     * @notice Execute a queued proposal after timelock expires
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];

        if (p.state != ProposalState.Queued)
            revert ProposalNotQueued(proposalId);
        if (block.timestamp < p.queuedAt + timelockDelay)
            revert TimelockNotExpired(p.queuedAt + timelockDelay);

        p.state = ProposalState.Executed;
        p.executed = true;
        p.executedAt = block.timestamp;

        // Execute the proposal's call
        if (p.target != address(0) && p.callData.length > 0) {
            (bool ok,) = p.target.call{value: p.value}(p.callData);
            require(ok, "Governance: execution failed");
        }

        emit ProposalExecuted(proposalId);
    }

    // ─────────────────────────────────────────────
    // Cancel
    // ─────────────────────────────────────────────

    function cancelProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.proposer != msg.sender && msg.sender != owner())
            revert Unauthorized(msg.sender);
        require(!p.executed, "Governance: already executed");

        p.state = ProposalState.Cancelled;
        p.cancelled = true;

        emit ProposalCancelled(proposalId);
    }

    // ─────────────────────────────────────────────
    // Admin — update governance params (via governance itself eventually)
    // ─────────────────────────────────────────────

    function updateGovernanceParams(
        uint256 _votingPeriod,
        uint256 _timelockDelay,
        uint256 _threshold,
        uint256 _quorumBps
    ) external onlyOwner {
        require(_votingPeriod >= 1 days, "Governance: min 1 day voting");
        require(_timelockDelay >= 1 days, "Governance: min 1 day timelock");
        require(_quorumBps <= 2000, "Governance: max 20% quorum");

        votingPeriod = _votingPeriod;
        timelockDelay = _timelockDelay;
        proposalThreshold = _threshold;
        quorumBps = _quorumBps;

        emit GovernanceParamsUpdated(_votingPeriod, _timelockDelay, _threshold);
    }

    // ─────────────────────────────────────────────
    // View
    // ─────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getProposalState(uint256 proposalId) external view returns (ProposalState) {
        Proposal storage p = proposals[proposalId];
        if (p.cancelled) return ProposalState.Cancelled;
        if (p.executed) return ProposalState.Executed;
        if (block.timestamp <= p.endTime) return ProposalState.Active;
        return p.state;
    }

    function getVotingPower(address user) external view returns (uint256) {
        return stakingContract.votingPowerAt(user);
    }
}
