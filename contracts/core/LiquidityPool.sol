// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LiquidityPool
 * @notice FLIBBER's chain-agnostic unified liquidity reservoir
 * @dev LPs deposit supported assets and earn fees from every slot.
 *      The SlottingEngine draws from and reimburses this pool.
 *      Pool tracks balances per asset and per LP for pro-rata fee distribution.
 */
contract LiquidityPool is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant SLOTTING_ENGINE_ROLE = keccak256("SLOTTING_ENGINE_ROLE");
    bytes32 public constant REBALANCER_ROLE      = keccak256("REBALANCER_ROLE");

    // ─────────────────────────────────────────────
    // STRUCTS
    // ─────────────────────────────────────────────

    struct PoolAsset {
        bool    supported;
        uint256 totalDeposited;
        uint256 totalFeeEarned;
        uint256 rewardPerShare;  // scaled by 1e18
    }

    struct LPPosition {
        uint256 deposited;
        uint256 rewardDebt;   // scaled by 1e18
        uint256 pendingReward;
    }

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────

    mapping(address => PoolAsset)                       public assets;        // token → PoolAsset
    mapping(address => mapping(address => LPPosition))  public positions;     // lp → token → position
    address[]                                           public supportedAssets;

    uint256 public totalSlots;
    uint256 public totalVolumeUSD; // approximate, updated by oracle

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    event AssetAdded(address indexed token);
    event AssetRemoved(address indexed token);
    event Deposited(address indexed lp, address indexed token, uint256 amount);
    event Withdrawn(address indexed lp, address indexed token, uint256 amount);
    event SlotFulfilled(address indexed token, uint256 amountOut, address indexed recipient);
    event SlotReimbursed(address indexed token, uint256 amountIn);
    event FeeDistributed(address indexed token, uint256 feeAmount);
    event RewardClaimed(address indexed lp, address indexed token, uint256 reward);

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function addSupportedAsset(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0),     "Pool: zero token");
        require(!assets[token].supported, "Pool: already supported");
        assets[token].supported = true;
        supportedAssets.push(token);
        emit AssetAdded(token);
    }

    function removeSupportedAsset(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(assets[token].supported, "Pool: not supported");
        assets[token].supported = false;
        emit AssetRemoved(token);
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ─────────────────────────────────────────────
    // LP ACTIONS
    // ─────────────────────────────────────────────

    /**
     * @notice Deposit assets into the pool as a liquidity provider
     * @param token  The asset to deposit
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount)
        external nonReentrant whenNotPaused
    {
        require(assets[token].supported, "Pool: unsupported asset");
        require(amount > 0,              "Pool: zero amount");

        _settleReward(msg.sender, token);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        assets[token].totalDeposited     += amount;
        positions[msg.sender][token].deposited += amount;

        // Update reward debt to current rate (no retroactive rewards on new deposits)
        positions[msg.sender][token].rewardDebt =
            (positions[msg.sender][token].deposited * assets[token].rewardPerShare) / 1e18;

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw assets from the pool
     * @param token  The asset to withdraw
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount)
        external nonReentrant whenNotPaused
    {
        LPPosition storage pos = positions[msg.sender][token];
        require(pos.deposited >= amount, "Pool: insufficient balance");

        _settleReward(msg.sender, token);

        pos.deposited                    -= amount;
        assets[token].totalDeposited     -= amount;

        pos.rewardDebt =
            (pos.deposited * assets[token].rewardPerShare) / 1e18;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /**
     * @notice Claim accumulated LP rewards
     * @param token Asset pool to claim rewards from
     */
    function claimReward(address token) external nonReentrant {
        _settleReward(msg.sender, token);
        uint256 reward = positions[msg.sender][token].pendingReward;
        require(reward > 0, "Pool: no reward");
        positions[msg.sender][token].pendingReward = 0;
        IERC20(token).safeTransfer(msg.sender, reward);
        emit RewardClaimed(msg.sender, token, reward);
    }

    // ─────────────────────────────────────────────
    // SLOTTING ENGINE INTERFACE
    // ─────────────────────────────────────────────

    /**
     * @notice Called by SlottingEngine to release asset to user (slot out)
     * @param token     Asset to release
     * @param amount    Amount to release
     * @param recipient User receiving the asset
     */
    function fulfillSlot(address token, uint256 amount, address recipient)
        external onlyRole(SLOTTING_ENGINE_ROLE) nonReentrant whenNotPaused
    {
        require(assets[token].supported,             "Pool: unsupported asset");
        require(assets[token].totalDeposited >= amount, "Pool: insufficient liquidity");

        assets[token].totalDeposited -= amount;
        totalSlots++;

        IERC20(token).safeTransfer(recipient, amount);
        emit SlotFulfilled(token, amount, recipient);
    }

    /**
     * @notice Called by SlottingEngine when user's deposit arrives (slot in)
     * @param token  Asset being deposited back
     * @param amount Amount deposited
     */
    function reimburseSlot(address token, uint256 amount)
        external onlyRole(SLOTTING_ENGINE_ROLE) nonReentrant
    {
        require(assets[token].supported, "Pool: unsupported asset");
        // Tokens already transferred to this contract by SlottingEngine
        assets[token].totalDeposited += amount;
        emit SlotReimbursed(token, amount);
    }

    /**
     * @notice Distribute LP fee portion to pool (40% of total fee)
     * @param token     Asset fee is denominated in
     * @param feeAmount Fee amount to distribute
     */
    function distributeFee(address token, uint256 feeAmount)
        external onlyRole(SLOTTING_ENGINE_ROLE) nonReentrant
    {
        require(feeAmount > 0,                       "Pool: zero fee");
        require(assets[token].totalDeposited > 0,    "Pool: empty pool");

        assets[token].totalFeeEarned += feeAmount;

        // Increase rewardPerShare so all LPs get proportional share
        assets[token].rewardPerShare +=
            (feeAmount * 1e18) / assets[token].totalDeposited;

        emit FeeDistributed(token, feeAmount);
    }

    // ─────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────

    function getPoolBalance(address token) external view returns (uint256) {
        return assets[token].totalDeposited;
    }

    function getLPBalance(address lp, address token) external view returns (uint256) {
        return positions[lp][token].deposited;
    }

    function getPendingReward(address lp, address token) external view returns (uint256) {
        LPPosition storage pos = positions[lp][token];
        uint256 accumulated = (pos.deposited * assets[token].rewardPerShare) / 1e18;
        return pos.pendingReward + accumulated - pos.rewardDebt;
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return supportedAssets;
    }

    // ─────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────

    function _settleReward(address lp, address token) internal {
        LPPosition storage pos   = positions[lp][token];
        PoolAsset  storage asset = assets[token];

        if (pos.deposited > 0) {
            uint256 accumulated = (pos.deposited * asset.rewardPerShare) / 1e18;
            pos.pendingReward  += accumulated - pos.rewardDebt;
        }
        pos.rewardDebt = (pos.deposited * asset.rewardPerShare) / 1e18;
    }
}
