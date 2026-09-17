// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Local-dev stand-in for Mezo's oracle precompile: always reports a print at the current
///         block time, like the real precompile does. Etch at 0x7b7c..0015 on an anvil fork.
contract LiveMockOracle {
    int256 public answer = 76_000e18;

    function set(int256 answer_) external {
        answer = answer_;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (uint80(block.number), answer, block.timestamp, block.timestamp, 0);
    }
}
