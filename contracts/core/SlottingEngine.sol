// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./LiquidityPool.sol";
import "./FeeEngine.sol";

/**
 * @title SlottingEngine
 * @notice The core FLIBBER primitive — instant cross-asset / cross-chain matching
 *
 * HOW A SLOT WORKS:
 *  1. User calls requestSlot(tokenIn, amountIn, tokenOut, recipient)
 *  2. SlottingEngine takes tokenIn from user
 *  3. Checks pool has enough tokenOut
 *  4. Calculates fee (paid in tokenIn or FIB)
 *  5. Fulfills slot: sends tokenOut to recipient immediately
 *  6. Reimburses pool with tokenIn (minus fee)
 *  7. FeeEngine distributes fee: 40% LPs / 40% treasury / 20% burned
 *
 * SOLVER FLOW (off-chain solvers can also fill slots):
 *  1. Solver calls solverFillSlot(slotId, ...) to fill a pending slot
 *  2. Solver earns solver reward from fee
 *  3. Faster solvers win — competitive filling
 *
 * VALUE PRESERVATION:
 *  Principal is never touched. Fee is charged SEPARATELY in $FIB.
 *  If user pays fee in $FIB → receives 100% of tokenOut amount.
 */
contract SlottingEngine is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant SOLVER_ROLE     = keccak256("SOLVER_ROLE");
    bytes32 public constant OPERATOR_ROLE   = keccak256("OPERATOR_ROLE");

    // ─────────────────────────────────────────────
    // STRUCTS
    // ─────────────────────────────────────────────

    enum SlotStatus { PENDING, FILLED, CANCELLED, EXPIRED }

    struct SlotRequest {
        address user;
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        uint256 amountOut;   // expected out (set at request time)
        address recipient;
        uint256 feeAmount;   // fee in FIB or tokenIn
        address feeToken;
        SlotStatus status;
        uint256 createdAt;
        uint256 filledAt;
        address filledBy;    // address(0) = pool, else solver address
        uint32  destChainId; // 0 = same chain, >0 = cross-chain via LayerZero
    }

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────

    LiquidityPool public immutable pool;
    FeeEngine     public immutable feeEngine;
    address       public immutable fibToken;

    uint256 public slotCounter;
    uint256 public slotExpiry = 5 minutes;

    mapping(uint256 => SlotRequest) public slots;
    mapping(address => uint256[])   public userSlots;

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    event SlotRequested(
        uint256 indexed slotId,
        address indexed user,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        address recipient,
        uint32  destChainId
    );
    event SlotFilled(
        uint256 indexed slotId,
        address indexed filledBy,
        uint256 amountOut,
        uint256 fee
    );
    event SlotCancelled(uint256 indexed slotId);
    event SlotExpired(uint256 indexed slotId);

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────

    constructor(
        address _pool,
        address _feeEngine,
        address _fibToken
    ) {
        require(_pool       != address(0), "Slot: zero pool");
        require(_feeEngine  != address(0), "Slot: zero feeEngine");
        require(_fibToken   != address(0), "Slot: zero fibToken");

        pool      = LiquidityPool(_pool);
        feeEngine = FeeEngine(_feeEngine);
        fibToken  = _fibToken;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE,      msg.sender);
    }

    // ─────────────────────────────────────────────
    // USER ACTIONS
    // ─────────────────────────────────────────────

    /**
     * @notice Request a slot — deposit tokenIn, receive tokenOut
     * @param tokenIn     Asset user is depositing
     * @param amountIn    Amount of tokenIn
     * @param tokenOut    Asset user wants to receive
     * @param amountOut   Minimum amount of tokenOut expected
     * @param recipient   Who receives tokenOut (can be different address/chain)
     * @param payFeeInFIB If true, fee charged in $FIB (preserves 100% principal)
     * @param destChainId Destination chain (0 = same chain)
     * @return slotId     The unique slot identifier
     */
    function requestSlot(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        address recipient,
        bool    payFeeInFIB,
        uint32  destChainId
    ) external nonReentrant whenNotPaused returns (uint256 slotId) {
        require(amountIn  > 0,            "Slot: zero amountIn");
        require(amountOut > 0,            "Slot: zero amountOut");
        require(recipient != address(0),  "Slot: zero recipient");
        require(tokenIn   != tokenOut,    "Slot: same token");

        uint256 fee;
        address feeToken;

        if (payFeeInFIB) {
            // Fee paid in FIB — principal fully preserved
            fee      = feeEngine.calculateFee(amountIn);
            feeToken = fibToken;
            IERC20(fibToken).safeTransferFrom(msg.sender, address(feeEngine), fee);
        } else {
            // Fee deducted from principal
            fee      = feeEngine.calculateFee(amountIn);
            feeToken = tokenIn;
        }

        // Pull tokenIn from user
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        slotId = ++slotCounter;

        slots[slotId] = SlotRequest({
            user:        msg.sender,
            tokenIn:     tokenIn,
            amountIn:    amountIn,
            tokenOut:    tokenOut,
            amountOut:   amountOut,
            recipient:   recipient,
            feeAmount:   fee,
            feeToken:    feeToken,
            status:      SlotStatus.PENDING,
            createdAt:   block.timestamp,
            filledAt:    0,
            filledBy:    address(0),
            destChainId: destChainId
        });

        userSlots[msg.sender].push(slotId);

        emit SlotRequested(slotId, msg.sender, tokenIn, amountIn, tokenOut, amountOut, recipient, destChainId);

        // Attempt immediate pool fill (same chain)
        if (destChainId == 0) {
            _tryPoolFill(slotId);
        }
    }

    /**
     * @notice Cancel a pending slot and get tokenIn refunded
     * @param slotId The slot to cancel
     */
    function cancelSlot(uint256 slotId) external nonReentrant {
        SlotRequest storage s = slots[slotId];
        require(s.user   == msg.sender,        "Slot: not owner");
        require(s.status == SlotStatus.PENDING, "Slot: not pending");

        s.status = SlotStatus.CANCELLED;

        // Refund tokenIn (minus fee if fee was in tokenIn)
        uint256 refund = s.amountIn;
        if (s.feeToken == s.tokenIn) refund -= s.feeAmount;

        IERC20(s.tokenIn).safeTransfer(msg.sender, refund);
        emit SlotCancelled(slotId);
    }

    // ─────────────────────────────────────────────
    // SOLVER INTERFACE
    // ─────────────────────────────────────────────

    /**
     * @notice Solver fills a pending slot directly (competitive filling)
     * @dev Solver fronts tokenOut, earns solver reward from fee
     * @param slotId The slot to fill
     */
    function solverFillSlot(uint256 slotId)
        external onlyRole(SOLVER_ROLE) nonReentrant whenNotPaused
    {
        SlotRequest storage s = slots[slotId];
        require(s.status    == SlotStatus.PENDING,              "Slot: not pending");
        require(block.timestamp <= s.createdAt + slotExpiry,    "Slot: expired");

        s.status   = SlotStatus.FILLED;
        s.filledAt = block.timestamp;
        s.filledBy = msg.sender;

        // Solver sends tokenOut to recipient
        IERC20(s.tokenOut).safeTransferFrom(msg.sender, s.recipient, s.amountOut);

        // Engine sends tokenIn to pool (reimbursing solver via pool mechanism)
        uint256 principalToPool = s.feeToken == s.tokenIn
            ? s.amountIn - s.feeAmount
            : s.amountIn;

        IERC20(s.tokenIn).safeApprove(address(pool), principalToPool);
        pool.reimburseSlot(s.tokenIn, principalToPool);

        // Distribute fee
        _distributeFee(s.feeToken, s.feeAmount);

        emit SlotFilled(slotId, msg.sender, s.amountOut, s.feeAmount);
    }

    // ─────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────

    function _tryPoolFill(uint256 slotId) internal {
        SlotRequest storage s = slots[slotId];

        uint256 poolBalance = pool.getPoolBalance(s.tokenOut);
        if (poolBalance < s.amountOut) return; // pool insufficient — stays PENDING for solver

        s.status   = SlotStatus.FILLED;
        s.filledAt = block.timestamp;
        s.filledBy = address(0); // filled by pool

        // Fulfill: send tokenOut to recipient
        pool.fulfillSlot(s.tokenOut, s.amountOut, s.recipient);

        // Reimburse pool with tokenIn
        uint256 principalToPool = s.feeToken == s.tokenIn
            ? s.amountIn - s.feeAmount
            : s.amountIn;

        IERC20(s.tokenIn).safeApprove(address(pool), principalToPool);
        pool.reimburseSlot(s.tokenIn, principalToPool);

        // Distribute fee
        _distributeFee(s.feeToken, s.feeAmount);

        emit SlotFilled(slotId, address(0), s.amountOut, s.feeAmount);
    }

    function _distributeFee(address feeToken, uint256 feeAmount) internal {
        if (feeAmount == 0) return;
        IERC20(feeToken).safeApprove(address(feeEngine), feeAmount);
        feeEngine.collectAndDistribute(feeToken, feeAmount);
    }

    // ─────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────

    function getSlot(uint256 slotId) external view returns (SlotRequest memory) {
        return slots[slotId];
    }

    function getUserSlots(address user) external view returns (uint256[] memory) {
        return userSlots[user];
    }

    function isSlotFillable(uint256 slotId) external view returns (bool) {
        SlotRequest storage s = slots[slotId];
        if (s.status != SlotStatus.PENDING)                    return false;
        if (block.timestamp > s.createdAt + slotExpiry)        return false;
        if (pool.getPoolBalance(s.tokenOut) < s.amountOut)     return false;
        return true;
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function setSlotExpiry(uint256 _expiry) external onlyRole(OPERATOR_ROLE) {
        require(_expiry >= 1 minutes && _expiry <= 1 hours, "Slot: invalid expiry");
        slotExpiry = _expiry;
    }

    function pause()   external onlyRole(OPERATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(OPERATOR_ROLE) { _unpause(); }
}
