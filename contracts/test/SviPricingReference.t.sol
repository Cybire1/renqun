// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {SviPricing} from "../src/pricing/SviPricing.sol";
import {FixedMath} from "../src/math/FixedMath.sol";
import {PricingReference} from "./fixtures/PricingReference.sol";

/// @notice Holds the Solidity pricer to the same independent true-math references, with the same
///         per-point tolerances, that DeepBook's Move pricer is held to (real Block Scholes SVI rows
///         from 2026-05-27). Fixture timing matches Move's: SVI stamped "now", far expiry, so the
///         roll-down ratio is exactly 1, and the priced forward is the pushed forward.
contract SviPricingReferenceTest is Test {
    uint256 constant F = 1e9;
    uint256 constant NOW = 120; // any value; only the remaining/anchor ratio matters
    uint256 constant EXPIRY = 31_536_120;

    function _pricer(PricingReference.Scenario memory s) internal pure returns (SviPricing.PricingSVI memory) {
        SviPricing.RawSVI memory raw = SviPricing.RawSVI({
            aMagnitude: s.a,
            aNegative: false,
            b: s.b,
            rho: FixedMath.fromParts(s.rhoMag, s.rhoNeg),
            m: FixedMath.fromParts(s.mMag, s.mNeg),
            sigma: s.sigma
        });
        SviPricing.assertInputsPricingSafe(s.spot, s.forward, raw);
        return SviPricing.rollDown(raw, NOW, EXPIRY, NOW);
    }

    function _runScenario(uint256 idx) internal pure returns (uint256 worst) {
        PricingReference.Scenario memory s = PricingReference.scenario(idx);
        SviPricing.PricingSVI memory svi = _pricer(s);
        // Move prices mul_div_down(pyth_spot, bs_forward, bs_spot) with pyth == bs spot.
        uint256 forward = FixedMath.mulDivDown(s.spot, s.forward, s.spot);
        PricingReference.Point[] memory pts = PricingReference.points(idx);
        for (uint256 i = 0; i < pts.length; ++i) {
            uint256 actual = SviPricing.rangePrice(svi, forward, pts[i].lower, pts[i].higher);
            uint256 ref = pts[i].reference_;
            uint256 diff = actual > ref ? actual - ref : ref - actual;
            require(diff <= pts[i].tolerance, "range price outside DeepBook tolerance");
            if (diff > worst) worst = diff;
        }
    }

    function test_realScenario0_largeVariance() public pure { _runScenario(0); }
    function test_realScenario1_mediumVariance() public pure { _runScenario(1); }
    function test_realScenario2_smallVariance() public pure { _runScenario(2); }
    function test_realScenario3_tinyVariance() public pure { _runScenario(3); }

    function test_allScenarios_reportWorstError() public pure {
        uint256 worst;
        for (uint256 s = 0; s < PricingReference.SCENARIOS; ++s) {
            uint256 w = _runScenario(s);
            if (w > worst) worst = w;
        }
        console2.log("worst |solidity - true math| (1e9 units):", worst);
        // DeepBook's documented worst-case per-endpoint budget across the dataset.
        assertLe(worst, 2 * 3_304);
    }

    /// @dev Flat surface a = 1e-9, b = 0 at the forward: Phi(-sqrt(a)/2) — DeepBook reference 499_993_692 ± 21.
    function test_flatSurfaceAtForward() public pure {
        SviPricing.RawSVI memory raw = SviPricing.RawSVI(1, false, 0, 0, 0, 1_000_000);
        SviPricing.PricingSVI memory svi = SviPricing.rollDown(raw, NOW, EXPIRY, NOW);
        uint256 forward = 75_000 * F;
        uint256 p = SviPricing.upPrice(svi, forward, forward);
        uint256 ref = 499_993_692;
        assertLe(p > ref ? p - ref : ref - p, 21);
    }

    /// @dev Steep skew clamps the adjusted digital into [0, 1] (Move: skew_clamp tests).
    function test_skewClampsToBounds() public pure {
        uint256 forward = 75_000 * F;
        SviPricing.RawSVI memory pos = SviPricing.RawSVI(1, false, 100 * F, int256(F), 0, 1_000_000);
        SviPricing.RawSVI memory neg = SviPricing.RawSVI(1, false, 100 * F, -int256(F), 0, 1_000_000);
        SviPricing.PricingSVI memory sp = SviPricing.rollDown(pos, NOW, EXPIRY, NOW);
        SviPricing.PricingSVI memory sn = SviPricing.rollDown(neg, NOW, EXPIRY, NOW);
        assertEq(SviPricing.upPrice(sp, forward, forward), 0);
        assertEq(SviPricing.upPrice(sn, forward, forward), F);
    }

    function test_infinities() public pure {
        PricingReference.Scenario memory s = PricingReference.scenario(0);
        SviPricing.PricingSVI memory svi = _pricer(s);
        assertEq(SviPricing.upPrice(svi, s.forward, SviPricing.NEG_INF), F);
        assertEq(SviPricing.upPrice(svi, s.forward, SviPricing.POS_INF), 0);
        assertEq(SviPricing.rangePrice(svi, s.forward, SviPricing.NEG_INF, SviPricing.POS_INF), F);
    }

    /// @dev UP and DOWN at the same strike partition probability mass.
    function testFuzz_upPlusDownIsOne(uint64 strikeUsd) public pure {
        PricingReference.Scenario memory s = PricingReference.scenario(1);
        SviPricing.PricingSVI memory svi = _pricer(s);
        uint256 strike = bound(uint256(strikeUsd), 60_000, 90_000) * F;
        uint256 up = SviPricing.rangePrice(svi, s.forward, strike, SviPricing.POS_INF);
        uint256 down = SviPricing.rangePrice(svi, s.forward, SviPricing.NEG_INF, strike);
        assertEq(up + down, F);
    }

    /// @dev Roll-down halves the carried variance terms when half the anchored time remains.
    function test_rollDownScalesAandB() public pure {
        SviPricing.RawSVI memory raw = SviPricing.RawSVI(400, false, 2_000, 0, 0, 1_000_000);
        SviPricing.PricingSVI memory svi = SviPricing.rollDown(raw, 0, 100, 50);
        assertEq(svi.aMagnitude, 400 * F / 2);
        assertEq(svi.b, 2_000 * F / 2);
    }
}
