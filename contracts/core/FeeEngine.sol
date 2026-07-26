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
 *
 * @dev Fee is ALWAYS collected in FIB. No other token accepted.
 *      calculateFeeInFIB() is a placeholder — once PriceOracle.sol
 *      is live it will convert USD-denominated fees into the correct
 *      FIB amount using real market price.
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

    // Protocol fee rate: 20 = 0.20% (in basis points scaled ×10)
    uint256 public feeRateBps = 20; // 0.20%

    uint256 public totalFeesCollected;
    uint256 public totalFeesBurned;
    uint256 public totalFeesToTreasury;
    uint256 public totalFeesToLPs;

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    event FeeCollected(uint256 fibAmount, uint256 toBurn, uint256 toTreasury, uint256 toLPs);
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
    // FEE CALCULATION
    // ─────────────────────────────────────────────

    /**
     * @notice Calculate fee for a given slot amount.
     * @dev Used by SlottingEngine to know how much FIB to pull from user.
     * @param amount  The slot principal (in tokenIn units)
     * @return fee    The fee in the same unit denomination
     */
    function calculateFee(uint256 amount) public view returns (uint256) {
        return (amount * feeRateBps) / 10_000;
    }

    /**
     * @notice Future hook for oracle-based FIB fee conversion.
     * @dev Once PriceOracle.sol is live, replace the body with:
     *
     *      uint256 usdFee = (usdAmount * feeRateBps) / 10_000;
     *      uint256 fibPrice = oracle.getFIBPriceUSD(); // e.g. 1e18 = $1.00
     *      return (usdFee * 1e18) / fibPrice;
     *
     *      For now it mirrors calculateFee() — works correctly only
     *      while all supported tokens are $1 stablecoins.
     * @param amountIn  Principal amount (USD-equivalent for stablecoins)
     * @return fibFee   Fee denominated in FIB tokens
     */
    function calculateFeeInFIB(uint256 amountIn) public view returns (uint256) {
        // TODO: swap this for oracle conversion after PriceOracle.sol is deployed
        return calculateFee(amountIn);
    }

    // ─────────────────────────────────────────────
    // FEE COLLECTION
    // ─────────────────────────────────────────────

    /**
     * @notice Collect and distribute a FIB fee from a completed slot.
     * @dev Called by SlottingEngine after every successful slot.
     *      ONLY accepts FIB — reverts if any other token is passed.
     * @param token      Must be fibToken address
     * @param feeAmount  Total FIB fee to distribute
     */
    function collectAndDistribute(address token, uint256 feeAmount)
        external onlyRole(COLLECTOR_ROLE) nonReentrant
    {
        require(feeAmount > 0,               "FeeEngine: zero fee");
        require(token == address(fibToken),  "FeeEngine: only FIB fees accepted");

        uint256 toBurn     = (feeAmount * burnShare)     / 100;
        uint256 toTreasury = (feeAmount * treasuryShare) / 100;
        uint256 toLPs      = feeAmount - toBurn - toTreasury;

        totalFeesCollected  += feeAmount;
        totalFeesBurned     += toBurn;
        totalFeesToTreasury += toTreasury;
        totalFeesToLPs      += toLPs;

        // 20% — Burn via FIBToken.burnFee()
        if (toBurn > 0) {
            fibToken.burnFee(toBurn);
        }

        // 40% — Treasury
        if (toTreasury > 0) {
            IERC20(address(fibToken)).safeTransfer(treasury, toTreasury);
        }

        // 40% — LPs via LiquidityPool.distributeFee()
        if (toLPs > 0) {
            IERC20(address(fibToken)).forceApprove(address(liquidityPool), toLPs);
            liquidityPool.distributeFee(address(fibToken), toLPs);
        }

        emit FeeCollected(feeAmount, toBurn, toTreasury, toLPs);
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function setFeeRate(uint256 newRateBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRateBps <= 100, "FeeEngine: max 1%");
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