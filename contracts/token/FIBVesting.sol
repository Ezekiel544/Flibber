// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FIBVesting
 * @notice Handles all $FIB token vesting schedules per allocation category
 *
 * Schedules:
 *  TEAM          12mo cliff + 36mo linear
 *  ADVISOR_KOL   10% TGE + 3mo cliff + 9mo linear
 *  TREASURY      6mo cliff + 36mo linear
 *  ECOSYSTEM     60% TGE + 40% over 12mo
 *  VC_PRIVATE    0% TGE + 6mo cliff + 18mo linear
 *  LAUNCHPAD     100% TGE
 *  LIQUIDITY     80% TGE + 20% over 6mo linear
 */
contract FIBVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable fibToken;

    enum VestingCategory {
        TEAM,
        ADVISOR_KOL,
        TREASURY,
        ECOSYSTEM,
        VC_PRIVATE,
        LAUNCHPAD,
        LIQUIDITY
    }

    struct VestingSchedule {
        address beneficiary;
        VestingCategory category;
        uint256 totalAmount;
        uint256 tgeAmount;       // unlocked at TGE
        uint256 cliffDuration;   // seconds
        uint256 vestingDuration; // seconds after cliff
        uint256 startTime;       // TGE timestamp
        uint256 released;
        bool initialized;
    }

    mapping(bytes32 => VestingSchedule) public schedules;
    mapping(address => bytes32[]) public beneficiarySchedules;

    uint256 public tgeTimestamp;
    bool    public tgeStarted;

    event TGEStarted(uint256 timestamp);
    event VestingScheduleCreated(bytes32 indexed scheduleId, address indexed beneficiary, VestingCategory category, uint256 amount);
    event TokensReleased(bytes32 indexed scheduleId, address indexed beneficiary, uint256 amount);

    constructor(address _fibToken) Ownable(msg.sender) {
        require(_fibToken != address(0), "Vesting: zero token");
        fibToken = IERC20(_fibToken);
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function startTGE() external onlyOwner {
        require(!tgeStarted, "Vesting: TGE already started");
        tgeStarted    = true;
        tgeTimestamp  = block.timestamp;
        emit TGEStarted(tgeTimestamp);
    }

    function createSchedule(
        address beneficiary,
        VestingCategory category,
        uint256 totalAmount
    ) external onlyOwner returns (bytes32 scheduleId) {
        require(beneficiary != address(0), "Vesting: zero beneficiary");
        require(totalAmount  > 0,          "Vesting: zero amount");
        require(tgeStarted,                "Vesting: TGE not started");

        scheduleId = keccak256(abi.encodePacked(beneficiary, category, block.timestamp));
        require(!schedules[scheduleId].initialized, "Vesting: schedule exists");

        (uint256 tgePct, uint256 cliff, uint256 duration) = _getParams(category);

        uint256 tgeAmt = (totalAmount * tgePct) / 100;

        schedules[scheduleId] = VestingSchedule({
            beneficiary:     beneficiary,
            category:        category,
            totalAmount:     totalAmount,
            tgeAmount:       tgeAmt,
            cliffDuration:   cliff,
            vestingDuration: duration,
            startTime:       tgeTimestamp,
            released:        0,
            initialized:     true
        });

        beneficiarySchedules[beneficiary].push(scheduleId);
        fibToken.safeTransferFrom(msg.sender, address(this), totalAmount);

        emit VestingScheduleCreated(scheduleId, beneficiary, category, totalAmount);
    }

    // ─────────────────────────────────────────────
    // RELEASE
    // ─────────────────────────────────────────────

    function release(bytes32 scheduleId) external nonReentrant {
        VestingSchedule storage s = schedules[scheduleId];
        require(s.initialized,                    "Vesting: not found");
        require(s.beneficiary == msg.sender,      "Vesting: not beneficiary");

        uint256 releasable = _releasableAmount(s);
        require(releasable > 0, "Vesting: nothing to release");

        s.released += releasable;
        fibToken.safeTransfer(s.beneficiary, releasable);
        emit TokensReleased(scheduleId, s.beneficiary, releasable);
    }

    // ─────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────

    function releasableAmount(bytes32 scheduleId) external view returns (uint256) {
        return _releasableAmount(schedules[scheduleId]);
    }

    function getSchedule(bytes32 scheduleId) external view returns (VestingSchedule memory) {
        return schedules[scheduleId];
    }

    function getBeneficiarySchedules(address beneficiary) external view returns (bytes32[] memory) {
        return beneficiarySchedules[beneficiary];
    }

    // ─────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────

    function _releasableAmount(VestingSchedule storage s) internal view returns (uint256) {
        if (!s.initialized) return 0;
        uint256 vested = _vestedAmount(s);
        return vested - s.released;
    }

    function _vestedAmount(VestingSchedule storage s) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - s.startTime;

        // TGE unlock always available immediately
        uint256 vested = s.tgeAmount;

        uint256 cliffEnd = s.cliffDuration;

        if (elapsed < cliffEnd) {
            return vested; // only TGE portion available
        }

        uint256 remaining = s.totalAmount - s.tgeAmount;

        if (s.vestingDuration == 0) {
            return s.totalAmount; // fully unlocked (launchpad)
        }

        uint256 vestingElapsed = elapsed - cliffEnd;
        if (vestingElapsed >= s.vestingDuration) {
            return s.totalAmount; // fully vested
        }

        vested += (remaining * vestingElapsed) / s.vestingDuration;
        return vested;
    }

    /// @dev Returns (tgePct, cliffSeconds, vestingSeconds) per category
    function _getParams(VestingCategory cat)
        internal pure returns (uint256 tgePct, uint256 cliff, uint256 duration)
    {
        if (cat == VestingCategory.TEAM) {
            return (0,  365 days, 1095 days); // 0% TGE, 12mo cliff, 36mo linear
        }
        if (cat == VestingCategory.ADVISOR_KOL) {
            return (10, 90 days,  270 days);  // 10% TGE, 3mo cliff, 9mo linear
        }
        if (cat == VestingCategory.TREASURY) {
            return (0,  180 days, 1095 days); // 0% TGE, 6mo cliff, 36mo linear
        }
        if (cat == VestingCategory.ECOSYSTEM) {
            return (60, 0,        365 days);  // 60% TGE, no cliff, 12mo linear
        }
        if (cat == VestingCategory.VC_PRIVATE) {
            return (0,  180 days, 540 days);  // 0% TGE, 6mo cliff, 18mo linear
        }
        if (cat == VestingCategory.LAUNCHPAD) {
            return (100, 0,       0);         // 100% TGE immediately
        }
        if (cat == VestingCategory.LIQUIDITY) {
            return (80, 0,        180 days);  // 80% TGE, no cliff, 6mo linear
        }
        revert("Vesting: unknown category");
    }
}
