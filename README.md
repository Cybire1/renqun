# Renqun

<img src="mobile/assets/icon.png" width="88" align="right" alt="Renqun app icon: three stacked figures with a red head">

Bitcoin price rounds on [Mezo](https://mezo.org), paid in MUSD. Every 5 minutes (and every hour)
a round opens at the current BTC price; players call Up or Down, can cash out before the close,
and winners are paid from Mezo's own price oracle the moment the round ends. A pool of MUSD
depositors takes the other side and earns the fee and the losing bets.

人群 (rénqún) means "a crowd". The mark stacks three 人 into 众: a crowd, pointing up.

**Web app:** [renqun.app](https://renqun.app) — connect any browser wallet and the site sends you
20 test MUSD and the gas for your first bets.

**Live on Mezo testnet:** `YosukuPredict` at
[`0x85c9A910143A4814346132d93F221DE3FCF6536a`](https://explorer.test.mezo.org/address/0x85c9A910143A4814346132d93F221DE3FCF6536a)
(source verified), with a funded pool and a keeper opening and settling rounds.

Renqun began as Yosuku, a prediction app on Sui. The contract keeps the name `YosukuPredict`
because it is deployed and verified under it; renaming the source would stop it matching the
verified contract on the explorer.

## What's here

| Folder | What it is |
|---|---|
| [`contracts/`](contracts) | `YosukuPredict` (Foundry): markets, range digitals priced with SVI, settlement from Mezo's BTC oracle, and the epoch-priced LP pool. 56 tests, including DeepBook Predict's pricing reference points |
| [`services/keeper/`](services/keeper/keeper.mjs) | Opens 5-minute and hourly rounds at spot, publishes volatility, settles at expiry, rolls pool epochs |
| [`services/drip/`](services/drip/drip.mjs) | Starter drip: gas for every new player, plus 20 test MUSD on testnet, so a first bet needs nothing else. The same job runs hosted at `renqun.app/api/drip` ([`web/app/api/drip`](web/app/api/drip/route.ts)) |
| [`web/`](web) | The Renqun web app (Next.js): a front page built on live chain data, markets with a live oracle chart and the bet ticket, "Just ask" yes/no questions for later today, a portfolio ledger with cash-out and one-tap claims, the Earn pool, Add MUSD. Connects any browser wallet that announces itself (MetaMask, Rabby, OKX…) and adds Mezo to it |
| [`client/`](client) | `@renqun/client`: the shared Mezo client the web app uses (markets, quotes, positions, pool, transaction builders, formatting). The app keeps a React Native twin in `mobile/lib/mezo` |
| [`mobile/`](mobile) | The Renqun app (Expo): markets, one-swipe bets, Add MUSD, portfolio with cash-out, the Earn pool, backup and app lock |
| [`design/`](design) | Design source for the Renqun mark |
| [`docs/MEZO_PORT.md`](docs/MEZO_PORT.md) | Design notes, verified Mezo facts and RPC quirks, deployment, status and what is left before mainnet |

## Run it

Needs Node 20+, [Foundry](https://getfoundry.sh) for the contracts, and Xcode for the iOS app.

```bash
npm install                     # the keeper, drip, client and web app (npm workspaces)

# contracts
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
forge test
cd ..

# keeper: holds KEEPER_ROLE on the venue, a little BTC for gas
YOSUKU_MEZO_PREDICT=0x85c9A910143A4814346132d93F221DE3FCF6536a KEEPER_PRIVATE_KEY=0x… npm run keeper

# starter drip: its own funded wallet (not the keeper's), serves :8787
DRIP_PRIVATE_KEY=0x… npm run drip

# the web app, on http://localhost:3000
npm run web                     # production: npm run web:build, then npm start --workspace web

# the app
cd mobile
npm install
npx expo run:ios                # first time builds the native app; after that, npx expo start
```

The web app and the app talk to the live testnet deployment by default; see
[`web/.env.example`](web/.env.example) and [`mobile/.env.example`](mobile/.env.example) for
overrides. The app and renqun.app use the hosted drip; `next dev` uses `services/drip` on
`http://localhost:8787`. Pushes to `main` deploy renqun.app (Vercel, root directory `web`).

Never commit keys. The keeper and drip read them from the environment only.

## Where it runs

- **Web app and hosted drip:** Vercel, from `web/`. Pushes to `main` deploy renqun.app.
- **Keeper:** Railway (project `renqun-keeper`, service `keeper`), under its own wallet
  [`0xE37C0e20CF9F466e869a9E20ffbe66333b8F6b74`](https://explorer.test.mezo.org/address/0xE37C0e20CF9F466e869a9E20ffbe66333b8F6b74),
  which holds only `KEEPER_ROLE`. The admin key never leaves the deployer's machine.
  [`scripts/deploy-keeper.sh`](scripts/deploy-keeper.sh) redeploys it.

## Before mainnet

An audit, exact-timestamp settlement, a short-dated volatility source, redundant keepers, device
attestation in front of the drip, and legal review. Details in
[`docs/MEZO_PORT.md` §8](docs/MEZO_PORT.md#8-before-mainnet).

## License

MIT, except the DeepBook Predict ports in `contracts/`, which stay under Apache-2.0 — see
[`contracts/NOTICE`](contracts/NOTICE).
