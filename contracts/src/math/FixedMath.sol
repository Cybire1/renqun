// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title FixedMath
/// @notice 1e9-scaled fixed-point arithmetic and transcendental approximations.
/// @dev Line-for-line port of DeepBook Predict's `fixed_math::math` and `fixed_math::i64`
///      (Mysten Labs, Apache-2.0). Every integer expression keeps the Move operand order so
///      truncation matches the on-chain Sui pricer bit-for-bit. Signed values are `int256`;
///      Solidity's truncating division matches Move's "magnitude truncated toward zero".
///      Documented budgets (from the Move source): `normalCdf` within 20 raw units,
///      `normalPdf` within 50, `ln`/`exp` ~1e-7 relative.
library FixedMath {
    error InputZero();
    error ExpOverflow();
    error ZeroDivisor();

    uint256 internal constant F = 1_000_000_000;
    uint256 internal constant U64_MAX = type(uint64).max;

    uint256 private constant LN2 = 693_147_180;
    uint256 private constant INV_SQRT_2PI = 398_942_280;
    uint256 private constant EXP_MAX_INPUT = 23_638_153_618;

    // Cody (1969) rational approximation, as in GSL gauss.c, scaled to 1e9.
    uint256 private constant SMALL_THRESHOLD = 662_910_000;
    uint256 private constant A0 = 2_235_252_035;
    uint256 private constant A1 = 161_028_231_069;
    uint256 private constant A2 = 1_067_689_485_460;
    uint256 private constant A3 = 18_154_981_253_344;
    uint256 private constant A4 = 65_682_338;
    uint256 private constant B0 = 47_202_581_905;
    uint256 private constant B1 = 976_098_551_738;
    uint256 private constant B2 = 10_260_932_208_619;
    uint256 private constant B3 = 45_507_789_335_027;

    uint256 private constant MEDIUM_THRESHOLD = 5_656_854_249;
    uint256 private constant C0 = 398_941_512;
    uint256 private constant C1 = 8_883_149_794;
    uint256 private constant C2 = 93_506_656_132;
    uint256 private constant C3 = 597_270_276_395;
    uint256 private constant C4 = 2_494_537_585_290;
    uint256 private constant C5 = 6_848_190_450_536;
    uint256 private constant C6 = 11_602_651_437_647;
    uint256 private constant C7 = 9_842_714_838_384;
    uint256 private constant C8 = 11;
    uint256 private constant D0 = 22_266_688_044;
    uint256 private constant D1 = 235_387_901_782;
    uint256 private constant D2 = 1_519_377_599_408;
    uint256 private constant D3 = 6_485_558_298_267;
    uint256 private constant D4 = 18_615_571_640_885;
    uint256 private constant D5 = 34_900_952_721_146;
    uint256 private constant D6 = 38_912_003_286_093;
    uint256 private constant D7 = 19_685_429_676_860;

    uint256 private constant INV_3 = 333_333_333;
    uint256 private constant INV_5 = 200_000_000;
    uint256 private constant INV_7 = 142_857_143;
    uint256 private constant INV_9 = 111_111_111;
    uint256 private constant INV_11 = 90_909_091;
    uint256 private constant INV_13 = 76_923_077;

    // ───────────────────────── unsigned 1e9 helpers ─────────────────────────

    function mulDown(uint256 x, uint256 y) internal pure returns (uint256) {
        return (x * y) / F;
    }

    function divDown(uint256 x, uint256 y) internal pure returns (uint256) {
        return (x * F) / y;
    }

    function mulDivDown(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256) {
        if (denominator == 0) revert InputZero();
        return (x * y) / denominator;
    }

    /// @return ok false for a zero denominator or a result that does not fit in u64 (Move's `None`).
    function tryMulDivDown(uint256 x, uint256 y, uint256 denominator)
        internal
        pure
        returns (bool ok, uint256 result)
    {
        if (denominator == 0) return (false, 0);
        result = (x * y) / denominator;
        if (result > U64_MAX) return (false, 0);
        return (true, result);
    }

    function mulDivUp(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256) {
        if (denominator == 0) revert InputZero();
        uint256 numerator = x * y;
        return (numerator + denominator - 1) / denominator;
    }

    // ───────────────────────── signed 1e9 helpers (i64) ─────────────────────────

    function abs(int256 v) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast) -- magnitude of a sign-checked value
        return v < 0 ? uint256(-v) : uint256(v);
    }

    function fromParts(uint256 magnitude, bool negative) internal pure returns (int256) {
        // forge-lint: disable-next-line(unsafe-typecast) -- magnitudes here stay far below 2^255
        return negative ? -int256(magnitude) : int256(magnitude);
    }

    function mulScaled(int256 a, int256 b) internal pure returns (int256) {
        uint256 product = (abs(a) * abs(b)) / F;
        return fromParts(product, (a < 0) != (b < 0));
    }

    function divScaled(int256 a, int256 b) internal pure returns (int256) {
        if (b == 0) revert ZeroDivisor();
        uint256 quotient = (abs(a) * F) / abs(b);
        return fromParts(quotient, (a < 0) != (b < 0));
    }

    function squareScaled(int256 v) internal pure returns (uint256) {
        uint256 m = abs(v);
        return (m * m) / F;
    }

    // ───────────────────────── transcendental ─────────────────────────

    /// @notice ln of a positive 1e9-scaled value, as a signed 1e9-scaled result.
    function ln(uint256 x) internal pure returns (int256) {
        if (x == 0) revert InputZero();
        if (x == F) return 0;
        if (x < F) {
            uint256 inv = (F * F) / x;
            return -ln(inv);
        }
        (uint256 y, uint256 n) = _normalize(x);
        return int256(_lnU128(y, n));
    }

    /// @notice e^x at 1e9 scale.
    function exp(int256 x) internal pure returns (uint256) {
        uint256 xMag = abs(x);
        bool xNegative = x < 0;
        if (xMag == 0) return F;
        if (!xNegative && xMag > EXP_MAX_INPUT) revert ExpOverflow();
        uint256 n = xMag / LN2;
        uint256 r = xMag - n * LN2;
        return _expU128(r, n, xNegative);
    }

    /// @notice Standard normal CDF Φ(x) at 1e9 scale (Cody). |x| >= √32 saturates.
    function normalCdf(int256 x) internal pure returns (uint256) {
        uint256 xMag = abs(x);
        bool xNegative = x < 0;
        if (xMag > 8 * F) return xNegative ? 0 : F;
        return _normalCdfU128(xMag, xNegative);
    }

    /// @notice Standard normal PDF φ(x) at 1e9 scale. Tails beyond |8| round to zero.
    function normalPdf(int256 x) internal pure returns (uint256) {
        uint256 xMag = abs(x);
        if (xMag > 8 * F) return 0;
        uint256 xSqHalf = (xMag * xMag) / (2 * F);
        // forge-lint: disable-next-line(unsafe-typecast) -- xSqHalf <= 32e9
        return mulDown(exp(-int256(xSqHalf)), INV_SQRT_2PI);
    }

    function sqrtDown(uint256 x) internal pure returns (uint256) {
        return sqrtU128Down(x * F);
    }

    /// @notice Integer sqrt rounded down (7 Newton steps from a power-of-two guess, as in Move).
    function sqrtU128Down(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        if (x < 4) return 1;
        uint256 g = _sqrtInitialGuess(x);
        g = (g + x / g) / 2;
        g = (g + x / g) / 2;
        g = (g + x / g) / 2;
        g = (g + x / g) / 2;
        g = (g + x / g) / 2;
        g = (g + x / g) / 2;
        g = (g + x / g) / 2;
        if (g > x / g) g = g - 1;
        return g;
    }

    // ───────────────────────── private ─────────────────────────

    function _lnU128(uint256 y, uint256 n) private pure returns (uint256) {
        uint256 z = ((y - F) * F) / (y + F);
        uint256 w = (z * z) / F;
        uint256 h = (w * INV_13) / F;
        h = ((INV_11 + h) * w) / F;
        h = ((INV_9 + h) * w) / F;
        h = ((INV_7 + h) * w) / F;
        h = ((INV_5 + h) * w) / F;
        h = ((INV_3 + h) * w) / F;
        // forge-lint: disable-next-line(divide-before-multiply) -- Move operand order, kept for bit parity
        uint256 lnY = (((2 * F * z) / F) * (F + h)) / F;
        return n * LN2 + lnY;
    }

    function _expU128(uint256 r, uint256 n, bool xNegative) private pure returns (uint256) {
        uint256 expR = _expSeries(r);
        if (xNegative) {
            uint256 result = (F * F) / expR;
            if (n >= 32) { result >>= 32; if (result == 0) return 0; n -= 32; }
            if (n >= 16) { result >>= 16; if (result == 0) return 0; n -= 16; }
            if (n >= 8) { result >>= 8; if (result == 0) return 0; n -= 8; }
            if (n >= 4) { result >>= 4; if (result == 0) return 0; n -= 4; }
            if (n >= 2) { result >>= 2; if (result == 0) return 0; n -= 2; }
            if (n >= 1) { result >>= 1; }
            return result;
        } else {
            uint256 result = expR;
            if (n >= 32) { result <<= 32; n -= 32; }
            if (n >= 16) { result <<= 16; n -= 16; }
            if (n >= 8) { result <<= 8; n -= 8; }
            if (n >= 4) { result <<= 4; n -= 4; }
            if (n >= 2) { result <<= 2; n -= 2; }
            if (n >= 1) { result <<= 1; }
            return result;
        }
    }

    function _expSeries(uint256 r) private pure returns (uint256) {
        uint256 sum = F;
        uint256 term = F;
        for (uint256 k = 1; k <= 12; ++k) {
            term = (term * r) / (k * F);
            if (term == 0) break;
            sum += term;
        }
        return sum;
    }

    function _normalCdfU128(uint256 x, bool xNegative) private pure returns (uint256) {
        if (x < SMALL_THRESHOLD) {
            uint256 xsq = (x * x) / F;
            uint256 xnum = (A4 * xsq) / F;
            uint256 xden = xsq;
            xnum = ((xnum + A0) * xsq) / F;
            xden = ((xden + B0) * xsq) / F;
            xnum = ((xnum + A1) * xsq) / F;
            xden = ((xden + B1) * xsq) / F;
            xnum = ((xnum + A2) * xsq) / F;
            xden = ((xden + B2) * xsq) / F;
            uint256 ratio = ((xnum + A3) * F) / (xden + B3);
            uint256 term = (x * ratio) / F;
            return xNegative ? F / 2 - term : F / 2 + term;
        } else if (x < MEDIUM_THRESHOLD) {
            uint256 xnum = (C8 * x) / F;
            uint256 xden = x;
            xnum = ((xnum + C0) * x) / F;
            xden = ((xden + D0) * x) / F;
            xnum = ((xnum + C1) * x) / F;
            xden = ((xden + D1) * x) / F;
            xnum = ((xnum + C2) * x) / F;
            xden = ((xden + D2) * x) / F;
            xnum = ((xnum + C3) * x) / F;
            xden = ((xden + D3) * x) / F;
            xnum = ((xnum + C4) * x) / F;
            xden = ((xden + D4) * x) / F;
            xnum = ((xnum + C5) * x) / F;
            xden = ((xden + D5) * x) / F;
            xnum = ((xnum + C6) * x) / F;
            xden = ((xden + D6) * x) / F;
            uint256 rational = ((xnum + C7) * F) / (xden + D7);

            uint256 xSqHalf = (x * x) / (F * 2);
            uint256 n = xSqHalf / LN2;
            uint256 r = xSqHalf - n * LN2;
            uint256 expVal = _expU128(r, n, true);
            uint256 complement = (expVal * rational) / F;
            return xNegative ? complement : F - complement;
        } else {
            return xNegative ? 0 : F;
        }
    }

    function _normalize(uint256 x) private pure returns (uint256 y, uint256 n) {
        y = x;
        if ((y >> 32) >= F) { y >>= 32; n += 32; }
        if ((y >> 16) >= F) { y >>= 16; n += 16; }
        if ((y >> 8) >= F) { y >>= 8; n += 8; }
        if ((y >> 4) >= F) { y >>= 4; n += 4; }
        if ((y >> 2) >= F) { y >>= 2; n += 2; }
        if ((y >> 1) >= F) { y >>= 1; n += 1; }
    }

    function _sqrtInitialGuess(uint256 x) private pure returns (uint256) {
        uint256 bits;
        uint256 val = x;
        if (val >= 1 << 64) { val >>= 64; bits += 64; }
        if (val >= 1 << 32) { val >>= 32; bits += 32; }
        if (val >= 1 << 16) { val >>= 16; bits += 16; }
        if (val >= 1 << 8) { val >>= 8; bits += 8; }
        if (val >= 1 << 4) { val >>= 4; bits += 4; }
        if (val >= 1 << 2) { val >>= 2; bits += 2; }
        if (val >= 1 << 1) { bits += 1; }
        // forge-lint: disable-next-line(incorrect-shift) -- 2^((bits+1)/2), shift order is intended
        return 1 << ((bits + 1) / 2);
    }
}
