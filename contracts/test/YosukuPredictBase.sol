// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {YosukuPredict} from "../src/YosukuPredict.sol";
import {SviPricing} from "../src/pricing/SviPricing.sol";
import {IMezoPriceOracle} from "../src/interfaces/IMezoPriceOracle.sol";
import {MockMUSD} from "./mocks/MockMUSD.sol";
import {MockMezoOracle} from "./mocks/MockMezoOracle.sol";

abstract contract YosukuPredictBase is Test {
    uint256 internal constant F = 1e9;
    uint256 internal constant START = 1_789_560_000; // 2026-09-16
    uint64 internal constant EPOCH = 1 days;
    uint64 internal constant TICK = 10e9; // $10 grid
    uint256 internal constant SPOT_USD = 75_000;

    YosukuPredict internal predict;
    MockMUSD internal musd;
    MockMezoOracle internal oracle;

    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal lp = makeAddr("lp");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function _config() internal view returns (YosukuPredict.Config memory) {
        return YosukuPredict.Config({
            treasury: treasury,
            volMaxAge: 300,
            spotMaxAge: 60,
            settleWindow: 60,
            feeRate: 10_000_000, // 1%
            minEntryPrice: 10_000_000, // 1c
            maxEntryPrice: 990_000_000, // 99c
            maxUtilization: 500_000_000, // 50%
            lotSize: 1e16, // 0.01 MUSD
            minPremium: 1e18, // 1 MUSD, DeepBook's min_net_premium
            minDeposit: 10e18
        });
    }

    /// @dev Real Block Scholes BTC surface (DeepBook reference scenario 0, 2026-05-27).
    function _surface() internal pure returns (SviPricing.RawSVI memory) {
        return SviPricing.RawSVI({
            aMagnitude: 171_736,
            aNegative: false,
            b: 7_449_196,
            rho: -243_059_022,
            m: 1_133_202,
            sigma: 15_731_214
        });
    }

    function setUp() public virtual {
        vm.warp(START);
        musd = new MockMUSD();
        oracle = new MockMezoOracle();
        oracle.set(SPOT_USD, block.timestamp);
        predict = new YosukuPredict(musd, IMezoPriceOracle(address(oracle)), 18, admin, uint64(START), EPOCH, _config());
        vm.startPrank(admin);
        predict.grantRole(predict.KEEPER_ROLE(), keeper);
        predict.grantRole(predict.PAUSER_ROLE(), admin);
        vm.stopPrank();

        for (uint256 i = 0; i < 3; ++i) {
            address u = [lp, alice, bob][i];
            musd.mint(u, 10_000_000e18);
            vm.prank(u);
            musd.approve(address(predict), type(uint256).max);
        }
    }

    // ── helpers ──

    /// @dev LP funds the vault and the first epoch rolls so capital is live.
    function _seedLiquidity(uint256 assets) internal {
        vm.prank(lp);
        predict.requestDeposit(assets);
        uint64 epoch = predict.currentEpoch();
        _warpTo(predict.epochEnd(epoch));
        predict.rollEpoch();
        vm.prank(lp);
        predict.claimDeposit(epoch);
    }

    function _warpTo(uint256 t) internal {
        vm.warp(t);
        oracle.set(uint256(oracle.answer()) / 1e18, t);
    }

    function _setSpot(uint256 usd) internal {
        oracle.set(usd, block.timestamp);
    }

    function _openMarket(uint256 ttl) internal returns (uint64 id) {
        vm.startPrank(keeper);
        id = predict.createMarketAtSpot(uint64(block.timestamp + ttl), TICK);
        predict.pushVol(id, uint64(SPOT_USD * F), uint64(SPOT_USD * F), uint64(block.timestamp), _surface());
        vm.stopPrank();
    }

    function _atmTick(uint64 id) internal view returns (uint32) {
        (,,, uint32 minTick,,,,,) = predict.markets(id);
        return minTick + 128;
    }

    function _mint(address who, uint64 id, uint32 lo, uint32 hi, uint256 qty) internal returns (uint256 pid) {
        vm.prank(who);
        pid = predict.mint(id, lo, hi, qty, type(uint256).max);
    }

    /// @dev Solvency: the contract always holds every obligation at its worst case.
    function _assertSolvent() internal view {
        uint256 bal = musd.balanceOf(address(predict));
        uint256 obligations = predict.pendingDepositAssets() + predict.reservedWithdrawalAssets()
            + predict.owedTotal() + predict.liveMaxLiability();
        assertGe(bal, obligations, "insolvent");
    }
}
