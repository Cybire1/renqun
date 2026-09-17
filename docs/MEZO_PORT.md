# Renqun on Mezo: design and status

Renqun sells short Bitcoin rounds on Mezo, paid in MUSD. The venue follows **DeepBook Predict** on
Sui: rolling BTC expiry markets that sell SVI-priced range digitals against an LP vault, settled by
oracle. Mezo has no such venue, so this repo brings it: contracts, keeper, starter drip, a web
client and the Renqun app. This document tracks what exists, what was verified, and what is left.
Started 2026-09-16.

---

## 1. Status

| Layer | State | Where |
|---|---|---|
| Fixed-point math (`fixed_math::math`, `i64`) | **Done**, ported line-for-line | `contracts/src/math/FixedMath.sol` |
| SVI pricing (`pricing.move`) | **Done**, parity-tested | `contracts/src/pricing/SviPricing.sol`, `SviPricer.sol` |
| Venue: markets, range digitals, settlement, LP vault | **Done (v1)** | `contracts/src/YosukuPredict.sol` |
| Exposure index (`strike_payout_tree` analog) | **Done** | `contracts/src/lib/LiabilityTree.sol` |
| Deploy script (testnet/mainnet) | **Done**, simulated against live testnet | `contracts/script/Deploy.s.sol` |
| Keeper (markets, vol, settle, epochs) | **Done (v1)**, running against testnet (5-minute, hourly, and one "later today" round per pool epoch) | `services/keeper/keeper.mjs` |
| Starter drip (gas for every player, test MUSD on testnet) | **Done (v1)**, running against testnet; mainnet needs attestation | `services/drip/drip.mjs` |
| Shared client (`@renqun/client`) | **Done** | `client/`: network, venue reads and tx builders, formatting, drip client |
| Web app (wallet, markets, ticket, portfolio, Earn, Add MUSD) | **Done (v1)**, tested end to end on testnet | `web/`; see §6 |
| Mobile (Expo) | **Done (v1)**: markets, bet sheet, Add MUSD (drip, Tigris swap, MetaMask), portfolio, wallet + Earn, settings; gas covered by the drip; tested end-to-end on testnet | `mobile/`; see §7 |
| Testnet deployment | **Live and funded**: `YosukuPredict` `0x85c9A910143A4814346132d93F221DE3FCF6536a` (verified), 1,500 MUSD in the pool | §3a |
| Audit | Not started | required by the Founder Program listing bar |

### Test evidence (`npm run contracts:test`)

- **56 tests pass** (unit, fuzz, stateful invariant).
- **Pricing parity:** all 52 of DeepBook's reference points (real Block Scholes SVI rows,
  2026-05-27) land inside DeepBook's own per-point tolerance. Worst deviation: **608 units of
  1e9**, versus DeepBook's documented worst case of 3,304.
- **Exposure tree:** 512 fuzz runs match a brute-force max over all 257 buckets, and settlement
  owes exactly the sum of winning positions.
- **Invariants** (64 runs × 200 calls, reverts fatal): solvency, exposure ≤ LP capital,
  `liveMaxLiability` and `owedTotal` equal their per-market sums.
- **Mainnet fork** (`MEZO_FORK=1`): real MUSD, real oracle price (read over RPC). LP bootstrap →
  market → mint → settle → claim.
- **Local testnet fork, full stack:** real `Deploy.s.sol`, real testnet MUSD, keeper opening
  markets with live Deribit DVOL, a trader buying ATM UP (P = 0.4998, paid 50.48 MUSD), keeper
  settling, trader claiming 100 MUSD. Vault NAV reconciled to the wei.
- **Live testnet, app code** (2026-09-16): the mobile app's own `lib/mezo` client and wallet,
  run under Node against Mezo testnet with a fresh wallet. It read 36 oracle prints of history,
  found the keeper's 5-minute and hourly rounds, priced UP + DOWN to a sum of 1.0000, approved
  MUSD, had a 1-wei max cost refused with the app's "The price moved" copy, bet UP and DOWN, cashed
  one out, queued a 10 MUSD pool deposit, then after settlement agreed with the contract's
  `settlementInRange` on both bets and claimed exactly the 3.64 MUSD it showed.

---

## 2. How DeepBook Predict maps onto Mezo

| Sui / DeepBook Predict | Mezo |
|---|---|
| `expiry_market` (rolling 1m/5m/1h markets) | `YosukuPredict.markets`, opened by the keeper |
| range digitals `(lower, higher]`, tick 0 / `pos_inf_tick` sentinels | same semantics, same sentinels (`POS_INF_TICK = 2^30-1`) |
| `pricing::compute_nd2` (SVI → N(d2) with skew term) | `SviPricing.computeNd2`, bit-level port |
| Block Scholes SVI + forward feeds | `pushVol` by `KEEPER_ROLE` |
| Pyth spot re-anchoring the forward | Mezo oracle precompile `0x7b7c…0015` re-anchors the forward on every read |
| PLP vault (counterparty) | LP shares (`yLP`) on the same contract, epoch-priced |
| `strike_payout_tree` (NAV walk) | `LiabilityTree` (worst case + exact payout per bucket) |
| DUSDC (6 dp), lot 0.01 | MUSD (18 dp), lot 0.01 MUSD |
| `min_net_premium` 1 DUSDC | `minPremium` 1 MUSD |
| resolution period 1 min | `settleWindow` 60 s |
| AccountWrapper + Auth hot-potato | plain ERC-20 approve + `mint` |
| sponsored gas (Enoki / Onara) | not yet; Mezo gas is ~$0.002/tx in BTC (see §8) |

### Later-today rounds and yes/no questions (2026-09-17)

The keeper opens one round per pool epoch that closes when the epoch ends (18:00 UTC is the next on
testnet's 6-hour epochs; midnight UTC on mainnet's daily ones), on a $50 grid (±$6,400). A market
cannot outlive its epoch (`_createMarket` requires `expiry <= epochEnd`), so questions days ahead
need a contract change. Clients classify rounds by grid size: $10 → 5-minute, $25 → hourly,
$50 → later today (`cadenceOf`). Each later-today round carries several questions at round-number
prices near spot (`questionLines`): Yes buys `(tick, +∞)`, No buys `(0, tick]`, priced by
`rangePriceOf` like any range. Rounds closing in the same second (5-minute, hourly and later
today at an epoch end) now settle in parallel so all three land inside the 60 s window.

### Deliberate deviations from DeepBook

1. **Bounded strike grid.** Each market has 256 ticks centred on spot at creation (5m: $10 grid
   = ±$1,280; 1h: $25 grid = ±$3,200). Out-of-grid strikes are only reachable as ±∞. This keeps
   the exposure tree fixed-size and O(log n).
2. **Epoch-priced LP instead of mark-to-market NAV.** Deposits and withdrawals queue during an
   epoch and are priced at the roll, when every market in that epoch is settled. Share price is
   computed with zero open risk, so no on-chain NAV walk is needed. Cost: LPs wait up to one epoch.
3. **Worst-case solvency.** A mint is refused if Σ(live markets' worst-case payout) would exceed
   `maxUtilization` (50%) of LP capital. A redeem is refused if it would exceed 100%.
4. **Settlement from the native oracle.** The first print at or after expiry within 60 s settles
   the market; after that the market voids and premiums refund. The precompile has no history,
   so this is a first-caller rule, not an exact-timestamp read (see §8).
5. **v1 volatility is flat.** The keeper publishes `a = (DVOL/100)² × τ`, `b = 0` from Deribit's
   DVOL. The contract accepts full SVI; only the keeper's source is simple.
6. **Not ported yet:** leverage (liquidation book), builder codes, parlays, private bets, the
   agent/copy-trading vaults (`vault624`, `social_vault`), Nautilus attestation.

---

## 3. Verified Mezo facts (2026-09-16)

| Fact | Value | How verified |
|---|---|---|
| Chain IDs | testnet 31611, mainnet 31612 (`0x7b7c`) | `eth_chainId` |
| MUSD | testnet `0x1189…c503`, mainnet `0xdD46…F186`, 18 dp | docs + on-chain transfers |
| BTC/USD oracle | `0x7b7c000000000000000000000000000000000015`, 18 dp, fresh every block | `latestRoundData()` on both nets |
| Pyth on Mezo | present, but stored BTC price is **61 days stale** (mainnet) | `getPriceUnsafe` |
| viem `mezo` chain | default RPC `rpc.mezo.org` **does not answer** | curl; overridden in `lib/mezo/network.ts` |
| Working mainnet RPCs | Boar, Validation Cloud | `eth_chainId` |
| CREATE2 factory `0x4e59…956C` | deployed on both nets | `eth_getCode` |
| Block gas limit | 10M; our largest deploy tx is 6.26M | mezod genesis, forge simulation |
| Precompiles in local forks | native Go, **not executable** by anvil/forge | hence decimals passed to the constructor, oracle etched in tests |
| `evm_version` | docs say London; chain runs through Osaka | mezod `docs/evm-compatibility.md` |
| Block time | ~4 s | block timestamps |
| Gas price | testnet 146 wei; mainnet 1,462,500 wei (0.0015 gwei) | `eth_gasPrice` |
| Gas refund | a tx is charged at least **half its gas limit** (a 250k-limit approve reported 125k used) | receipts |
| Multicall3 | `0xcA11bde0…CA11` on testnet (also in viem's chain config) | `eth_getCode` |
| Historical `eth_call` | works on the public testnet RPC (oracle read 1,000 blocks back) | `cast call --block` |

### Public RPC quirks (testnet, 2026-09-16) and how the code handles them

| Quirk | Seen as | Handling |
|---|---|---|
| `eth_getLogs` span capped at 10,000 blocks (~11 h) | `maximum [from, to] blocks distance: 10000` | explorer-first, paged scans in `scanEvents` (`client/venue.ts` and the app) |
| Gas estimates disagree between nodes, sometimes below the EIP-7623 calldata floor | `gas limit below EIP-7623 floor: 21416 < 22040`; the same call estimated 67,356 elsewhere | padded estimate with a per-call floor (keeper 300k; app per function, see `TxRequest.gasFloor`) |
| Load-balanced nodes lag each other by a few seconds | pending nonce reads stale (`Missing or invalid parameters`); a mined tx's receipt returns null from one node, so viem's `waitForTransactionReceipt` throws on a tx that landed | keeper counts nonces locally and resets on failure; both keeper and app poll receipts and treat "not found" as "not yet" |
| Occasional connection resets | `fetch failed` | viem transport retries; the keeper's next loop retries |
| A keeper pass can take ~40 s, against a 60 s settle window | one dropped settle request voided market #33 (it had no bets, so nothing was refunded) | keeper settles at the start of every pass and before every other transaction, retries a failed settle every 3 s, and idles 5 s between passes |
| Short rounds reprice fast | a 16% UP moved 7% in ten seconds; a 2% cash-out bound reverted with `Slippage()`; a 44¢ side near 50/50 moves ~5¢ on one oracle tick, so a flat 3% bound failed often | app re-prices at the tap, bounds the move at 3¢ per MUSD of payout (kept within 3–12% of a bet's quote, 5–15% of a cash-out) and re-quotes and resends up to twice on `Slippage()` or a mined revert (`maxCostFor`, `quoteCashOut`, `isPriceMove`). On 2026-09-17 an in-app 9 MUSD bet quoted 8.97 was charged 9.58: inside the new bound, a failure under the old one |
| The iOS simulator cannot reach `rpc.test.mezo.org` (HTTP/3, `-1009`); free fallbacks cap logs at ~100 blocks and batches at 3 | `HTTP request failed` on every read | app transport falls back to dRPC with batches of 3; position scans ask the Blockscout API first (`module=logs`, full range in one call) and page the RPC with a span that shrinks on any failure |

### MUSD on testnet (from `@mezo-org/musd-contracts` 1.1.0, `deployments/matsnet`)

BorrowerOperations `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`, TroveManager
`0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`, HintHelpers `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6`,
SortedTroves `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA`, PriceFeed `0x86bCF0841622a5dAC14A313a15f96A95421b9366`.
Minimum net debt 1,800 MUSD, borrowing fee 0.1%, 200 MUSD gas deposit. The faucet gives BTC only, so
testnet MUSD comes from `openTrove(debt, upperHint, lowerHint){value: btc}`.

---

## 3a. Testnet deployment (2026-09-16)

| | |
|---|---|
| YosukuPredict | [`0x85c9A910143A4814346132d93F221DE3FCF6536a`](https://explorer.test.mezo.org/address/0x85c9A910143A4814346132d93F221DE3FCF6536a) — source verified |
| SviPricer (linked library) | [`0x79E6362988479EE786Ad255Af97b89F4E3Ef9D81`](https://explorer.test.mezo.org/address/0x79E6362988479EE786Ad255Af97b89F4E3Ef9D81) — Blockscout could not verify the CREATE2-deployed library; on-chain bytecode matches the build byte-for-byte apart from its embedded self-address |
| Deploy tx | `0x2abe4d23e6a423e8d0e6981ea1cf3eceade6487b68a7b2b1d18f4c52d1a0d900` (block 15572175) |
| Deployer / admin / keeper | `0x69e3e267BF87089fdC7eb62fd86c8E73535e2034` (keystore `yosuku-mezo-deployer`, testnet only) |
| Epoch | 6 h, genesis 1789560000 |
| Fees | accrue to LPs (treasury = the contract) |
| Live check | `spotPrice()` returned $75,886.29 from Mezo's real oracle precompile on chain |
| Vault liquidity | 1,500 MUSD from the deployer (trove: 0.045 BTC collateral, 1,800 MUSD borrowed, tx `0x7aeb0d99…5c1f`), rolled in at epoch 0; the deployer holds the 1.5M yLP shares. 300 more MUSD borrowed for the drip on 2026-09-17 (tx `0xb4a5effe…5e01`): debt ~2,302 MUSD, ratio 149% at $76,175, liquidated below 110% (BTC ≈ $56k) |
| Keeper | running from the dev machine with the deployer key (logs outside the repo). Move it to a server before anyone relies on it |
| Starter drip | `services/drip/drip.mjs` on the dev machine (`:8787`, logs outside the repo), own key `yosuku-mezo-drip` (`0xd97DeA519490E481B335513E6ACe01E25Cfd5063`). Sends 0.00002 BTC gas when a wallet holds under 0.000005 BTC (3 top-ups a wallet a day) and 20 test MUSD once per wallet; 50 new wallets a day, 5 per IP. Refilled 2026-09-17 to 420 test MUSD and 0.00144 BTC, enough for 21 new players (gas for 72 top-ups). Top it up before sharing a build widely. The deployer also runs the keeper, so send deployer transactions mid-round with an explicit nonce |

## 4. Contract reference (`YosukuPredict`)

| Role | Calls |
|---|---|
| Trader | `quote`, `mint`, `quoteRedeem`, `redeem`, `claim`, `claimMany` |
| Anyone | `settle`, `rollEpoch` |
| LP | `requestDeposit`, `requestWithdraw`, `claimDeposit`, `claimWithdraw` |
| `KEEPER_ROLE` | `createMarket`, `createMarketAtSpot`, `pushVol` |
| `PAUSER_ROLE` | `pause` (blocks mint/redeem/deposit; never withdraw, settle, or claim) |
| Admin | `setConfig`, `unpause`, role management |

Default config (Deploy.s.sol): vol max age 120 s, spot max age 30 s, settle window 60 s, fee 1%,
entry price band 1¢–99¢, max utilization 50%, lot 0.01 MUSD, min premium 1 MUSD, min LP deposit
10 MUSD, epoch 6 h (testnet) / 1 day (mainnet). Fees go to the contract (LPs) unless `TREASURY`
is set.

---

## 5. Running it

```bash
npm install                                  # root: viem for the keeper, drip and client

# contracts
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git   # first time
forge test                                   # 56 tests (or: npm run contracts:test from the root)
MEZO_FORK=1 forge test --match-path 'test/fork/*' -vv

# deploy to testnet (needs a keystore funded from https://faucet.test.mezo.org)
forge script script/Deploy.s.sol --rpc-url mezo_testnet --account <name> --broadcast \
  --verify --verifier blockscout --verifier-url https://api.explorer.test.mezo.org/api

# keeper (holds KEEPER_ROLE, a little BTC for gas)
YOSUKU_MEZO_PREDICT=<address> KEEPER_PRIVATE_KEY=<key> npm run keeper
# single pass for cron schedulers: KEEPER_ONCE=1

# starter drip (its own funded key; the app calls it for gas and, on testnet, 20 test MUSD)
DRIP_PRIVATE_KEY=<key> MEZO_NETWORK=testnet npm run drip      # :8787, POST /drip {address}, GET /health
# mainnet refuses to start without DRIP_API_KEY; put device attestation in front of it

# regenerate the ABI after contract changes (writes client/abi and mobile/lib/mezo/abi.ts)
npm run abi

# the app
cd mobile && npm install
EXPO_PUBLIC_MEZO_NETWORK=testnet  # optional overrides: EXPO_PUBLIC_MEZO_RPC_URL,
                                  # EXPO_PUBLIC_YOSUKU_MEZO_PREDICT, EXPO_PUBLIC_YOSUKU_MEZO_DEPLOY_BLOCK
EXPO_PUBLIC_MEZO_DRIP_URL=https://…   # dev builds default to http://localhost:8787; release builds
                                      # without it fall back to "needs BTC for gas"
npx expo run:ios                      # first native build; then npx expo start
```

---

## 6. The Renqun web app (`web/`, v1)

A Next.js 16 app on the shared client `@renqun/client` (`client/`, an npm workspace compiled by
Next). Every page is static; all data comes from Mezo in the browser.

| Piece | File | Notes |
|---|---|---|
| Shared client | `client/` | the app's tested Mezo logic (`venue.ts`, `network.ts`, `format.ts`, `funding.ts`) with browser storage (`storage.ts`) and `NEXT_PUBLIC_*` settings |
| Wallets | `web/lib/wallet.tsx` | EIP-6963 discovery (any installed EVM wallet, with its own name and icon; `window.ethereum` as a fallback), silent reconnect, switch to Mezo and add the network when the wallet has never seen it (4902), sends with the same simulate → padded gas → receipt polling as the app; on testnet a wallet with no gas asks the drip |
| Live data | `web/lib/hooks.ts` | polling that pauses in background tabs, one refresh for everything after a transaction |
| Just ask | `web/components/WordMarkets.tsx` | plain yes/no questions ("Will Bitcoin be above $77,000 at 7:00 PM?") at round-number prices near spot on the later-today round; Yes is the range above the price, No at or below it; a pick opens the ticket in a dialog |
| Markets | `web/components/Markets.tsx`, `Chart.tsx` | 5 min / 1 hour, the round's question, live oracle price, SVG chart green above the Up line and grey below, progress, just-closed result, last rounds, up next |
| Ticket | `web/components/Ticket.tsx` | the app's rules: fresh quote, entry band, pool capacity, 30 s cutoff, 3¢ price-move bound with two re-quotes, confirmation from the `Minted` event; a first bet asks the wallet to allow MUSD, then to bet |
| Portfolio | `web/components/Portfolio.tsx` | in play, could pay, collect all, open (winning/behind, cash out) and settled rows |
| Earn | `web/components/Earn.tsx` | pool, your share, risk against its limit, next update, deposit / withdraw requests and collecting them; pool numbers show without a wallet |
| Add MUSD | `web/components/FundsDialog.tsx` | free test MUSD, BTC → MUSD on Tigris, send from another wallet, borrow link |
| Brand | `web/app/icon.svg`, `apple-icon.png`, `opengraph-image.png`, `web/components/RenqunMark.tsx` | the Renqun mark and name, same geometry as the app |

Verified 2026-09-17 in headless Chromium against live testnet, with an injected EIP-6963 wallet
signing for a test key: connect, a 5 MUSD Down bet shown as placed in 3.8 s and confirmed in 5.6 s,
the bet in Portfolio with a live cash-out, Earn with the wallet's pool share, and a 0.0002 BTC →
15.75 MUSD swap from Add MUSD (allow + swap in 19.4 s). No page errors; `next build` prerenders
every page. Bitcoin wallets (Xverse, Unisat) need Mezo Passport, which is not wired in yet.

Hosted on Vercel at https://renqun.app (team `cybire`, project `renqun`, root directory `web`;
`.vercelignore` uploads only the web app and the shared client). The project is connected to the
GitHub repo, so every push to `main` deploys. The same browser test passed against it on
2026-09-17: a 5 MUSD bet placed in 3.8 s and confirmed in 8.1 s.

The starter drip also runs there, at `/api/drip` (`web/app/api/drip/route.ts`, testnet only, env
`DRIP_PRIVATE_KEY` as a Vercel secret and `NEXT_PUBLIC_MEZO_DRIP_URL=/api`). A serverless function
keeps no state file, so it reads history through the explorer: a wallet gets 20 test MUSD if the
drip wallet has never sent it MUSD, gas when it holds under 0.000005 BTC (three top-ups a day), and
the day stops at 50 wallets. Sends go out from the pending nonce with one retry on a nonce clash
(the local drip shares the wallet). The app's testnet builds use it by default. Tested 2026-09-17: a
fresh wallet got 0.00002 BTC and 20 MUSD in 2.8 s; a repeat sent nothing.

## 7. The Renqun app (`mobile/`, v1)

An Expo (SDK 54) app that trades the venue from a wallet made on the phone. Paths below are
relative to `mobile/`.

| Piece | File | Notes |
|---|---|---|
| Network, venue | `lib/mezo/network.ts` | same addresses as `client/network.ts`, RPC fallbacks, explorer API, DEX and drip URLs |
| Contract client | `lib/mezo/client.ts` | markets (UP line = grid centre = BTC at open), oracle history read at past blocks, `quoteStake` (largest lot that fits the stake, priced by the contract), positions with win/claim/cash-out state, vault, tx builders with gas floors, friendly errors |
| Wallet | `lib/mezo/wallet.ts` | per-device secp256k1 key in Keychain (this device only), backup/restore/reset, local nonce counting, `sendTx` = simulate → padded gas → gas top-up from the drip if short → send → receipt poll; `broadcastTx` sends without waiting so a first bet's approval and bet go out back to back (same block) |
| Funding | `lib/mezo/funding.ts` | drip client (one request at a time, remembers when a wallet has had its test MUSD), MetaMask deep link to a prefilled MUSD transfer on Mezo |
| Live data | `lib/mezo/hooks.ts` | focus- and app-state-aware polling, `refreshMezo()` after a tx |
| Skin | `lib/mezo/theme.ts` | canvas palette and contrast rules |
| Brand | `components/RenqunMark.tsx`, `scripts/renqun-icons.cjs`, `app.json` | the Mezo app is named **Renqun** (人群, "crowd"). The mark is three 人 stacked into 众 with a red head; the script renders the iOS icon, splash and Android icons from the same geometry. Storage keys and the bundle id keep their earlier names so existing test installs and wallets carry over. Design sources: `design/renqun-logo` |
| Just ask | `components/mezo/JustAsk.tsx`, `app/mezo/bet.tsx` (`line`, `lineUsd` params) | the same yes/no questions on Markets; the bet sheet shows the question and Yes / No |
| Tab bar | `components/mezo/MezoTabBar.tsx` | white dock with four tabs (the open one widens into a sand pill with its name) and the red bet button beside it, ringed by the current 5-minute round's countdown |
| Markets tab | `components/mezo/MarketsScreen.tsx` | 5 min / 1 hour, live chart from Mezo's oracle, odds, UP / DOWN, last result, up next |
| Bet sheet | `app/mezo/bet.tsx` | side, amount + chips (opens on what the wallet can pay), live quote, swipe to bet, confirmation. Betting closes 30 s before a round ends (`BETTING_CUTOFF_MS`); a side outside the 1–99% band or a stake above the pool's free capacity is refused before the swipe, with a button to the next round. The first bet sends its approval in the same swipe. The sheet turns into "Placing your bet" at broadcast and "You're in" at the receipt, showing what the `Minted` event charged. The dock's bet button opens the soonest round with more than two minutes left and follows the best round until the player picks one |
| Add MUSD | `app/mezo/fund.tsx` | free test MUSD (testnet, hidden once used), swap BTC → MUSD on Tigris (approve + `swapExactTokensForTokens`, 1% bound, keeps 0.00002 BTC for gas), MetaMask send, QR, copy, borrow link |
| Portfolio tab | `components/mezo/PortfolioScreen.tsx` | claim all, open (winning/behind now, cash out), settled (won, lost, refund, cashed out) |
| Wallet tab | `components/mezo/WalletScreen.tsx` | balances, receive QR, faucet / Mezo links, Earn: share, risk vs cap, next pool update, deposit / withdraw, collect |
| Settings tab | `components/mezo/SettingsScreen.tsx` | app lock + PIN (existing), backup key behind Face ID, restore, reset |
| First run | `app/mezo/welcome.tsx`, `app/mezo/restore.tsx` | makes the wallet and asks the drip for gas and test MUSD while the sheet is open; "Start betting" once funded; restore from a backup key |
| Entry | `index.ts` (package.json `main`) | loads `lib/polyfills` before expo-router. `@noble/hashes` inside viem reads `globalThis.crypto` once at import, and expo-router evaluates route files before `app/_layout.tsx`, so the layout's polyfill import was too late: key generation failed on device with `crypto.getRandomValues must be defined` |

Verified on an iPhone 16 simulator (iOS 18.4, fresh native build) against live testnet: device
key generation, Markets with live oracle chart and odds, the bet sheet's contract quote and its
closed-round state, Portfolio (open with live cash-out; won, lost, refund, cashed out), Wallet +
Earn with a queued deposit, Settings. A claim and a 3 MUSD bet were signed and sent from inside
the app's Hermes runtime (8.5 s and 7.0 s to confirmation).

New-player flow (2026-09-17, fresh simulator wallet `0x2ba8…1C90`): gas and 20 test MUSD arrived 7 s
after launch; the first bet (approval + mint, block 15583315) showed as placed 4 s after the swipe and
confirmed at 11 s. A later 9 MUSD bet on the same wallet confirmed in 6 s. Node tests (a harness that runs the
app's own client and wallet code) cover the drip (20 MUSD once, nothing on a repeat), the Tigris swap (0.0002 BTC →
15.74 MUSD, exactly the quote; approve 13.0 s, swap 8.2 s), bets with the new price bound, cash-out, and
a vault deposit.


## 8. Before mainnet

1. **Audit** `YosukuPredict`, `SviPricing`, `FixedMath`, `LiabilityTree` (Founder Program listing bar).
2. **Settlement timing.** The native oracle only exposes its latest round, so the first caller
   after expiry fixes the price and a late caller could pick among ~15 blocks. Options: settle
   from Pyth with an exact-publish-time update (`parsePriceFeedUpdatesUnique`), or require the
   print's round to be the first block after expiry. The keeper settles in the first loop, which
   narrows the window but does not close it.
3. **Volatility source.** Flat DVOL (30-day implied) misprices 5-minute markets. Fit SVI from
   Deribit short-dated options, or buy the Block Scholes feed DeepBook uses.
4. **Keeper redundancy.** Two keepers (different hosts) and alerting. A stalled keeper halts
   trading (stale vol) and voids markets after 60 s, which is safe but visible.
5. **LP bootstrap.** Size the first vault deposit to the exposure you want to sell. At 50%
   utilization, 20k MUSD supports ~10k MUSD of worst-case payout across live markets.
6. **Per-market caps.** Utilization is global; add a per-market cap if one market can crowd out the rest.
7. **Legal.** Binary price bets are regulated in many jurisdictions. Geofence, terms, age gate,
   and counsel before mainnet.
8. **Gas UX.** The starter drip covers gas today, but it is a hot wallet anyone can call. Before
   mainnet: device attestation (App Attest / Play Integrity) in front of it and an API key, or
   replace it with a relayer: MUSD supports EIP-2612 `permit`, so a `mintWithPermit` path or an
   EIP-7702 sponsor (Mezo supports type-4 transactions) would remove both the drip and the
   approval transaction.
