// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FIBPaymaster
 * @notice ERC-4337 Paymaster — Users pay gas in $FIB on any chain
 * @dev Intercepts transactions, accepts $FIB from user, pays native gas.
 *      Deployed on every supported chain. Makes $FIB the universal gas token.
 *
 *      Flow:
 *      1. User submits UserOperation with FIB payment
 *      2. Bundler calls validatePaymasterUserOp
 *      3. Paymaster checks FIB allowance/balance
 *      4. Paymaster pays ETH gas to bundler
 *      5. Paymaster deducts FIB from user
 *
 *      This is a simplified Paymaster for testnet.
 *      Production version integrates with ERC-4337 EntryPoint fully.
 */
contract FIBPaymaster is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable fibToken;
    address public           entryPoint;

    // FIB per ETH exchange rate (set by oracle/admin)
    // e.g. 1 ETH = 5000 FIB → rate = 5000 * 1e18
    uint256 public fibPerEth;

    // Max gas FIB can cover per transaction
    uint256 public maxGasInFib = 10 * 1e18; // 10 FIB max per tx

    uint256 public totalGasPaidInFib;
    uint256 public totalTransactionsSponsored;

    mapping(address => bool) public whitelisted; // whitelisted contracts

    event GasPaidInFib(address indexed user, uint256 fibAmount, uint256 ethAmount);
    event RateUpdated(uint256 newRate);
    event EntryPointUpdated(address newEntryPoint);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);

    constructor(
        address _fibToken,
        address _entryPoint,
        uint256 _fibPerEth
    ) Ownable(msg.sender) {
        require(_fibToken   != address(0), "Paymaster: zero fibToken");
        require(_entryPoint != address(0), "Paymaster: zero entryPoint");
        require(_fibPerEth  > 0,           "Paymaster: zero rate");

        fibToken   = IERC20(_fibToken);
        entryPoint = _entryPoint;
        fibPerEth  = _fibPerEth;
    }

    // ─────────────────────────────────────────────
    // CORE — Pay gas in FIB
    // ─────────────────────────────────────────────

    /**
     * @notice Pay gas for a user using their $FIB balance
     * @param user      The user whose FIB to deduct
     * @param gasAmount ETH gas amount to cover
     */
    function payGasInFib(address user, uint256 gasAmount)
        external nonReentrant returns (uint256 fibCharged)
    {
        require(msg.sender == entryPoint, "Paymaster: only entryPoint");
        require(gasAmount  > 0,           "Paymaster: zero gas");

        fibCharged = ethToFib(gasAmount);
        require(fibCharged <= maxGasInFib, "Paymaster: exceeds max gas");
        require(
            fibToken.balanceOf(user) >= fibCharged,
            "Paymaster: insufficient FIB"
        );

        // Deduct FIB from user
        fibToken.safeTransferFrom(user, address(this), fibCharged);

        totalGasPaidInFib           += fibCharged;
        totalTransactionsSponsored  += 1;

        emit GasPaidInFib(user, fibCharged, gasAmount);
    }

    /**
     * @notice Estimate FIB cost for a given ETH gas amount
     * @param ethAmount ETH gas amount
     * @return FIB equivalent
     */
    function ethToFib(uint256 ethAmount) public view returns (uint256) {
        return (ethAmount * fibPerEth) / 1e18;
    }

    /**
     * @notice Estimate ETH cost for a given FIB amount
     * @param fibAmount FIB amount
     * @return ETH equivalent
     */
    function fibToEth(uint256 fibAmount) public view returns (uint256) {
        return (fibAmount * 1e18) / fibPerEth;
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function updateRate(uint256 _fibPerEth) external onlyOwner {
        require(_fibPerEth > 0, "Paymaster: zero rate");
        fibPerEth = _fibPerEth;
        emit RateUpdated(_fibPerEth);
    }

    function updateEntryPoint(address _entryPoint) external onlyOwner {
        require(_entryPoint != address(0), "Paymaster: zero address");
        entryPoint = _entryPoint;
        emit EntryPointUpdated(_entryPoint);
    }

    function setMaxGas(uint256 _maxGasInFib) external onlyOwner {
        maxGasInFib = _maxGasInFib;
    }

    // Deposit ETH to fund gas payments
    function deposit() external payable onlyOwner {
        emit Deposited(msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Paymaster: insufficient ETH");
        payable(owner()).transfer(amount);
        emit Withdrawn(amount);
    }

    // Withdraw collected FIB
    function withdrawFib(uint256 amount) external onlyOwner {
        fibToken.safeTransfer(owner(), amount);
    }

    receive() external payable {}
}
