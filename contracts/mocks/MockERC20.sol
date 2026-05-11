// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockERC20 — For testnet and testing only
contract MockERC20 is ERC20, Ownable {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_)
        ERC20(name, symbol)
        Ownable(msg.sender)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) { return _decimals; }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Testnet faucet — anyone can claim 1000 tokens
    function faucet() external {
        _mint(msg.sender, 1000 * 10**_decimals);
    }
}
