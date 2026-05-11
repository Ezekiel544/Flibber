// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../token/FIBToken.sol";
import "./LiquidityPool.sol";

/**
 * @title FeeEngine
 * @notice Collects protocol fees and distributes them:
 *         40% → LP stakers (via LiquidityPool.distributeFee)
 *         40% → Treasury
 *         20% → Burned (via FIBToken.burnFee)
 */
contract FeeEngine is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────

    FIBToken      public immutable fibToken;
    LiquidityPool public immutable liquidityPool;
    address       public           treasury;

    // Fee split basis points (out of 100)
    uint256 public lpShare       = 40; // 40% to LPs
    uint256 public treasuryShare = 40; // 40% to treasury
    uint256 public burnShare     = 20; // 20% burned

    // Protocol fee rate: 20 = 0.20% (basis points * 10)
    uint256 public feeRateBps = 20; // 0.20%

    uint256 public totalFeesCollected;
    uint256 public totalFeesBurned;
    uint256 public totalFeesToTreasury;
    uint256 public totalFeesToLPs;

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    event FeeCollected(address indexed token, uint256 totalFee, uint256 toBurn, uint256 toTreasury, uint256 toLPs);
    event FeeRateUpdated(uint256 newRateBps);
    event FeeSplitUpdated(uint256 lpShare, uint256 treasuryShare, uint256 burnShare);
    event TreasuryUpdated(address newTreasury);

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────

    constructor(
        address _fibToken,
        address _liquidityPool,
        address _treasury
    ) {
        require(_fibToken      != address(0), "FeeEngine: zero fibToken");
        require(_liquidityPool != address(0), "FeeEngine: zero pool");
        require(_treasury      != address(0), "FeeEngine: zero treasury");

        fibToken      = FIBToken(_fibToken);
        liquidityPool = LiquidityPool(_liquidityPool);
        treasury      = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(COLLECTOR_ROLE,     msg.sender);
    }

    // ─────────────────────────────────────────────
    // FEE COLLECTION
    // ─────────────────────────────────────────────

    /**
     * @notice Calculate fee for a given slot amount
     * @param amount The slot principal amount
     * @return fee   The fee in the same token denomination
     */
    function calculateFee(uint256 amount) public view returns (uint256) {
        return (amount * feeRateBps) / 10_000;
    }

    /**
     * @notice Collect and distribute fee from a completed slot
     * @dev Called by SlottingEngine after every successful slot
     * @param token      The asset the fee is denominated in
     * @param feeAmount  Total fee to distribute
     */
    function collectAndDistribute(address token, uint256 feeAmount)
        external onlyRole(COLLECTOR_ROLE) nonReentrant
    {
        require(feeAmount > 0, "FeeEngine: zero fee");

        uint256 toBurn     = (feeAmount * burnShare)     / 100;
        uint256 toTreasury = (feeAmount * treasuryShare) / 100;
        uint256 toLPs      = feeAmount - toBurn - toTreasury;

        totalFeesCollected  += feeAmount;
        totalFeesBurned     += toBurn;
        totalFeesToTreasury += toTreasury;
        totalFeesToLPs      += toLPs;

        // 20% — Burn (only works if fee token is FIB)
        if (token == address(fibToken) && toBurn > 0) {
            fibToken.burnFee(toBurn);
        } else if (toBurn > 0) {
            // If fee is in another token, send burn portion to dead address
            IERC20(token).safeTransfer(address(0x000000000000000000000000000000000000dEaD), toBurn);
        }

        // 40% — Treasury
        if (toTreasury > 0) {
            IERC20(token).safeTransfer(treasury, toTreasury);
        }

        // 40% — LPs via LiquidityPool
        if (toLPs > 0) {
            IERC20(token).safeApprove(address(liquidityPool), toLPs);
            liquidityPool.distributeFee(token, toLPs);
        }

        emit FeeCollected(token, feeAmount, toBurn, toTreasury, toLPs);
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function setFeeRate(uint256 newRateBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRateBps <= 100, "FeeEngine: max 1%"); // max 1% fee
        feeRateBps = newRateBps;
        emit FeeRateUpdated(newRateBps);
    }

    function setFeeSplit(uint256 _lp, uint256 _treasury, uint256 _burn)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_lp + _treasury + _burn == 100, "FeeEngine: must sum to 100");
        lpShare       = _lp;
        treasuryShare = _treasury;
        burnShare     = _burn;
        emit FeeSplitUpdated(_lp, _treasury, _burn);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "FeeEngine: zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
}
