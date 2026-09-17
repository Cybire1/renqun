// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {YosukuPredict} from "../../src/YosukuPredict.sol";
import {SviPricing} from "../../src/pricing/SviPricing.sol";
import {IMezoPriceOracle} from "../../src/interfaces/IMezoPriceOracle.sol";

/// @notice End-to-end against Mezo mainnet state: the real BTC/USD oracle precompile and real MUSD.
/// @dev Opt-in (network): `MEZO_FORK=1 forge test --match-path test/fork/*`.
///      Mezo precompiles are native Go code in mezod, so a local fork cannot execute them; the test
///      snapshots the precompile's live answer over RPC first, then etches a stand-in that serves it.
contract MezoMainnetForkTest is Test {
    uint256 constant F = 1e9;
    uint32 constant POS_INF = (1 << 30) - 1;

    address constant MUSD = 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186;
    address constant ORACLE = 0x7b7c000000000000000000000000000000000015;
    // MUSD Stability Pool: holds millions of MUSD, used here as a funding source on the fork.
    address constant MUSD_WHALE = 0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32;

    YosukuPredict predict;
    IERC20 musd = IERC20(MUSD);
    address keeper = makeAddr("keeper");
    address lp = makeAddr("lp");
    address trader = makeAddr("trader");

    bool enabled;
    int256 liveAnswer;
    uint256 liveUpdatedAt;

    function setUp() public {
        enabled = vm.envOr("MEZO_FORK", false);
        if (!enabled) return;
        vm.createSelectFork("mezo_mainnet");

        // Read the precompile's real answer via RPC (the fork EVM cannot run native precompiles).
        (liveAnswer, liveUpdatedAt) = _rpcOracle();
        console2.log("mezo oracle BTC/USD (1e18):", uint256(liveAnswer));
        console2.log("mezo oracle updatedAt:", liveUpdatedAt, "block.timestamp:", block.timestamp);
        vm.etch(ORACLE, address(new OracleStandIn()).code);
        OracleStandIn(ORACLE).set(liveAnswer, block.timestamp);

        predict = new YosukuPredict(
            musd,
            IMezoPriceOracle(ORACLE),
            18,
            address(this),
            uint64(block.timestamp),
            1 days,
            YosukuPredict.Config({
                treasury: address(0xFEE),
                volMaxAge: 300,
                spotMaxAge: 60,
                settleWindow: 60,
                feeRate: 10_000_000,
                minEntryPrice: 10_000_000,
                maxEntryPrice: 990_000_000,
                maxUtilization: 500_000_000,
                lotSize: 1e16,
                minPremium: 1e18,
                minDeposit: 10e18
            })
        );
        predict.grantRole(predict.KEEPER_ROLE(), keeper);

        vm.startPrank(MUSD_WHALE);
        musd.transfer(lp, 50_000e18);
        musd.transfer(trader, 5_000e18);
        vm.stopPrank();
        vm.prank(lp);
        musd.approve(address(predict), type(uint256).max);
        vm.prank(trader);
        musd.approve(address(predict), type(uint256).max);
    }

    function _rpcOracle() internal returns (int256 answer, uint256 updatedAt) {
        // latestRoundData() == 0xfeaf968c, executed by the real mezod node.
        bytes memory raw = vm.rpc(
            "eth_call", string.concat('[{"to":"', vm.toString(ORACLE), '","data":"0xfeaf968c"},"latest"]')
        );
        (, answer,, updatedAt,) = abi.decode(raw, (uint80, int256, uint256, uint256, uint80));
    }

    function test_fork_fullLifecycleOnRealMusd() public {
        if (!enabled) return;
        uint256 spotUsd = uint256(liveAnswer) / 1e18;
        assertGt(spotUsd, 10_000, "implausible BTC price");
        assertEq(predict.spotPrice(), uint256(liveAnswer) / F);

        // LP bootstraps the vault through a real epoch roll.
        vm.prank(lp);
        predict.requestDeposit(50_000e18);
        vm.warp(predict.epochEnd(0));
        OracleStandIn(ORACLE).set(liveAnswer, block.timestamp);
        predict.rollEpoch();
        vm.prank(lp);
        predict.claimDeposit(0);
        assertEq(predict.navAssets(), 50_000e18);

        // Keeper opens a 1h market on a $25 grid around live spot.
        vm.startPrank(keeper);
        uint64 id = predict.createMarketAtSpot(uint64(block.timestamp + 1 hours), 25e9);
        uint64 spot9 = uint64(uint256(liveAnswer) / F);
        predict.pushVol(
            id, spot9, spot9, uint64(block.timestamp),
            SviPricing.RawSVI(171_736, false, 7_449_196, -243_059_022, 1_133_202, 15_731_214)
        );
        vm.stopPrank();
        (,,, uint32 minTick,,,,,) = predict.markets(id);
        uint32 atm = uint32(uint256(spot9) / 25e9);
        assertEq(atm, minTick + 128);

        // Trader buys UP at the money with real MUSD.
        uint256 before = musd.balanceOf(trader);
        (uint256 price, uint256 premium, uint256 fee) = predict.quote(id, atm, POS_INF, 200e18);
        vm.prank(trader);
        uint256 pid = predict.mint(id, atm, POS_INF, 200e18, premium + fee);
        console2.log("ATM UP price (1e9):", price);
        console2.log("premium + fee (MUSD wei):", premium + fee);
        assertEq(before - musd.balanceOf(trader), premium + fee);

        // BTC settles $100 higher: the trader is paid 200 MUSD.
        vm.warp(block.timestamp + 1 hours);
        OracleStandIn(ORACLE).set(liveAnswer + 100e18, block.timestamp);
        predict.settle(id);
        vm.prank(trader);
        assertEq(predict.claim(pid), 200e18);
        assertEq(musd.balanceOf(address(predict)), 50_000e18 + premium - 200e18);
    }
}

/// @dev Serves a fixed latestRoundData on the precompile address inside the fork.
contract OracleStandIn is IMezoPriceOracle {
    int256 public answer;
    uint256 public updatedAt;

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function set(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 0);
    }
}
