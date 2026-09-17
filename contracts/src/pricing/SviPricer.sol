// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {SviPricing} from "./SviPricing.sol";

/// @title SviPricer
/// @notice Externally linked entry point for the SVI pricing math.
/// @dev Deployed once and linked into `YosukuPredict` so the transcendental math stays out of the
///      market contract's bytecode (EIP-170). Pure; called via DELEGATECALL.
library SviPricer {
    function rangePrice(SviPricing.PricingSVI memory svi, uint256 forward, uint256 lower, uint256 higher)
        external
        pure
        returns (uint256)
    {
        return SviPricing.rangePrice(svi, forward, lower, higher);
    }
}
