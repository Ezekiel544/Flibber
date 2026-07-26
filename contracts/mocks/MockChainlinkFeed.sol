// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockChainlinkFeed
 * @notice Returns a fixed price for testnet tokens that don't have
 *         real Chainlink feeds on Base Sepolia.
 *         Format: same as Chainlink AggregatorV3Interface
 *         Price is in USD with 8 decimals (e.g. $150.00 = 15000000000)
 */
contract MockChainlinkFeed {
    int256  public price;
    uint8   public decimals = 8;
    string  public description;
    uint256 public updatedAt;

    constructor(int256 _price, string memory _description) {
        price       = _price;
        description = _description;
        updatedAt   = block.timestamp;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt_,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }

    // Admin can update price for testing
    function setPrice(int256 _price) external {
        price     = _price;
        updatedAt = block.timestamp;
    }
}