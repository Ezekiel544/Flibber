// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./LiquidityPool.sol";

/**
 * @title PriceOracle
 * @notice Returns USD price of any supported token, normalised to 18 decimals.
 *
 * Three pricing strategies:
 *  1. CHAINLINK  — live Chainlink feed  (ETH, WBTC, BNB)
 *  2. STABLE     — hard-coded $1.00     (USDC, USDT, DAI)
 *  3. POOL_RATIO — USDC reserve / FIB reserve in LiquidityPool (FIB itself)
 */
contract PriceOracle is AccessControl {

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum PriceType { CHAINLINK, STABLE, POOL_RATIO }

    struct TokenConfig {
        PriceType   priceType;
        address     feed;        // Chainlink aggregator (only for CHAINLINK type)
        uint8       feedDecimals;// decimals returned by that feed (usually 8)
        bool        active;
    }

    LiquidityPool public immutable liquidityPool;
    address       public immutable usdcToken;  // reference stable for pool-ratio pricing

    mapping(address => TokenConfig) public tokenConfigs;

    // Staleness threshold — reject Chainlink answers older than this
    uint256 public stalenessThreshold = 1 hours;

    event TokenConfigured(address indexed token, PriceType priceType, address feed);
    event StalenessThresholdUpdated(uint256 newThreshold);

    constructor(address _liquidityPool, address _usdcToken) {
        require(_liquidityPool != address(0), "Oracle: zero pool");
        require(_usdcToken     != address(0), "Oracle: zero usdc");
        liquidityPool = LiquidityPool(_liquidityPool);
        usdcToken     = _usdcToken;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE,      msg.sender);
    }

    // ─────────────────────────────────────────────
    // MAIN ENTRY POINT
    // ─────────────────────────────────────────────

    /**
     * @notice Get USD price of a token, normalised to 18 decimals.
     * @param token  Token address
     * @return price USD price × 1e18  (e.g. ETH=$3000 → 3000 * 1e18)
     */
    function getUSDPrice(address token) external view returns (uint256 price) {
        TokenConfig memory cfg = tokenConfigs[token];
        require(cfg.active, "Oracle: token not configured");

        if (cfg.priceType == PriceType.CHAINLINK) {
            price = _getChainlinkPrice(cfg.feed, cfg.feedDecimals);

        } else if (cfg.priceType == PriceType.STABLE) {
            price = 1e18; // exactly $1.00

        } else {
            // POOL_RATIO: price = USDC in pool / FIB in pool
            // Both normalised to 18 decimals for the division
            uint256 usdcReserve = liquidityPool.getPoolBalance(usdcToken);
            uint256 fibReserve  = liquidityPool.getPoolBalance(token);
            require(fibReserve > 0, "Oracle: empty FIB pool");
            // USDC has 6 decimals, normalise to 18 before dividing
            price = (usdcReserve * 1e30) / fibReserve;
        }
    }

    /**
     * @notice Calculate exact amountOut given amountIn across any two tokens.
     * @dev Used by SlottingEngine to compute how much tokenOut user receives.
     *      amountOut = amountIn * priceIn / priceOut
     *      Both amounts in their native token decimals.
     * @param tokenIn      Address of token being slotted in
     * @param amountIn     Amount of tokenIn (in tokenIn's native decimals)
     * @param tokenInDec   Decimals of tokenIn
     * @param tokenOut     Address of token being slotted out
     * @param tokenOutDec  Decimals of tokenOut
     * @return amountOut   Amount of tokenOut user receives (in tokenOut's native decimals)
     */
    function getAmountOut(
        address tokenIn,
        uint256 amountIn,
        uint8   tokenInDec,
        address tokenOut,
        uint8   tokenOutDec
    ) external view returns (uint256 amountOut) {
        uint256 priceIn  = this.getUSDPrice(tokenIn);
        uint256 priceOut = this.getUSDPrice(tokenOut);
        require(priceOut > 0, "Oracle: zero priceOut");

        // Normalise amountIn to 18 decimals
        uint256 amountIn18 = amountIn * (10 ** (18 - tokenInDec));

        // USD value of input = amountIn18 * priceIn / 1e18
        uint256 usdValue = (amountIn18 * priceIn) / 1e18;

        // Convert USD value to tokenOut amount (18 dec)
        uint256 amountOut18 = (usdValue * 1e18) / priceOut;

        // Convert back to tokenOut native decimals
        amountOut = amountOut18 / (10 ** (18 - tokenOutDec));
    }

    // ─────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────

    function _getChainlinkPrice(address feed, uint8 feedDec)
        internal view returns (uint256)
    {
        AggregatorV3Interface aggregator = AggregatorV3Interface(feed);
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = aggregator.latestRoundData();

        require(answer > 0,                              "Oracle: invalid price");
        require(updatedAt >= block.timestamp - stalenessThreshold, "Oracle: stale price");
        require(answeredInRound >= roundId,              "Oracle: stale round");

        // Normalise to 18 decimals
        // Chainlink feeds return 8 decimals → multiply by 1e10
        return uint256(answer) * (10 ** (18 - feedDec));
    }

    // ─────────────────────────────────────────────
    // ADMIN — configure tokens
    // ─────────────────────────────────────────────

    function addChainlinkToken(
        address token,
        address feed,
        uint8   feedDecimals
    ) external onlyRole(OPERATOR_ROLE) {
        require(token != address(0), "Oracle: zero token");
        require(feed  != address(0), "Oracle: zero feed");
        tokenConfigs[token] = TokenConfig({
            priceType:    PriceType.CHAINLINK,
            feed:         feed,
            feedDecimals: feedDecimals,
            active:       true
        });
        emit TokenConfigured(token, PriceType.CHAINLINK, feed);
    }

    function addStableToken(address token)
        external onlyRole(OPERATOR_ROLE)
    {
        require(token != address(0), "Oracle: zero token");
        tokenConfigs[token] = TokenConfig({
            priceType:    PriceType.STABLE,
            feed:         address(0),
            feedDecimals: 0,
            active:       true
        });
        emit TokenConfigured(token, PriceType.STABLE, address(0));
    }

    function addPoolRatioToken(address token)
        external onlyRole(OPERATOR_ROLE)
    {
        require(token != address(0), "Oracle: zero token");
        tokenConfigs[token] = TokenConfig({
            priceType:    PriceType.POOL_RATIO,
            feed:         address(0),
            feedDecimals: 0,
            active:       true
        });
        emit TokenConfigured(token, PriceType.POOL_RATIO, address(0));
    }

    function deactivateToken(address token)
        external onlyRole(OPERATOR_ROLE)
    {
        tokenConfigs[token].active = false;
    }

    function setStalenessThreshold(uint256 _threshold)
        external onlyRole(OPERATOR_ROLE)
    {
        require(_threshold >= 1 minutes, "Oracle: too low");
        stalenessThreshold = _threshold;
        emit StalenessThresholdUpdated(_threshold);
    }
}