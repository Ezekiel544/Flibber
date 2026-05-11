// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FIBStaking
 * @notice Stake $FIB to earn 40% of all protocol fees
 * @dev Stakers receive proportional share of fees deposited by FeeEngine.
 *      Staked FIB also counts as voting power in governance.
 */
contract FIBStaking is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARD_DISTRIBUTOR_ROLE = keccak256("REWARD_DISTRIBUTOR_ROLE");

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────

    IERC20 public immutable fibToken;

    uint256 public totalStaked;
    uint256 public rewardPerShareStored; // scaled 1e18
    uint256 public lastUpdateTime;

    uint256 public constant UNSTAKE_COOLDOWN = 7 days;

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 pendingReward;
        uint256 unstakeRequestTime; // 0 = no pending unstake
        uint256 unstakeAmount;
    }

    mapping(address => StakeInfo) public stakes;

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount);
    event UnstakeRequested(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardDeposited(uint256 amount);

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────

    constructor(address _fibToken) {
        require(_fibToken != address(0), "Staking: zero token");
        fibToken = IERC20(_fibToken);
        _grantRole(DEFAULT_ADMIN_ROLE,        msg.sender);
        _grantRole(REWARD_DISTRIBUTOR_ROLE,   msg.sender);
    }

    // ─────────────────────────────────────────────
    // STAKE / UNSTAKE
    // ─────────────────────────────────────────────

    /**
     * @notice Stake FIB to earn protocol fees
     * @param amount Amount of FIB to stake
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Staking: zero amount");
        _updateReward(msg.sender);

        fibToken.safeTransferFrom(msg.sender, address(this), amount);

        stakes[msg.sender].amount    += amount;
        totalStaked                  += amount;

        stakes[msg.sender].rewardDebt =
            (stakes[msg.sender].amount * rewardPerShareStored) / 1e18;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Request unstake — starts 7 day cooldown
     * @param amount Amount to unstake
     */
    function requestUnstake(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount >= amount,               "Staking: insufficient stake");
        require(s.unstakeRequestTime == 0,        "Staking: unstake already pending");

        _updateReward(msg.sender);

        s.unstakeRequestTime = block.timestamp;
        s.unstakeAmount      = amount;
        s.amount            -= amount;
        totalStaked         -= amount;

        s.rewardDebt = (s.amount * rewardPerShareStored) / 1e18;

        emit UnstakeRequested(msg.sender, amount);
    }

    /**
     * @notice Complete unstake after cooldown period
     */
    function unstake() external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(s.unstakeRequestTime > 0,                          "Staking: no pending unstake");
        require(block.timestamp >= s.unstakeRequestTime + UNSTAKE_COOLDOWN, "Staking: cooldown active");

        uint256 amount           = s.unstakeAmount;
        s.unstakeRequestTime     = 0;
        s.unstakeAmount          = 0;

        fibToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Claim accumulated staking rewards
     */
    function claimReward() external nonReentrant {
        _updateReward(msg.sender);
        uint256 reward = stakes[msg.sender].pendingReward;
        require(reward > 0, "Staking: no reward");

        stakes[msg.sender].pendingReward = 0;
        fibToken.safeTransfer(msg.sender, reward);
        emit RewardClaimed(msg.sender, reward);
    }

    // ─────────────────────────────────────────────
    // REWARD DISTRIBUTION (called by FeeEngine)
    // ─────────────────────────────────────────────

    /**
     * @notice Deposit protocol fee rewards to be distributed to stakers
     * @dev Called by FeeEngine with the 40% LP/staker share
     * @param amount Reward amount in FIB
     */
    function depositReward(uint256 amount)
        external onlyRole(REWARD_DISTRIBUTOR_ROLE) nonReentrant
    {
        require(amount      > 0,          "Staking: zero reward");
        require(totalStaked > 0,          "Staking: no stakers");

        fibToken.safeTransferFrom(msg.sender, address(this), amount);

        rewardPerShareStored += (amount * 1e18) / totalStaked;
        lastUpdateTime        = block.timestamp;

        emit RewardDeposited(amount);
    }

    // ─────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────

    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return stakes[user];
    }

    function pendingReward(address user) external view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0) return s.pendingReward;
        uint256 accumulated = (s.amount * rewardPerShareStored) / 1e18;
        return s.pendingReward + accumulated - s.rewardDebt;
    }

    /// @notice Voting power = staked amount (used by governance)
    function votingPower(address user) external view returns (uint256) {
        return stakes[user].amount;
    }

    // ─────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────

    function _updateReward(address user) internal {
        StakeInfo storage s = stakes[user];
        if (s.amount > 0) {
            uint256 accumulated   = (s.amount * rewardPerShareStored) / 1e18;
            s.pendingReward      += accumulated - s.rewardDebt;
        }
        s.rewardDebt = (s.amount * rewardPerShareStored) / 1e18;
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
