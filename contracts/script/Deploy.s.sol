// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {YosukuPredict} from "../src/YosukuPredict.sol";
import {IMezoPriceOracle} from "../src/interfaces/IMezoPriceOracle.sol";

/// @notice Deploys YosukuPredict (and its linked SviPricer library) to Mezo.
///
///   Testnet:
///     forge script script/Deploy.s.sol --rpc-url mezo_testnet --account <keystore> --broadcast \
///       --verify --verifier blockscout --verifier-url https://api.explorer.test.mezo.org/api
///
/// Env (all optional except where noted):
///   ADMIN         admin / governance (default: broadcaster)
///   KEEPER        market + vol keeper (default: broadcaster)
///   TREASURY      fee recipient (default: the contract itself, i.e. fees accrue to LPs)
///   EPOCH_LENGTH  LP epoch in seconds (default: 6h on testnet, 1d on mainnet)
contract Deploy is Script {
    address constant ORACLE = 0x7b7c000000000000000000000000000000000015;
    address constant MUSD_MAINNET = 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186;
    address constant MUSD_TESTNET = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;

    function run() external returns (YosukuPredict predict) {
        bool mainnet = block.chainid == 31612;
        require(mainnet || block.chainid == 31611, "not a Mezo chain");
        address musd = mainnet ? MUSD_MAINNET : MUSD_TESTNET;

        vm.startBroadcast();
        address sender = msg.sender;
        address admin = vm.envOr("ADMIN", sender);
        address keeper = vm.envOr("KEEPER", sender);
        uint64 epochLength = uint64(vm.envOr("EPOCH_LENGTH", mainnet ? uint256(1 days) : uint256(6 hours)));

        // Align genesis to the epoch grid so epochs start on clean boundaries.
        uint64 genesis = uint64(block.timestamp - (block.timestamp % epochLength));

        YosukuPredict.Config memory cfg = YosukuPredict.Config({
            treasury: address(0), // patched below once the address is known
            volMaxAge: 120, // keeper republishes every ~30s
            spotMaxAge: 30, // Mezo blocks are ~3.9s; the precompile prints every block
            settleWindow: 60, // DeepBook's resolution period
            feeRate: 10_000_000, // 1%
            minEntryPrice: 10_000_000, // 1c
            maxEntryPrice: 990_000_000, // 99c
            maxUtilization: 500_000_000, // worst case <= 50% of LP capital
            lotSize: 1e16, // 0.01 MUSD, DeepBook's position lot
            minPremium: 1e18, // 1 MUSD, DeepBook's min_net_premium
            minDeposit: 10e18
        });
        address treasury = vm.envOr("TREASURY", address(0));
        cfg.treasury = treasury == address(0) ? sender : treasury;

        predict = new YosukuPredict(IERC20(musd), IMezoPriceOracle(ORACLE), 18, sender, genesis, epochLength, cfg);
        if (treasury == address(0)) {
            cfg.treasury = address(predict); // fees stay with LPs
            predict.setConfig(cfg);
        }
        predict.grantRole(predict.KEEPER_ROLE(), keeper);
        predict.grantRole(predict.PAUSER_ROLE(), admin);
        if (admin != sender) {
            predict.grantRole(predict.DEFAULT_ADMIN_ROLE(), admin);
            predict.renounceRole(predict.DEFAULT_ADMIN_ROLE(), sender);
        }
        vm.stopBroadcast();

        console2.log("YosukuPredict:", address(predict));
        console2.log("chain:", block.chainid, "MUSD:", musd);
        console2.log("admin:", admin, "keeper:", keeper);
        console2.log("genesis:", genesis, "epochLength:", epochLength);
    }
}
