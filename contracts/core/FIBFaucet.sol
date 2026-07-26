// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FIBFaucet
 * @notice Testnet faucet — drips 50 FIB per wallet every 24 hours.
 *         Rate limit is enforced ON-CHAIN so it cannot be bypassed
 *         by clearing browser storage or switching devices.
 */
contract FIBFaucet is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20  public immutable fibToken;

    uint256 public dripAmount  = 50 ether;   // 50 FIB (18 decimals)
    uint256 public cooldown    = 24 hours;

    // wallet → timestamp of last successful claim
    mapping(address => uint256) public lastClaimed;

    // total stats
    uint256 public totalClaimed;
    uint256 public totalClaimants;

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────
    event FIBClaimed(address indexed wallet, uint256 amount, uint256 nextClaimAt);
    event DripAmountUpdated(uint256 newAmount);
    event CooldownUpdated(uint256 newCooldown);
    event FaucetFunded(uint256 amount);
    event FaucetDrained(address to, uint256 amount);

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────
    constructor(address _fibToken) {
        require(_fibToken != address(0), "Faucet: zero address");
        fibToken = IERC20(_fibToken);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE,      msg.sender);
    }

    // ─────────────────────────────────────────────
    // CLAIM
    // ─────────────────────────────────────────────

    /**
     * @notice Request 50 FIB. Reverts if called within 24h of last claim.
     * @dev    Cooldown is per wallet address, enforced on-chain.
     */
    function claim() external nonReentrant whenNotPaused {
        address wallet = msg.sender;

        // Check cooldown — hard revert so no gas is wasted on repeat spam
        uint256 nextAllowed = lastClaimed[wallet] + cooldown;
        require(block.timestamp >= nextAllowed, "Faucet: cooldown active");

        // Check faucet has enough FIB
        uint256 balance = fibToken.balanceOf(address(this));
        require(balance >= dripAmount, "Faucet: empty - check back later");

        // Track first-time claimants
        if (lastClaimed[wallet] == 0) {
            totalClaimants++;
        }

        // Update state BEFORE transfer (reentrancy safety)
        lastClaimed[wallet] = block.timestamp;
        totalClaimed += dripAmount;

        // Send FIB
        fibToken.safeTransfer(wallet, dripAmount);

        emit FIBClaimed(wallet, dripAmount, block.timestamp + cooldown);
    }

    // ─────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────

    /**
     * @notice Check claim status for any wallet
     * @return canClaim       True if wallet can claim right now
     * @return secondsLeft    Seconds until next claim (0 if canClaim is true)
     * @return nextClaimAt    Unix timestamp of next allowed claim
     */
    function getClaimStatus(address wallet)
        external view
        returns (bool canClaim, uint256 secondsLeft, uint256 nextClaimAt)
    {
        nextClaimAt = lastClaimed[wallet] + cooldown;
        if (block.timestamp >= nextClaimAt) {
            canClaim    = true;
            secondsLeft = 0;
        } else {
            canClaim    = false;
            secondsLeft = nextClaimAt - block.timestamp;
        }
    }

    /**
     * @notice How many FIB the faucet currently holds
     */
    function faucetBalance() external view returns (uint256) {
        return fibToken.balanceOf(address(this));
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    /// @notice Update drip amount (operator only)
    function setDripAmount(uint256 _amount) external onlyRole(OPERATOR_ROLE) {
        require(_amount > 0, "Faucet: zero amount");
        dripAmount = _amount;
        emit DripAmountUpdated(_amount);
    }

    /// @notice Update cooldown period (operator only)
    function setCooldown(uint256 _cooldown) external onlyRole(OPERATOR_ROLE) {
        require(_cooldown >= 1 hours,  "Faucet: minimum 1 hour");
        require(_cooldown <= 7 days,   "Faucet: maximum 7 days");
        cooldown = _cooldown;
        emit CooldownUpdated(_cooldown);
    }

    /// @notice Emergency drain — recover FIB back to admin wallet
    function drain(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 bal = fibToken.balanceOf(address(this));
        require(bal > 0, "Faucet: nothing to drain");
        fibToken.safeTransfer(to, bal);
        emit FaucetDrained(to, bal);
    }

    function pause()   external onlyRole(OPERATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(OPERATOR_ROLE) { _unpause(); }
}