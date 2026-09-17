// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Mezo's native BTC/USD price oracle precompile at
///         `0x7b7c000000000000000000000000000000000015`.
/// @dev Chainlink AggregatorV3-shaped. Validators agree on the price during block consensus
///      (Skip Connect `x/oracle`), so it refreshes every block. Verified on mainnet and testnet
///      2026-09-16: `decimals() == 18`, `updatedAt` within seconds of the block time.
///      It exposes only the latest round — there is no historical lookup.
interface IMezoPriceOracle {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
