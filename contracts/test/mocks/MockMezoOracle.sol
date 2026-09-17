// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMezoPriceOracle} from "../../src/interfaces/IMezoPriceOracle.sol";

/// @notice Stand-in for Mezo's 0x7b7c..0015 precompile: 18 decimals, latest round only.
contract MockMezoOracle is IMezoPriceOracle {
    int256 public answer;
    uint256 public updatedAt;
    uint80 public round;

    function decimals() external pure returns (uint8) {
        return 18;
    }

    /// @param usd whole-dollar price
    function set(uint256 usd, uint256 timestamp) external {
        answer = int256(usd * 1e18);
        updatedAt = timestamp;
        round++;
    }

    function setRaw(int256 answer_, uint256 timestamp) external {
        answer = answer_;
        updatedAt = timestamp;
        round++;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (round, answer, updatedAt, updatedAt, 0);
    }
}
