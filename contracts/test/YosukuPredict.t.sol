// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {YosukuPredictBase} from "./YosukuPredictBase.sol";
import {YosukuPredict} from "../src/YosukuPredict.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract YosukuPredictTest is YosukuPredictBase {
    uint32 internal constant POS_INF = (1 << 30) - 1;
    uint256 internal constant LIQ = 100_000e18;

    function setUp() public override {
        super.setUp();
        _seedLiquidity(LIQ);
    }

    // ───────────────────────── LP bootstrap ─────────────────────────

    function test_seedLiquidity_mintsSharesAtVirtualPrice() public view {
        // First deposit into an empty vault: D * (0 + 1e3) / (0 + 1).
        assertEq(predict.balanceOf(lp), LIQ * 1e3);
        assertEq(predict.navAssets(), LIQ);
        assertEq(predict.pendingDepositAssets(), 0);
        assertEq(predict.currentEpoch(), 1);
    }

    // ───────────────────────── markets & pricing ─────────────────────────

    function test_createMarketAtSpot_centresGrid() public {
        uint64 id = _openMarket(1 hours);
        (uint64 expiry, uint64 epoch, uint64 tickSize, uint32 minTick, YosukuPredict.Status status,,,,) =
            predict.markets(id);
        assertEq(expiry, block.timestamp + 1 hours);
        assertEq(epoch, 1);
        assertEq(tickSize, TICK);
        assertEq(minTick, 7_500 - 128); // $75,000 / $10
        assertEq(uint8(status), uint8(YosukuPredict.Status.Live));
    }

    function test_onlyKeeperCreatesMarkets() public {
        vm.expectRevert();
        vm.prank(alice);
        predict.createMarketAtSpot(uint64(block.timestamp + 1 hours), TICK);
    }

    function test_marketMustExpireInsideEpoch() public {
        uint64 tooLate = uint64(predict.epochEnd(1) + 1);
        vm.prank(keeper);
        vm.expectRevert(YosukuPredict.BadMarket.selector);
        predict.createMarket(tooLate, TICK, 7_372);
    }

    function test_quote_upAndDownPartitionProbability() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        (uint256 up,,) = predict.quote(id, atm, POS_INF, 1e18);
        (uint256 down,,) = predict.quote(id, 0, atm, 1e18);
        assertEq(up + down, F);
        // ATM digital sits near a coin flip, nudged by skew.
        assertApproxEqAbs(up, 525_000_000, 40_000_000);
    }

    function test_quote_rangesAddUp() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 a = predict.rangePriceOf(id, atm - 20, atm);
        uint256 b = predict.rangePriceOf(id, atm, atm + 20);
        uint256 whole = predict.rangePriceOf(id, atm - 20, atm + 20);
        assertApproxEqAbs(a + b, whole, 1);
    }

    /// @dev An older fit has already "used up" part of its horizon, so the rolled surface carries
    ///      less variance and a tight band around spot becomes more likely.
    function test_rollDown_olderFitCarriesLessVariance() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        vm.warp(block.timestamp + 50 minutes);
        _setSpot(SPOT_USD);
        vm.startPrank(keeper);
        predict.pushVol(id, uint64(SPOT_USD * F), uint64(SPOT_USD * F), uint64(block.timestamp), _surface());
        uint256 freshFit = predict.rangePriceOf(id, atm - 5, atm + 5);
        predict.pushVol(id, uint64(SPOT_USD * F), uint64(SPOT_USD * F), uint64(block.timestamp - 200), _surface());
        uint256 olderFit = predict.rangePriceOf(id, atm - 5, atm + 5);
        vm.stopPrank();
        assertGt(olderFit, freshFit);
    }

    // ───────────────────────── mint ─────────────────────────

    function test_mint_chargesPremiumPlusFee() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 qty = 100e18;
        (uint256 price, uint256 premium, uint256 fee) = predict.quote(id, atm, POS_INF, qty);
        uint256 before = musd.balanceOf(alice);
        uint256 pid = _mint(alice, id, atm, POS_INF, qty);

        assertEq(before - musd.balanceOf(alice), premium + fee);
        assertEq(musd.balanceOf(treasury), fee);
        assertEq(premium, (qty * price + F - 1) / F);
        assertEq(fee, (premium * 10_000_000 + F - 1) / F);
        (address owner,,,, bool open, uint128 quantity, uint128 paid) = predict.positions(pid);
        assertEq(owner, alice);
        assertTrue(open);
        assertEq(quantity, qty);
        assertEq(paid, premium);
        assertEq(predict.liveMaxLiability(), qty);
        assertEq(predict.navAssets(), LIQ + premium);
        _assertSolvent();
    }

    function test_mint_oppositeSidesShareWorstCase() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        _mint(alice, id, atm, POS_INF, 100e18);
        _mint(bob, id, 0, atm, 100e18);
        // UP and DOWN at one strike can never both pay.
        assertEq(predict.liveMaxLiability(), 100e18);
        _mint(bob, id, atm - 10, atm + 10, 50e18);
        assertEq(predict.liveMaxLiability(), 150e18);
    }

    function test_mint_revertsOnSlippage() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        (, uint256 premium, uint256 fee) = predict.quote(id, atm, POS_INF, 10e18);
        vm.prank(alice);
        vm.expectRevert(YosukuPredict.Slippage.selector);
        predict.mint(id, atm, POS_INF, 10e18, premium + fee - 1);
    }

    function test_mint_validatesInputs() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        vm.startPrank(alice);
        vm.expectRevert(YosukuPredict.BadQuantity.selector);
        predict.mint(id, atm, POS_INF, 1e16 + 1, type(uint256).max);
        vm.expectRevert(YosukuPredict.BadRange.selector);
        predict.mint(id, atm, atm, 10e18, type(uint256).max);
        vm.expectRevert(YosukuPredict.BadRange.selector);
        predict.mint(id, 0, POS_INF, 10e18, type(uint256).max);
        vm.expectRevert(YosukuPredict.BadRange.selector);
        predict.mint(id, atm + 200, POS_INF, 10e18, type(uint256).max); // off grid
        vm.expectRevert(YosukuPredict.PremiumTooSmall.selector);
        predict.mint(id, atm, POS_INF, 1e18, type(uint256).max);
        vm.stopPrank();

        // Deep OTM on a $100 grid: ~9 sigma out, priced under the 1c floor.
        vm.startPrank(keeper);
        uint64 wide = predict.createMarketAtSpot(uint64(block.timestamp + 1 hours), 100e9);
        predict.pushVol(wide, uint64(SPOT_USD * F), uint64(SPOT_USD * F), uint64(block.timestamp), _surface());
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(YosukuPredict.PriceOutOfBand.selector);
        predict.mint(wide, 750 + 127, POS_INF, 10_000e18, type(uint256).max);
    }

    function test_mint_enforcesExposureLimit() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        // Worst case may reach 50% of LP capital, which includes the premium just paid:
        // 80k at ~0.53 brings capital to ~142k, capping exposure at ~71k.
        vm.prank(alice);
        vm.expectRevert(YosukuPredict.ExposureLimit.selector);
        predict.mint(id, atm, POS_INF, 80_000e18, type(uint256).max);
        _mint(alice, id, atm, POS_INF, 45_000e18);
        _assertSolvent();
    }

    function test_mint_revertsOnStaleInputs() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        vm.expectRevert(YosukuPredict.SpotStale.selector);
        predict.mint(id, atm, POS_INF, 10e18, type(uint256).max);

        _setSpot(SPOT_USD);
        vm.warp(block.timestamp + 300);
        _setSpot(SPOT_USD);
        vm.prank(alice);
        vm.expectRevert(YosukuPredict.VolStale.selector);
        predict.mint(id, atm, POS_INF, 10e18, type(uint256).max);
    }

    function test_mint_forwardReanchorsOnLiveSpot() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 before = predict.rangePriceOf(id, atm, POS_INF);
        _setSpot(SPOT_USD + 200);
        assertGt(predict.rangePriceOf(id, atm, POS_INF), before);
    }

    function test_pause_blocksTradingButNotExits() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 pid = _mint(alice, id, atm, POS_INF, 10e18);
        vm.prank(admin);
        predict.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        predict.mint(id, atm, POS_INF, 10e18, type(uint256).max);

        _warpTo(block.timestamp + 1 hours);
        predict.settle(id);
        vm.prank(alice);
        predict.claim(pid);
    }

    // ───────────────────────── redeem ─────────────────────────

    function test_redeem_paysLivePriceAndReleasesExposure() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 pid = _mint(alice, id, atm, POS_INF, 100e18);
        _setSpot(SPOT_USD + 300);
        (uint256 price, uint256 proceeds, uint256 fee) = predict.quoteRedeem(pid);
        assertGt(price, F / 2);
        uint256 before = musd.balanceOf(alice);
        vm.prank(alice);
        predict.redeem(pid, proceeds);
        assertEq(musd.balanceOf(alice) - before, proceeds);
        assertEq(proceeds + fee, (100e18 * price) / F);
        assertEq(predict.liveMaxLiability(), 0);
        (,,,, bool open,,) = predict.positions(pid);
        assertFalse(open);
        _assertSolvent();
    }

    function test_redeem_onlyOwner() public {
        uint64 id = _openMarket(1 hours);
        uint256 pid = _mint(alice, id, _atmTick(id), POS_INF, 10e18);
        vm.prank(bob);
        vm.expectRevert(YosukuPredict.NotPositionOwner.selector);
        predict.redeem(pid, 0);
    }

    // ───────────────────────── settlement ─────────────────────────

    function test_settle_paysWinnersOnly() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 upId = _mint(alice, id, atm, POS_INF, 100e18);
        uint256 downId = _mint(bob, id, 0, atm, 80e18);

        _warpTo(block.timestamp + 1 hours);
        _setSpot(SPOT_USD + 1); // settles above the $75,000 strike
        predict.settle(id);
        assertEq(predict.owedTotal(), 100e18);

        uint256 aliceBefore = musd.balanceOf(alice);
        vm.prank(alice);
        assertEq(predict.claim(upId), 100e18);
        assertEq(musd.balanceOf(alice) - aliceBefore, 100e18);

        vm.prank(bob);
        assertEq(predict.claim(downId), 0);
        assertEq(predict.owedTotal(), 0);
        assertEq(predict.liveMaxLiability(), 0);
        _assertSolvent();
    }

    /// @dev DeepBook pays on (lower, higher]: settling exactly on a strike pays the range below it.
    function test_settle_boundaryIsLowerExclusiveUpperInclusive() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 upId = _mint(alice, id, atm, POS_INF, 10e18);
        uint256 belowId = _mint(bob, id, atm - 20, atm, 100e18);

        _warpTo(block.timestamp + 1 hours);
        _setSpot(SPOT_USD); // exactly on tick `atm`
        predict.settle(id);
        vm.prank(alice);
        assertEq(predict.claim(upId), 0);
        vm.prank(bob);
        assertEq(predict.claim(belowId), 100e18);
    }

    function test_settle_outsideGridUsesTailBuckets() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 upId = _mint(alice, id, atm, POS_INF, 10e18);
        uint256 topId = _mint(bob, id, atm + 100, POS_INF, 100e18);

        _warpTo(block.timestamp + 1 hours);
        _setSpot(SPOT_USD + 50_000); // far above the grid
        predict.settle(id);
        assertEq(predict.owedTotal(), 110e18);
        vm.prank(alice);
        assertEq(predict.claim(upId), 10e18);
        vm.prank(bob);
        assertEq(predict.claim(topId), 100e18);
    }

    function test_settle_waitsForPrintAtOrAfterExpiry() public {
        uint64 id = _openMarket(1 hours);
        uint256 expiry = block.timestamp + 1 hours;
        vm.warp(expiry);
        oracle.set(SPOT_USD, expiry - 1); // stale print from before expiry
        vm.expectRevert(YosukuPredict.AwaitingOraclePrint.selector);
        predict.settle(id);
        oracle.set(SPOT_USD, expiry);
        predict.settle(id);
    }

    function test_settle_cannotHappenEarly() public {
        uint64 id = _openMarket(1 hours);
        vm.expectRevert(YosukuPredict.MarketNotResolved.selector);
        predict.settle(id);
    }

    function test_void_refundsPremiumsAfterWindow() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        uint256 pid = _mint(alice, id, atm, POS_INF, 100e18);
        (,,,,,, uint128 premium) = predict.positions(pid);

        _warpTo(block.timestamp + 1 hours + 61);
        predict.settle(id);
        (,,,, YosukuPredict.Status status,,,,) = predict.markets(id);
        assertEq(uint8(status), uint8(YosukuPredict.Status.Void));

        uint256 before = musd.balanceOf(alice);
        vm.prank(alice);
        assertEq(predict.claim(pid), premium);
        assertEq(musd.balanceOf(alice) - before, premium);
    }

    function test_claim_twiceReverts() public {
        uint64 id = _openMarket(1 hours);
        uint256 pid = _mint(alice, id, _atmTick(id), POS_INF, 10e18);
        _warpTo(block.timestamp + 1 hours);
        predict.settle(id);
        predict.claim(pid);
        vm.expectRevert(YosukuPredict.PositionClosed.selector);
        predict.claim(pid);
    }

    // ───────────────────────── epochs ─────────────────────────

    function test_epoch_cannotRollWithOpenMarkets() public {
        _openMarket(1 hours);
        _warpTo(predict.epochEnd(1));
        vm.expectRevert(YosukuPredict.EpochHasOpenMarkets.selector);
        predict.rollEpoch();
    }

    function test_epoch_marketsBlockedUntilRolled() public {
        _warpTo(predict.epochEnd(1));
        vm.prank(keeper);
        vm.expectRevert(YosukuPredict.EpochNeedsRoll.selector);
        predict.createMarketAtSpot(uint64(block.timestamp + 1 hours), TICK);
    }

    /// @dev LPs keep premiums from losing traders and pay winners; the roll prices shares at that NAV.
    function test_epoch_lpPnLFlowsThroughWithdrawals() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        _mint(alice, id, atm, POS_INF, 1_000e18);
        (,,,,,,, uint128 premium,) = predict.markets(id);

        _warpTo(block.timestamp + 1 hours);
        _setSpot(SPOT_USD - 500); // alice loses
        predict.settle(id);

        uint256 shares = predict.balanceOf(lp);
        vm.prank(lp);
        predict.requestWithdraw(shares);
        _warpTo(predict.epochEnd(1));
        predict.rollEpoch();

        vm.prank(lp);
        uint256 out = predict.claimWithdraw(1);
        assertEq(out, LIQ + premium);
        assertEq(predict.totalSupply(), 0);
        _assertSolvent();
    }

    function test_epoch_newDepositorsPayFairPrice() public {
        uint64 id = _openMarket(1 hours);
        uint32 atm = _atmTick(id);
        _mint(alice, id, atm, POS_INF, 1_000e18);
        _warpTo(block.timestamp + 1 hours);
        _setSpot(SPOT_USD + 500); // alice wins 1,000; the vault is down 1,000 - premium
        predict.settle(id);
        vm.prank(alice);
        predict.claim(1);

        vm.prank(bob);
        predict.requestDeposit(50_000e18);
        uint256 navAtRoll = predict.navAssets();
        uint256 supplyAtRoll = predict.totalSupply();
        _warpTo(predict.epochEnd(1));
        predict.rollEpoch();
        vm.prank(bob);
        uint256 bobShares = predict.claimDeposit(1);

        // Bob's claim is worth what he paid, within rounding.
        uint256 bobValue = (bobShares * predict.navAssets()) / predict.totalSupply();
        assertApproxEqRel(bobValue, 50_000e18, 1e12);
        assertEq(bobShares, (50_000e18 * (supplyAtRoll + 1e3)) / (navAtRoll + 1));
    }

    function test_epoch_withdrawRequestNeverPaused() public {
        vm.prank(admin);
        predict.pause();
        vm.prank(lp);
        predict.requestWithdraw(1e18);
    }

    function test_epoch_skipsIdleEpochs() public {
        _warpTo(predict.epochEnd(1) + 5 days);
        predict.rollEpoch();
        assertEq(predict.currentEpoch(), 7);
    }

    // ───────────────────────── fuzz ─────────────────────────

    struct Pos {
        uint256 pid;
        uint32 lo;
        uint32 hi;
        uint256 qty;
    }

    /// @dev The tree's worst case equals a brute-force max over buckets, and the claimable total at
    ///      any settlement equals the sum of winning positions.
    function testFuzz_liabilityMatchesBruteForce(uint256 seed, uint256 settleOffset) public {
        uint64 id = _openMarket(1 hours);
        Pos[] memory ps = new Pos[](8);
        uint256[257] memory naive;
        for (uint256 i = 0; i < 8; ++i) {
            ps[i] = _randomMint(id, seed, i);
            if (ps[i].pid != 0) _addNaive(naive, id, ps[i]);
        }
        _checkTree(id, naive);
        _settleAndCheck(id, ps, 74_700 + (settleOffset % 600));
    }

    function _randomMint(uint64 id, uint256 seed, uint256 i) internal returns (Pos memory p) {
        (,,, uint32 minTick,,,,,) = predict.markets(id);
        uint256 r = uint256(keccak256(abi.encode(seed, i)));
        uint32 a = uint32(minTick + 100 + (r % 56));
        uint32 b = uint32(minTick + 100 + ((r >> 16) % 56));
        uint256 kind = (r >> 32) % 3;
        if (kind == 0) (p.lo, p.hi) = (0, a);
        else if (kind == 1) (p.lo, p.hi) = (a, POS_INF);
        else (p.lo, p.hi) = a < b ? (a, b) : (b, a == b ? a + 1 : a);
        p.qty = (1 + ((r >> 40) % 200)) * 1e18;
        (uint256 price,,) = predict.quote(id, p.lo, p.hi, p.qty);
        if (price < 10_000_000 || price > 990_000_000 || (p.qty * price) / F < 1e18) return p;
        p.pid = _mint(alice, id, p.lo, p.hi, p.qty);
    }

    function _addNaive(uint256[257] memory naive, uint64 id, Pos memory p) internal view {
        (,,, uint32 minTick,,,,,) = predict.markets(id);
        uint256 from = p.lo == 0 ? 0 : p.lo - minTick + 1;
        uint256 to = p.hi == POS_INF ? 256 : p.hi - minTick;
        for (uint256 k = from; k <= to; ++k) naive[k] += p.qty;
    }

    function _checkTree(uint64 id, uint256[257] memory naive) internal view {
        uint256 worst;
        for (uint256 k = 0; k < 257; ++k) {
            if (naive[k] > worst) worst = naive[k];
            assertEq(predict.liabilityAt(id, k), naive[k]);
        }
        assertEq(predict.liveMaxLiability(), worst);
    }

    function _settleAndCheck(uint64 id, Pos[] memory ps, uint256 settleUsd) internal {
        _warpTo(block.timestamp + 1 hours);
        _setSpot(settleUsd);
        predict.settle(id);
        uint256 expected;
        for (uint256 i = 0; i < ps.length; ++i) {
            if (ps[i].pid != 0 && predict.settlementInRange(ps[i].lo, ps[i].hi, settleUsd * F, TICK)) {
                expected += ps[i].qty;
            }
        }
        assertEq(predict.owedTotal(), expected);
        for (uint256 i = 0; i < ps.length; ++i) {
            if (ps[i].pid != 0) predict.claim(ps[i].pid);
        }
        assertEq(predict.owedTotal(), 0);
        _assertSolvent();
    }
}
