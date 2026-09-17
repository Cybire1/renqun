// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FixedMath} from "../src/math/FixedMath.sol";

/// @dev Harness so reverts surface as external-call failures for `vm.expectRevert`.
contract FixedMathHarness {
    function ln(uint256 x) external pure returns (int256) { return FixedMath.ln(x); }
    function exp(int256 x) external pure returns (uint256) { return FixedMath.exp(x); }
    function mulDivDown(uint256 x, uint256 y, uint256 d) external pure returns (uint256) {
        return FixedMath.mulDivDown(x, y, d);
    }
}

/// @notice Reference vectors are DeepBook's own (`fixed_math/tests/math/math_tests.move`):
///         round(f_true(x) * 1e9) from Python stdlib, held to math.move's documented budgets.
contract FixedMathTest is Test {
    uint256 constant F = 1e9;
    uint256 constant EXP_BUDGET_REL = 100; // 1e-7 relative
    uint256 constant LN_BUDGET_REL = 100;
    uint256 constant CDF_BUDGET_ABS = 20;
    uint256 constant PDF_BUDGET_ABS = 50;

    FixedMathHarness h = new FixedMathHarness();

    function _within(uint256 actual, uint256 expected, uint256 budget) internal pure {
        uint256 diff = actual > expected ? actual - expected : expected - actual;
        require(diff <= budget, "outside absolute budget");
    }

    function _withinRel(uint256 actual, uint256 expected, uint256 partsPerF) internal pure {
        uint256 diff = actual > expected ? actual - expected : expected - actual;
        uint256 allowed = (expected * partsPerF) / F;
        if (allowed == 0) allowed = 1;
        require(diff <= allowed, "outside relative budget");
    }

    // ── ratio helpers (exact vectors) ──
    function test_mulDown() public pure {
        assertEq(FixedMath.mulDown(F + F / 2, 2 * F + F / 4), 3_375_000_000);
        assertEq(FixedMath.mulDown(1, 1), 0);
    }

    function test_divDown() public pure {
        assertEq(FixedMath.divDown(5 * F, 2 * F), 2_500_000_000);
        assertEq(FixedMath.divDown(1, 3), 333_333_333);
    }

    function test_mulDiv() public pure {
        assertEq(FixedMath.mulDivDown(10, 10, 6), 16);
        assertEq(FixedMath.mulDivUp(10, 10, 6), 17);
        assertEq(FixedMath.mulDivUp(10, 10, 5), 20);
        assertEq(FixedMath.mulDivUp(1, 1, 2), 1);
        assertEq(FixedMath.mulDivUp(0, F, 6), 0);
        (bool ok, uint256 r) = FixedMath.tryMulDivDown(10, 10, 6);
        assertTrue(ok);
        assertEq(r, 16);
        (ok,) = FixedMath.tryMulDivDown(10, 10, 0);
        assertFalse(ok);
        (ok,) = FixedMath.tryMulDivDown(type(uint64).max, 2, 1);
        assertFalse(ok);
    }

    function test_mulDivZeroDenominatorReverts() public {
        vm.expectRevert(FixedMath.InputZero.selector);
        h.mulDivDown(10, 10, 0);
    }

    // ── ln ──
    function test_ln() public {
        assertEq(FixedMath.ln(F), 0);
        _withinRel(uint256(FixedMath.ln(2 * F)), 693_147_181, LN_BUDGET_REL);
        _withinRel(uint256(FixedMath.ln(10 * F)), 2_302_585_093, LN_BUDGET_REL);
        int256 half = FixedMath.ln(F / 2);
        assertLt(half, 0);
        _withinRel(uint256(-half), 693_147_181, LN_BUDGET_REL);
        assertLe(FixedMath.abs(FixedMath.ln(F - 1)), 1);
        assertLe(FixedMath.abs(FixedMath.ln(F + 1)), 1);
        // ln(1e-9) = -20.723265837
        int256 tiny = FixedMath.ln(1);
        assertLt(tiny, 0);
        _withinRel(uint256(-tiny), 20_723_265_837, LN_BUDGET_REL);
        // ln(1.5)
        _withinRel(uint256(FixedMath.ln(F + F / 2)), 405_465_108, LN_BUDGET_REL);
        vm.expectRevert(FixedMath.InputZero.selector);
        h.ln(0);
    }

    // ── exp ──
    function test_exp() public {
        assertEq(FixedMath.exp(0), F);
        _withinRel(FixedMath.exp(int256(F)), 2_718_281_828, EXP_BUDGET_REL);
        _withinRel(FixedMath.exp(-int256(F)), 367_879_441, EXP_BUDGET_REL);
        _withinRel(FixedMath.exp(int256(2 * F)), 7_389_056_099, EXP_BUDGET_REL);
        _withinRel(FixedMath.exp(-int256(2 * F)), 135_335_283, EXP_BUDGET_REL);
        _withinRel(FixedMath.exp(int256(10 * F)), 22_026_465_794_807, EXP_BUDGET_REL);
        _withinRel(FixedMath.exp(-int256(10 * F)), 45_400, EXP_BUDGET_REL);
        assertEq(FixedMath.exp(-int256(24 * F)), 0);
        vm.expectRevert(FixedMath.ExpOverflow.selector);
        h.exp(int256(uint256(23_638_153_618 + 1)));
    }

    // ── normal cdf / pdf ──
    function test_normalCdf() public pure {
        assertEq(FixedMath.normalCdf(0), F / 2);
        _within(FixedMath.normalCdf(int256(F / 2)), 691_462_461, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(-int256(F / 2)), 308_537_539, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(int256(F)), 841_344_746, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(-int256(F)), 158_655_254, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(int256(2 * F)), 977_249_868, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(-int256(2 * F)), 22_750_132, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(int256(3 * F)), 998_650_102, CDF_BUDGET_ABS);
        _within(FixedMath.normalCdf(-int256(3 * F)), 1_349_898, CDF_BUDGET_ABS);
        assertEq(FixedMath.normalCdf(-int256(6 * F)), 0);
        assertEq(FixedMath.normalCdf(int256(9 * F)), F);
    }

    function test_normalPdf() public pure {
        _within(FixedMath.normalPdf(0), 398_942_280, PDF_BUDGET_ABS);
        _within(FixedMath.normalPdf(int256(F / 2)), 352_065_327, PDF_BUDGET_ABS);
        _within(FixedMath.normalPdf(int256(F)), 241_970_725, PDF_BUDGET_ABS);
        _within(FixedMath.normalPdf(-int256(F)), 241_970_725, PDF_BUDGET_ABS);
        _within(FixedMath.normalPdf(int256(2 * F)), 53_990_967, PDF_BUDGET_ABS);
        _within(FixedMath.normalPdf(int256(3 * F)), 4_431_848, PDF_BUDGET_ABS);
        assertEq(FixedMath.normalPdf(int256(9 * F)), 0);
    }

    // ── sqrt ──
    function test_sqrt() public pure {
        assertEq(FixedMath.sqrtDown(4 * F), 2 * F);
        _within(FixedMath.sqrtDown(2 * F), 1_414_213_562, 1);
        _within(FixedMath.sqrtDown(3 * F), 1_732_050_808, 1);
        _within(FixedMath.sqrtDown(F / 2), 707_106_781, 1);
        assertEq(FixedMath.sqrtU128Down(0), 0);
        assertEq(FixedMath.sqrtU128Down(3), 1);
    }

    function testFuzz_sqrtIsFloor(uint128 x) public pure {
        uint256 r = FixedMath.sqrtU128Down(x);
        assertLe(r * r, x);
        assertGt((r + 1) * (r + 1), x);
    }

    function testFuzz_cdfMonotoneAndBounded(int64 a, int64 b) public pure {
        int256 x = int256(a) % int256(10 * F);
        int256 y = int256(b) % int256(10 * F);
        if (x > y) (x, y) = (y, x);
        uint256 cx = FixedMath.normalCdf(x);
        uint256 cy = FixedMath.normalCdf(y);
        assertLe(cy, F);
        // Cody's pieces are joined within the documented 20-unit budget.
        assertLe(cx, cy + CDF_BUDGET_ABS);
    }
}
