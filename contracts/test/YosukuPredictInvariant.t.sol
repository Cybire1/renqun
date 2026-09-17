// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {YosukuPredictBase} from "./YosukuPredictBase.sol";
import {YosukuPredict} from "../src/YosukuPredict.sol";
import {MockMUSD} from "./mocks/MockMUSD.sol";
import {MockMezoOracle} from "./mocks/MockMezoOracle.sol";
import {SviPricing} from "../src/pricing/SviPricing.sol";

/// @notice Drives random trading, price, settlement and LP flows against the venue.
contract Handler is Test {
    uint32 internal constant POS_INF = (1 << 30) - 1;
    uint64 internal constant TICK = 10e9;

    YosukuPredict internal predict;
    MockMUSD internal musd;
    MockMezoOracle internal oracle;
    address internal keeper;
    address[3] internal actors;
    uint256[] internal openPositions;
    uint64[] internal markets;

    uint256 public mints;
    uint256 public redeems;
    uint256 public settles;
    uint256 public claims;
    uint256 public rolls;

    constructor(YosukuPredict p, MockMUSD m, MockMezoOracle o, address k, address[3] memory a) {
        (predict, musd, oracle, keeper, actors) = (p, m, o, k, a);
    }

    function _spot() internal view returns (uint256) {
        return uint256(oracle.answer()) / 1e18;
    }

    function openMarket(uint256 ttlSeed) external {
        uint256 end = predict.epochEnd(predict.currentEpoch());
        if (block.timestamp >= end) return;
        uint256 ttl = bound(ttlSeed, 60, 2 hours);
        if (block.timestamp + ttl > end) return;
        vm.startPrank(keeper);
        uint64 id = predict.createMarketAtSpot(uint64(block.timestamp + ttl), TICK);
        predict.pushVol(id, uint64(_spot() * 1e9), uint64(_spot() * 1e9), uint64(block.timestamp), _surface());
        vm.stopPrank();
        markets.push(id);
    }

    function mint(uint256 actorSeed, uint256 marketSeed, uint256 shapeSeed, uint256 qtySeed) external {
        uint64 id = _liveMarket(marketSeed);
        if (id == 0) return;
        (,,, uint32 minTick,,,,,) = predict.markets(id);
        _refreshVol(id);
        uint32 a = uint32(minTick + 80 + (shapeSeed % 96));
        uint32 b = uint32(minTick + 80 + ((shapeSeed >> 8) % 96));
        uint32 lo;
        uint32 hi;
        if (shapeSeed % 3 == 0) (lo, hi) = (0, a);
        else if (shapeSeed % 3 == 1) (lo, hi) = (a, POS_INF);
        else if (a < b) (lo, hi) = (a, b);
        else (lo, hi) = (b, a == b ? a + 1 : a);
        uint256 qty = bound(qtySeed, 1, 5_000) * 1e18;
        try predict.quote(id, lo, hi, qty) returns (uint256 price, uint256, uint256) {
            if (price < 10_000_000 || price > 990_000_000) return;
        } catch {
            return;
        }
        address who = actors[actorSeed % 3];
        vm.prank(who);
        try predict.mint(id, lo, hi, qty, type(uint256).max) returns (uint256 pid) {
            openPositions.push(pid);
            mints++;
        } catch {}
    }

    function redeem(uint256 posSeed) external {
        if (openPositions.length == 0) return;
        uint256 pid = openPositions[posSeed % openPositions.length];
        (address owner, uint64 id,,, bool open,,) = predict.positions(pid);
        (uint64 expiry,,,, YosukuPredict.Status status,,,,) = predict.markets(id);
        if (!open || status != YosukuPredict.Status.Live || block.timestamp >= expiry) return;
        _refreshVol(id);
        vm.prank(owner);
        try predict.redeem(pid, 0) {
            redeems++;
        } catch {}
    }

    function moveSpot(uint256 bps) external {
        uint256 s = _spot();
        uint256 delta = (s * bound(bps, 0, 150)) / 10_000;
        uint256 next = bps % 2 == 0 ? s + delta : s - delta;
        oracle.set(next, block.timestamp);
    }

    function passTime(uint256 secs) external {
        // Mostly short steps so markets get traded; one in four jumps far enough to end epochs.
        uint256 step = secs % 4 == 0 ? bound(secs, 1, 8 hours) : bound(secs, 1, 10 minutes);
        vm.warp(block.timestamp + step);
        oracle.set(_spot(), block.timestamp);
    }

    function settleAll() external {
        for (uint256 i = 0; i < markets.length; ++i) {
            (uint64 expiry,,,, YosukuPredict.Status status,,,,) = predict.markets(markets[i]);
            if (status == YosukuPredict.Status.Live && block.timestamp >= expiry) {
                try predict.settle(markets[i]) {
                    settles++;
                } catch {}
            }
        }
    }

    function claimSome(uint256 posSeed) external {
        if (openPositions.length == 0) return;
        uint256 idx = posSeed % openPositions.length;
        try predict.claim(openPositions[idx]) {
            claims++;
            openPositions[idx] = openPositions[openPositions.length - 1];
            openPositions.pop();
        } catch {}
    }

    function deposit(uint256 actorSeed, uint256 amount) external {
        vm.prank(actors[actorSeed % 3]);
        try predict.requestDeposit(bound(amount, 10, 200_000) * 1e18) {} catch {}
    }

    function withdraw(uint256 actorSeed, uint256 fraction) external {
        address who = actors[actorSeed % 3];
        uint256 shares = (predict.balanceOf(who) * bound(fraction, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(who);
        predict.requestWithdraw(shares);
    }

    function roll() external {
        uint64 epoch = predict.currentEpoch();
        if (block.timestamp < predict.epochEnd(epoch)) return;
        for (uint256 i = 0; i < markets.length; ++i) {
            (uint64 expiry,,,, YosukuPredict.Status status,,,,) = predict.markets(markets[i]);
            if (status == YosukuPredict.Status.Live && block.timestamp >= expiry) {
                try predict.settle(markets[i]) {} catch {}
            }
        }
        try predict.rollEpoch() {
            rolls++;
            for (uint256 i = 0; i < 3; ++i) {
                vm.startPrank(actors[i]);
                try predict.claimDeposit(epoch) {} catch {}
                try predict.claimWithdraw(epoch) {} catch {}
                vm.stopPrank();
            }
        } catch {}
    }

    /// @dev A live, unexpired market, preferring recent ones; 0 if none.
    function _liveMarket(uint256 seed) internal view returns (uint64) {
        uint256 n = markets.length;
        for (uint256 i = 0; i < n && i < 6; ++i) {
            uint64 id = markets[n - 1 - (((seed % 6) + i) % (n < 6 ? n : 6))];
            (uint64 expiry,,,, YosukuPredict.Status status,,,,) = predict.markets(id);
            if (status == YosukuPredict.Status.Live && block.timestamp < expiry) return id;
        }
        return 0;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function marketAt(uint256 i) external view returns (uint64) {
        return markets[i];
    }

    function _refreshVol(uint64 id) internal {
        vm.prank(keeper);
        try predict.pushVol(id, uint64(_spot() * 1e9), uint64(_spot() * 1e9), uint64(block.timestamp), _surface()) {}
        catch {}
    }

    function _surface() internal pure returns (SviPricing.RawSVI memory) {
        return SviPricing.RawSVI(171_736, false, 7_449_196, -243_059_022, 1_133_202, 15_731_214);
    }
}

contract YosukuPredictInvariantTest is YosukuPredictBase {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        _seedLiquidity(250_000e18);
        handler = new Handler(predict, musd, oracle, keeper, [lp, alice, bob]);
        targetContract(address(handler));
    }

    /// @dev Every obligation is covered at its worst case, at every step.
    function invariant_solvent() public view {
        _assertSolvent();
    }

    /// @dev Live exposure is exactly the sum of live markets' worst cases, and owed is the sum of
    ///      settled markets' unclaimed payouts.
    function invariant_accountingSumsMatch() public view {
        uint256 live;
        uint256 owed;
        for (uint256 i = 0; i < handler.marketCount(); ++i) {
            (,,,, YosukuPredict.Status status,, uint128 maxLiability,, uint128 marketOwed) =
                predict.markets(handler.marketAt(i));
            if (status == YosukuPredict.Status.Live) live += maxLiability;
            else owed += marketOwed;
        }
        assertEq(predict.liveMaxLiability(), live, "live exposure drift");
        assertEq(predict.owedTotal(), owed, "owed drift");
    }

    /// @dev Worst-case exposure never exceeds LP capital.
    function invariant_exposureWithinCapital() public view {
        assertLe(predict.liveMaxLiability(), predict.navAssets());
    }

    function afterInvariant() external view {
        console2.log("markets", handler.marketCount(), "mints", handler.mints());
        console2.log("redeems", handler.redeems(), "settles", handler.settles());
        console2.log("claims", handler.claims(), "rolls", handler.rolls());
    }
}
