// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./LiquidityPool.sol";
import "./FeeEngine.sol";
import "./PriceOracle.sol";

contract SlottingEngine is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant SOLVER_ROLE   = keccak256("SOLVER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum SlotStatus { PENDING, FILLED, CANCELLED, EXPIRED }

    struct SlotRequest {
        address user;
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        uint256 amountOut;   // calculated on-chain by oracle
        address recipient;
        uint256 feeAmount;   // always in FIB
        SlotStatus status;
        uint256 createdAt;
        uint256 filledAt;
        address filledBy;
        uint32  destChainId;
    }

    LiquidityPool public immutable pool;
    FeeEngine     public immutable feeEngine;
    PriceOracle   public           oracle;   // upgradeable in case of oracle redeploy
    address       public immutable fibToken;

    // Slippage protection — default 1% max slippage
    uint256 public maxSlippageBps = 100;

    uint256 public slotCounter;
    uint256 public slotExpiry = 5 minutes;

    mapping(uint256 => SlotRequest) public slots;
    mapping(address => uint256[])   public userSlots;
    // token → decimals cache
    mapping(address => uint8)       public tokenDecimals;

    event SlotRequested(
        uint256 indexed slotId,
        address indexed user,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        address recipient,
        uint256 fibFee,
        uint32  destChainId
    );
    event SlotFilled(uint256 indexed slotId, address indexed filledBy, uint256 amountOut, uint256 fibFee);
    event SlotCancelled(uint256 indexed slotId);
    event OracleUpdated(address newOracle);

    constructor(
        address _pool,
        address _feeEngine,
        address _fibToken,
        address _oracle
    ) {
        require(_pool      != address(0), "Slot: zero pool");
        require(_feeEngine != address(0), "Slot: zero feeEngine");
        require(_fibToken  != address(0), "Slot: zero fibToken");
        require(_oracle    != address(0), "Slot: zero oracle");

        pool      = LiquidityPool(_pool);
        feeEngine = FeeEngine(_feeEngine);
        fibToken  = _fibToken;
        oracle    = PriceOracle(_oracle);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE,      msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // REGISTER TOKEN DECIMALS
    // Must be called for each supported token before it can be slotted
    // ─────────────────────────────────────────────────────────────
    function setTokenDecimals(address token, uint8 decimals)
        external onlyRole(OPERATOR_ROLE)
    {
        tokenDecimals[token] = decimals;
    }

    // ─────────────────────────────────────────────────────────────
    // QUOTE — read-only, call from frontend to show user amountOut
    // ─────────────────────────────────────────────────────────────
    function quoteSlot(
        address tokenIn,
        uint256 amountIn,
        address tokenOut
    ) external view returns (uint256 amountOut, uint256 fibFee) {
        uint8 decIn  = tokenDecimals[tokenIn];
        uint8 decOut = tokenDecimals[tokenOut];
        amountOut = oracle.getAmountOut(tokenIn, amountIn, decIn, tokenOut, decOut);
        fibFee    = feeEngine.calculateFee(amountIn);
    }

    // ─────────────────────────────────────────────────────────────
    // REQUEST SLOT
    // amountOut is now calculated ON-CHAIN — user supplies minAmountOut
    // for slippage protection only
    // ─────────────────────────────────────────────────────────────
    function requestSlot(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 minAmountOut, // slippage protection — revert if oracle gives less
        address recipient,
        uint32  destChainId
    ) external nonReentrant whenNotPaused returns (uint256 slotId) {
        require(amountIn     > 0,           "Slot: zero amountIn");
        require(minAmountOut > 0,           "Slot: zero minAmountOut");
        require(recipient    != address(0), "Slot: zero recipient");
        require(tokenIn      != tokenOut,   "Slot: same token");

        // Calculate exact amountOut on-chain using oracle
        uint8  decIn  = tokenDecimals[tokenIn];
        uint8  decOut = tokenDecimals[tokenOut];
        uint256 amountOut = oracle.getAmountOut(tokenIn, amountIn, decIn, tokenOut, decOut);

        // Slippage check — protect user from price movement between quote and tx
        require(amountOut >= minAmountOut, "Slot: slippage too high");

        // Calculate FIB fee
        uint256 fibFee = feeEngine.calculateFee(amountIn);
        require(fibFee > 0, "Slot: zero fee");

        // Pull FIB fee from user
        IERC20(fibToken).safeTransferFrom(msg.sender, address(this), fibFee);

        // Pull full tokenIn principal from user
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        slotId = ++slotCounter;
        slots[slotId] = SlotRequest({
            user:        msg.sender,
            tokenIn:     tokenIn,
            amountIn:    amountIn,
            tokenOut:    tokenOut,
            amountOut:   amountOut,
            recipient:   recipient,
            feeAmount:   fibFee,
            status:      SlotStatus.PENDING,
            createdAt:   block.timestamp,
            filledAt:    0,
            filledBy:    address(0),
            destChainId: destChainId
        });

        userSlots[msg.sender].push(slotId);
        emit SlotRequested(slotId, msg.sender, tokenIn, amountIn, tokenOut, amountOut, recipient, fibFee, destChainId);

        if (destChainId == 0) {
            _tryPoolFill(slotId);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CANCEL
    // ─────────────────────────────────────────────────────────────
    function cancelSlot(uint256 slotId) external nonReentrant {
        SlotRequest storage s = slots[slotId];
        require(s.user   == msg.sender,         "Slot: not owner");
        require(s.status == SlotStatus.PENDING,  "Slot: not pending");

        s.status = SlotStatus.CANCELLED;
        IERC20(s.tokenIn).safeTransfer(msg.sender, s.amountIn);
        if (s.feeAmount > 0) {
            IERC20(fibToken).safeTransfer(msg.sender, s.feeAmount);
        }
        emit SlotCancelled(slotId);
    }

    // ─────────────────────────────────────────────────────────────
    // SOLVER FILL
    // ─────────────────────────────────────────────────────────────
    function solverFillSlot(uint256 slotId)
        external onlyRole(SOLVER_ROLE) nonReentrant whenNotPaused
    {
        SlotRequest storage s = slots[slotId];
        require(s.status == SlotStatus.PENDING,              "Slot: not pending");
        require(block.timestamp <= s.createdAt + slotExpiry, "Slot: expired");

        s.status   = SlotStatus.FILLED;
        s.filledAt = block.timestamp;
        s.filledBy = msg.sender;

        IERC20(s.tokenOut).safeTransferFrom(msg.sender, s.recipient, s.amountOut);
        IERC20(s.tokenIn).safeTransfer(address(pool), s.amountIn);
        pool.reimburseSlot(s.tokenIn, s.amountIn);

        if (s.feeAmount > 0) {
            IERC20(fibToken).safeTransfer(address(feeEngine), s.feeAmount);
            feeEngine.collectAndDistribute(fibToken, s.feeAmount);
        }

        emit SlotFilled(slotId, msg.sender, s.amountOut, s.feeAmount);
    }

    // ─────────────────────────────────────────────────────────────
    // POOL FILL
    // ─────────────────────────────────────────────────────────────
    function _tryPoolFill(uint256 slotId) internal {
        SlotRequest storage s = slots[slotId];

        uint256 poolBalance = pool.getPoolBalance(s.tokenOut);
        if (poolBalance < s.amountOut) return;

        s.status   = SlotStatus.FILLED;
        s.filledAt = block.timestamp;
        s.filledBy = address(0);

        pool.fulfillSlot(s.tokenOut, s.amountOut, s.recipient);
        IERC20(s.tokenIn).safeTransfer(address(pool), s.amountIn);
        pool.reimburseSlot(s.tokenIn, s.amountIn);

        if (s.feeAmount > 0) {
            IERC20(fibToken).safeTransfer(address(feeEngine), s.feeAmount);
            feeEngine.collectAndDistribute(fibToken, s.feeAmount);
        }

        emit SlotFilled(slotId, address(0), s.amountOut, s.feeAmount);
    }

    // ─────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────
    function getSlot(uint256 slotId) external view returns (SlotRequest memory) {
        return slots[slotId];
    }

    function getUserSlots(address user) external view returns (uint256[] memory) {
        return userSlots[user];
    }

    function isSlotFillable(uint256 slotId) external view returns (bool) {
        SlotRequest storage s = slots[slotId];
        if (s.status != SlotStatus.PENDING)                return false;
        if (block.timestamp > s.createdAt + slotExpiry)   return false;
        if (pool.getPoolBalance(s.tokenOut) < s.amountOut) return false;
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────────────
    function setOracle(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_oracle != address(0), "Slot: zero oracle");
        oracle = PriceOracle(_oracle);
        emit OracleUpdated(_oracle);
    }

    function setMaxSlippage(uint256 _bps) external onlyRole(OPERATOR_ROLE) {
        require(_bps <= 500, "Slot: max 5%");
        maxSlippageBps = _bps;
    }

    function setSlotExpiry(uint256 _expiry) external onlyRole(OPERATOR_ROLE) {
        require(_expiry >= 1 minutes && _expiry <= 1 hours, "Slot: invalid expiry");
        slotExpiry = _expiry;
    }

    function pause()   external onlyRole(OPERATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(OPERATOR_ROLE) { _unpause(); }
}