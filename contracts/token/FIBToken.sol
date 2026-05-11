// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FIBToken
 * @notice $FIB — Native token of the FLIBBER protocol
 * @dev Hard capped at 1,000,000,000 tokens. Non-inflationary.
 *      Uses: gas payments, protocol fees, staking yield, governance voting.
 *      20% of all collected fees are burned — deflationary over time.
 */
contract FIBToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl, ReentrancyGuard {

    bytes32 public constant MINTER_ROLE     = keccak256("MINTER_ROLE");
    bytes32 public constant FEE_BURNER_ROLE = keccak256("FEE_BURNER_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 Billion — hard cap

    uint256 public totalBurned;
    uint256 public totalFeesCollected;

    event FeeBurned(uint256 amount, uint256 totalBurned);
    event TokensMinted(address indexed to, uint256 amount);

    constructor(address treasury)
        ERC20("FLIBBER Token", "FIB")
        ERC20Permit("FLIBBER Token")
    {
        require(treasury != address(0), "FIB: zero treasury");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE,        msg.sender);
        _grantRole(FEE_BURNER_ROLE,    msg.sender);

        // Mint full supply to treasury; vesting contracts handle distribution
        _mint(treasury, MAX_SUPPLY);
        emit TokensMinted(treasury, MAX_SUPPLY);
    }

    /// @notice Burn FIB as part of fee distribution (20% burn rate)
    /// @dev Only callable by FeeEngine (FEE_BURNER_ROLE)
    function burnFee(uint256 amount) external onlyRole(FEE_BURNER_ROLE) nonReentrant {
        require(amount > 0, "FIB: zero amount");
        _burn(msg.sender, amount);
        totalBurned        += amount;
        totalFeesCollected += amount;
        emit FeeBurned(amount, totalBurned);
    }

    function circulatingSupply() external view returns (uint256) { return totalSupply(); }
    function getTotalBurned()    external view returns (uint256) { return totalBurned; }

    function supportsInterface(bytes4 interfaceId)
        public view override(AccessControl) returns (bool)
    { return super.supportsInterface(interfaceId); }
}
