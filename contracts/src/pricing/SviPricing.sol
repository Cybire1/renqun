// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {FixedMath} from "../math/FixedMath.sol";

/// @title SviPricing
/// @notice SVI-adjusted digital probabilities for range digitals.
/// @dev Port of DeepBook Predict `pricing.move` (Mysten Labs, Apache-2.0):
///        k      = ln(strike / forward)
///        w(k)   = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
///        d2     = -(k + w/2) / sqrt(w)
///        UP(k)  = N(d2) - phi(d2) * w'(k) / (2 * sqrt(w))
///      All strikes, forwards and probabilities are 1e9-scaled. `a` and `b` are carried at 1e18
///      after the remaining-time roll-down, exactly as the Move pricer does.
library SviPricing {

    error ZeroForward();
    error CannotBeNegative();
    error NonPositiveVariance();
    error InvalidRange();
    error InputsInvalid();
    error MinVarianceInvalid();

    uint256 internal constant F = 1_000_000_000;
    /// @dev Raw strike sentinels (DeepBook `constants::neg_inf` / `pos_inf`).
    uint256 internal constant NEG_INF = 0;
    uint256 internal constant POS_INF = type(uint64).max;

    uint256 internal constant MAX_BASIS_FACTOR = 100;
    uint256 internal constant MAX_PRICING_SPOT = type(uint64).max / MAX_BASIS_FACTOR;
    uint256 internal constant MIN_SVI_SIGMA = 1_000_000;
    uint256 internal constant MAX_SVI_INPUT = 100 * F;

    /// @notice SVI parameters as published by the vol keeper (1e9 scale).
    struct RawSVI {
        uint256 aMagnitude;
        bool aNegative;
        uint256 b;
        int256 rho;
        int256 m;
        uint256 sigma;
    }

    /// @notice Transaction-local parameters after roll-down; `a` and `b` at 1e18.
    struct PricingSVI {
        uint256 aMagnitude;
        bool aNegative;
        uint256 b;
        int256 rho;
        int256 m;
        uint256 sigma;
    }

    // ───────────────────────── loader pieces ─────────────────────────

    /// @notice Scale a 1e9 value by remaining/anchor time, returning it at 1e18.
    function rollDownTo1e18(uint256 value, uint256 remaining, uint256 anchorTte) internal pure returns (uint256) {
        return (value * F * remaining) / anchorTte;
    }

    /// @notice Apply the remaining-time roll-down to a raw surface.
    /// @param paramsTimestamp model time the surface was fit at (same unit as `now_`/`expiry`).
    function rollDown(RawSVI memory raw, uint256 paramsTimestamp, uint256 expiry, uint256 now_)
        internal
        pure
        returns (PricingSVI memory svi)
    {
        uint256 remaining = expiry - now_;
        uint256 anchorTte = expiry - paramsTimestamp;
        svi.aMagnitude = rollDownTo1e18(raw.aMagnitude, remaining, anchorTte);
        svi.aNegative = raw.aNegative;
        svi.b = rollDownTo1e18(raw.b, remaining, anchorTte);
        svi.rho = raw.rho;
        svi.m = raw.m;
        svi.sigma = raw.sigma;
    }

    /// @notice Predict's private pricing envelope: bounds that keep the fixed-point math live.
    function assertInputsPricingSafe(uint256 spot, uint256 forward, RawSVI memory raw) internal pure {
        if (spot == 0 || forward == 0) revert InputsInvalid();
        if (forward > MAX_PRICING_SPOT) revert InputsInvalid();
        // ceil(forward / factor) <= spot  <=>  forward <= factor * spot
        if ((forward + MAX_BASIS_FACTOR - 1) / MAX_BASIS_FACTOR > spot) revert InputsInvalid();
        if (raw.aMagnitude > MAX_SVI_INPUT) revert InputsInvalid();
        if (raw.b > MAX_SVI_INPUT) revert InputsInvalid();
        if (FixedMath.abs(raw.rho) > F) revert InputsInvalid();
        if (FixedMath.abs(raw.m) > MAX_SVI_INPUT) revert InputsInvalid();
        if (raw.sigma < MIN_SVI_SIGMA || raw.sigma > MAX_SVI_INPUT) revert InputsInvalid();
        _assertMinTotalVariancePositive(raw);
    }

    // ───────────────────────── prices ─────────────────────────

    /// @notice P(settlement > strike).
    function upPrice(PricingSVI memory svi, uint256 forward, uint256 strike) internal pure returns (uint256) {
        if (strike == NEG_INF) return F;
        if (strike == POS_INF) return 0;
        return computeNd2(svi, forward, strike);
    }

    /// @notice P(lower < settlement <= higher), floored at zero.
    function rangePrice(PricingSVI memory svi, uint256 forward, uint256 lower, uint256 higher)
        internal
        pure
        returns (uint256)
    {
        if (lower >= higher) revert InvalidRange();
        uint256 lo = upPrice(svi, forward, lower);
        uint256 hi = upPrice(svi, forward, higher);
        return lo > hi ? lo - hi : 0;
    }

    function computeNd2(PricingSVI memory svi, uint256 forward, uint256 strike) internal pure returns (uint256) {
        if (forward == 0) revert ZeroForward();
        (bool ok, uint256 strikeRatio) = FixedMath.tryMulDivDown(strike, F, forward);
        if (!ok) return 0; // deep OTM up tail
        if (strikeRatio == 0) return F; // deep ITM up tail

        int256 k = FixedMath.ln(strikeRatio);
        int256 kMinusM = k - svi.m;
        uint256 sq = FixedMath.sqrtDown(
            FixedMath.squareScaled(kMinusM) + FixedMath.mulDown(svi.sigma, svi.sigma)
        );

        // forge-lint: disable-next-line(unsafe-typecast) -- sq is a 1e9 sqrt, < 2^64
        int256 inner = FixedMath.mulScaled(svi.rho, kMinusM) + int256(sq);
        if (inner < 0) revert CannotBeNegative();

        // forge-lint: disable-next-line(unsafe-typecast) -- inner >= 0 checked above
        (uint256 sqrtVar, int256 d2) = _varianceSqrtAndD2(svi, uint256(inner), k);
        // forge-lint: disable-next-line(unsafe-typecast) -- sq < 2^64
        int256 slope = svi.rho + FixedMath.divScaled(kMinusM, int256(sq));
        return _skewAdjusted(svi.b, slope, sqrtVar, d2);
    }

    // ───────────────────────── private ─────────────────────────

    /// @dev N(d2) - phi(d2) * w' / (2 sqrt(w)), clamped to [0, 1]. `b` at 1e18, `slope` at 1e9.
    function _skewAdjusted(uint256 b, int256 slope, uint256 sqrtVar, int256 d2) private pure returns (uint256) {
        uint256 wPrime = (b * FixedMath.abs(slope)) / (F * F);
        uint256 nd2 = FixedMath.normalCdf(d2);
        if (wPrime == 0) return nd2;

        uint256 correctionMagnitude = FixedMath.mulDivDown(FixedMath.normalPdf(d2), wPrime, 2 * sqrtVar);
        // forge-lint: disable-next-line(unsafe-typecast) -- nd2 <= 1e9
        int256 adjusted = int256(nd2) - FixedMath.fromParts(correctionMagnitude, slope < 0);
        if (adjusted < 0) return 0;
        // forge-lint: disable-next-line(unsafe-typecast) -- adjusted >= 0 checked above
        if (uint256(adjusted) > F) return F;
        // forge-lint: disable-next-line(unsafe-typecast) -- 0 <= adjusted <= F
        return uint256(adjusted);
    }

    function _varianceSqrtAndD2(PricingSVI memory svi, uint256 inner, int256 k)
        private
        pure
        returns (uint256 sqrtVar, int256 d2)
    {
        uint256 increment = (svi.b * inner) / F;
        uint256 totalVar;
        if (svi.aNegative) {
            if (increment <= svi.aMagnitude) revert NonPositiveVariance();
            totalVar = increment - svi.aMagnitude;
        } else {
            if (increment + svi.aMagnitude == 0) revert NonPositiveVariance();
            totalVar = increment + svi.aMagnitude;
        }
        sqrtVar = FixedMath.sqrtU128Down(totalVar);

        uint256 kScaled = FixedMath.abs(k) * F;
        uint256 halfVar = totalVar / 2;
        uint256 numerator;
        bool numeratorNegative;
        if (k >= 0) {
            numerator = kScaled + halfVar;
        } else if (halfVar >= kScaled) {
            numerator = halfVar - kScaled;
        } else {
            numerator = kScaled - halfVar;
            numeratorNegative = true;
        }
        uint256 saturation = 8 * F + 1;
        uint256 d2Magnitude = numerator / sqrtVar;
        if (d2Magnitude > saturation) d2Magnitude = saturation;
        d2 = FixedMath.fromParts(d2Magnitude, !numeratorNegative);
    }

    function _assertMinTotalVariancePositive(RawSVI memory raw) private pure {
        uint256 minIncrement = _minSviVarianceIncrement(raw);
        // forge-lint: disable-next-line(unsafe-typecast) -- bounded by MAX_SVI_INPUT products
        int256 minTotalVar = int256(minIncrement) + FixedMath.fromParts(raw.aMagnitude, raw.aNegative);
        if (minTotalVar <= 0) revert MinVarianceInvalid();
    }

    /// @dev b * sigma * sqrt(1 - rho^2): the smallest non-`a` part of total variance.
    function _minSviVarianceIncrement(RawSVI memory raw) private pure returns (uint256) {
        uint256 rhoMag = FixedMath.abs(raw.rho);
        if (rhoMag == F) return 0;
        uint256 oneMinusRhoSquared = F - FixedMath.mulDown(rhoMag, rhoMag);
        uint256 root = FixedMath.sqrtDown(oneMinusRhoSquared);
        return FixedMath.mulDown(raw.b, FixedMath.mulDown(raw.sigma, root));
    }
}
