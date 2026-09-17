# Renqun contracts

Oracle-settled, SVI-priced BTC range digitals paid in MUSD, with an LP vault as counterparty.
The EVM counterpart of DeepBook Predict on Sui, which the design follows.
Full design notes and port status: [`../docs/MEZO_PORT.md`](../docs/MEZO_PORT.md).

```
src/
  YosukuPredict.sol            markets, mint/redeem, settle/claim, epoch-priced LP shares (yLP)
  lib/LiabilityTree.sol        per-market worst-case + exact payout per settlement bucket
  pricing/SviPricing.sol       port of DeepBook `pricing.move` (N(d2) with SVI skew)
  pricing/SviPricer.sol        linked library entry point (keeps YosukuPredict under EIP-170)
  math/FixedMath.sol           port of DeepBook `fixed_math` (1e9 ln/exp/Φ/φ/sqrt)
  interfaces/IMezoPriceOracle  Mezo BTC/USD precompile at 0x7b7c…0015
script/
  Deploy.s.sol                 testnet/mainnet deploy
  gen/gen_pricing_reference.py regenerates test/fixtures from DeepBook's reference data
test/
  FixedMath.t.sol              DeepBook math vectors within documented budgets
  SviPricingReference.t.sol    52 real Block Scholes points within DeepBook tolerances
  YosukuPredict.t.sol          lifecycle, boundaries, epochs, brute-force exposure fuzz
  YosukuPredictInvariant.t.sol solvency + accounting invariants
  fork/MezoMainnetFork.t.sol   real MUSD + real oracle price (opt-in, MEZO_FORK=1)
```

## Setup

```bash
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
forge test
MEZO_FORK=1 forge test --match-path 'test/fork/*' -vv
```

## Deploy

```bash
forge script script/Deploy.s.sol --rpc-url mezo_testnet --account <keystore> --broadcast \
  --verify --verifier blockscout --verifier-url https://api.explorer.test.mezo.org/api
```

Optional env: `ADMIN`, `KEEPER`, `TREASURY`, `EPOCH_LENGTH`. After deploying, run
`npm run mezo:abi` from the web root if the ABI changed, and start the keeper
(`npm run mezo:keeper`).

## Mezo notes

- Mezo precompiles are native code in `mezod`; local forks cannot execute them. Tests etch a
  stand-in at the oracle address, and the constructor takes the oracle's decimals instead of
  calling it, so deploy simulation works.
- `evm_version = "london"` follows Mezo's developer docs. The chain itself supports through Osaka.
- `PREVRANDAO` is always 0 and `SELFDESTRUCT` is disabled on Mezo; nothing here relies on either.

## Licensing

`FixedMath.sol` and `SviPricing.sol` are ports of Mysten Labs' DeepBook Predict (Apache-2.0) and
keep that license. The rest is MIT.
