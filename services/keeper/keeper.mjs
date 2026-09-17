// Renqun keeper — runs the YosukuPredict venue on Mezo.
//
// The role Mysten's keeper + Block Scholes play for DeepBook Predict on Sui:
//   1. opens rolling expiry markets (5m and 1h cadences) centred on live BTC,
//   2. publishes each live market's volatility surface every VOL_REFRESH_S,
//   3. settles markets the moment they expire (permissionless, but someone has to),
//   4. rolls the LP epoch once it ends and every market in it is resolved.
//
// Vol model (v1): a flat SVI surface from Deribit's DVOL index (30d BTC implied vol):
//   total variance to expiry  w = (DVOL/100)^2 * (expiry - modelTs) / year
//   => a = w (1e9), b = 0, rho = 0, m = 0, sigma = 1e-3 (unused when b = 0)
// The contract rolls `a` down by remaining/anchored time, so the priced variance is always
// sigma^2 * (time left). Replace with a short-dated options fit before mainnet (docs/MEZO_PORT.md).
//
// env:
//   MEZO_NETWORK=testnet|mainnet   (default testnet)
//   MEZO_RPC_URL                   (default: the network's working public RPC)
//   YOSUKU_MEZO_PREDICT            deployed YosukuPredict address (required)
//   KEEPER_PRIVATE_KEY             holds KEEPER_ROLE, funded with a little BTC for gas (required)
//   DRY_RUN=1                      log intended actions without sending
//   KEEPER_ONCE=1                  run a single pass and exit (for cron schedulers)
//
// run:  npm run keeper   (from the repo root)

import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, nonceManager } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mezo, mezoTestnet } from 'viem/chains';

const abi = JSON.parse(readFileSync(new URL('../../client/abi/yosukuPredict.json', import.meta.url)));

const NETWORK = process.env.MEZO_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const RPC =
  process.env.MEZO_RPC_URL ||
  (NETWORK === 'mainnet' ? 'https://mainnet.mezo.public.validationcloud.io' : 'https://rpc.test.mezo.org');
const PREDICT = process.env.YOSUKU_MEZO_PREDICT;
const DRY_RUN = process.env.DRY_RUN === '1';
const ONCE = process.env.KEEPER_ONCE === '1';

const LOOP_MS = 5_000; // cheap when idle: vol only republishes every VOL_REFRESH_S
const VOL_REFRESH_S = 30;
const DVOL_CACHE_MS = 60_000;
const DVOL_STALE_OK_MS = 30 * 60_000;
const YEAR_S = 31_536_000;
const F = 1_000_000_000n;
const GAS_FLOOR = 300_000n; // see send()

// cadence → grid spacing (1e9 USD per tick) and how many upcoming expiries to keep open.
// 256 ticks × $10 = ±$1,280 around spot for 5m; × $25 = ±$3,200 for 1h.
const CADENCES = [
  { name: '5m', seconds: 300, tickSize: 10n * F, ahead: 2 },
  { name: '1h', seconds: 3600, tickSize: 25n * F, ahead: 1 },
];
// "Later today": one round per pool epoch, closing when the epoch ends (a market cannot outlive its
// epoch), on a wider $50 grid (±$6,400). The apps turn it into plain yes/no questions at round-number
// prices. Not opened in the last half hour of an epoch.
const LATER = { name: 'later', tickSize: 50n * F, minLeadS: 30 * 60 };

if (!PREDICT) throw new Error('YOSUKU_MEZO_PREDICT is required');
if (!process.env.KEEPER_PRIVATE_KEY) throw new Error('KEEPER_PRIVATE_KEY is required');

const chain = defineChain({
  ...(NETWORK === 'mainnet' ? mezo : mezoTestnet),
  rpcUrls: { default: { http: [RPC] } }, // viem's mezo default (rpc.mezo.org) does not answer
});
// Mezo's public RPC is load-balanced: right after a transaction lands, another node can still report
// the old pending nonce, and the next send is rejected as "Missing or invalid parameters". Counting
// nonces locally keeps back-to-back sends in order; reset() re-reads the chain after any failure.
const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY, { nonceManager });
// The public testnet RPC drops connections now and then; retry reads and sends before giving up.
const transport = http(RPC, { retryCount: 4, retryDelay: 400, timeout: 20_000 });
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, account, transport });

const log = (...a) => console.log(new Date().toISOString(), ...a);
const read = (functionName, args = []) => pub.readContract({ address: PREDICT, abi, functionName, args });
const why = (e) => [e.shortMessage || e.message, e.details].filter(Boolean).join(' · ').replace(/\s+/g, ' ');

/**
 * One keeper transaction. `opts.priority` is for settles: they must land inside the venue's 60 s
 * window, so they pay a higher gas price and (with `opts.nonce`) go out at the chain's own next
 * nonce, replacing any earlier transaction of ours that the RPC dropped. A stuck pushVol used to
 * hold the queue for two minutes and void the rounds waiting behind it (seen 2026-09-17).
 */
async function send(functionName, args, label, opts = {}) {
  if (DRY_RUN) {
    log('[dry-run]', label ?? functionName, args.map(String).join(' '));
    return;
  }
  const { request } = await pub.simulateContract({ address: PREDICT, abi, functionName, args, account });
  // Mezo's load-balanced nodes disagree on estimates: the same createMarketAtSpot estimated 67,356
  // on one call and 21,416 on another, and the low one is rejected as "gas limit below EIP-7623
  // floor". Gas is priced at a few hundred wei, so send a generous floor instead of trusting it.
  const estimate = await pub.estimateContractGas({ address: PREDICT, abi, functionName, args, account });
  const padded = (estimate * 3n) / 2n + 30_000n;
  // Gas is a few hundred wei on Mezo, so paying a multiple of it costs nothing and keeps the
  // transaction moving; a settle pays more again so it can replace a stuck one.
  const gasPrice = (await pub.getGasPrice()) * (opts.priority ? 4n : 2n);
  let hash;
  try {
    hash = await wallet.writeContract({
      ...request,
      gas: padded > GAS_FLOOR ? padded : GAS_FLOOR,
      gasPrice,
      ...(opts.nonce === undefined ? {} : { nonce: opts.nonce }),
    });
  } catch (e) {
    nonceManager.reset({ address: account.address, chainId: chain.id });
    throw e;
  }
  // A freshly sent tx can be unknown to the node that answers the first polls; keep asking. If it
  // never shows up it was dropped, so re-read the nonce rather than leave a gap behind it.
  let receipt;
  try {
    receipt = await waitForReceipt(hash, opts.priority ? 45_000 : 60_000);
  } catch (e) {
    nonceManager.reset({ address: account.address, chainId: chain.id });
    throw e;
  }
  log(receipt.status === 'success' ? 'ok ' : 'FAIL', label ?? functionName, hash);
  return receipt;
}

// The load-balanced RPC's nodes disagree for a few seconds after a block (one has the receipt, the
// next says null). viem's waitForTransactionReceipt reads that as a replacement and throws on txs that
// landed, so poll and treat "not found" as "not yet".
async function waitForReceipt(hash, timeoutMs = 120_000) {
  const started = Date.now();
  let delay = 1_500;
  while (Date.now() - started < timeoutMs) {
    try {
      return await pub.getTransactionReceipt({ hash });
    } catch {
      /* not visible on this node yet */
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.round(delay * 1.3), 4_000);
  }
  throw new Error(`no receipt for ${hash} after ${timeoutMs / 1000}s`);
}

// ─── market book ───

/** id → { id, expiry(s), tickSize, lastVol(s) } for markets we believe are live. */
const live = new Map();
let scannedTo = null;

async function syncMarkets() {
  const count = await read('marketCount');
  const from = scannedTo === null ? (count > 200n ? count - 200n : 1n) : scannedTo + 1n;
  for (let id = from; id <= count; id++) {
    const [expiry, , tickSize, , status] = await read('markets', [id]);
    if (status === 1) live.set(id, { id, expiry: Number(expiry), tickSize, lastVol: 0 });
  }
  scannedTo = count;
}

// ─── vol source ───

let dvolCache = { at: 0, value: 0 };
async function dvol() {
  if (Date.now() - dvolCache.at < DVOL_CACHE_MS) return dvolCache.value;
  const end = Date.now();
  const url =
    'https://www.deribit.com/api/v2/public/get_volatility_index_data' +
    `?currency=BTC&resolution=60&start_timestamp=${end - 3_600_000}&end_timestamp=${end}`;
  try {
    const body = await (await fetch(url, { signal: AbortSignal.timeout(8_000) })).json();
    const rows = body?.result?.data ?? [];
    const close = rows.length ? Number(rows[rows.length - 1][4]) : NaN;
    if (!(close > 5 && close < 400)) throw new Error(`implausible DVOL ${close}`);
    dvolCache = { at: Date.now(), value: close };
    return close;
  } catch (e) {
    // 30-day implied vol barely moves in minutes; a short Deribit outage must not stale every
    // market's surface (volMaxAge is 120 s) and halt trading.
    if (dvolCache.value && Date.now() - dvolCache.at < DVOL_STALE_OK_MS) {
      log('dvol fetch failed, reusing', dvolCache.value, why(e));
      return dvolCache.value;
    }
    throw e;
  }
}

function flatSurface(dvolPct, anchorSeconds) {
  const sigma = dvolPct / 100;
  const w = (sigma * sigma * anchorSeconds) / YEAR_S;
  const a = BigInt(Math.max(1, Math.round(w * 1e9)));
  return { aMagnitude: a, aNegative: false, b: 0n, rho: 0n, m: 0n, sigma: 1_000_000n };
}

// ─── loop ───

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chainNow = async () => Number((await pub.getBlock()).timestamp);

/**
 * Settle every expired market. The venue voids a market (refunding every premium) if nobody settles
 * it within `settleWindow` (60 s) of expiry, and one pass of the loop can take ~40 s, so this runs at
 * the start of each pass AND before every other transaction, and retries a failed attempt quickly.
 */
async function settleDue() {
  // A lagging RPC node can report a block from before expiry; the wall clock decides what is due and
  // the contract's own check (MarketNotResolved) makes an early attempt wait and retry.
  const now = Math.max(await chainNow(), Math.floor(Date.now() / 1000));
  // Up to three rounds close in the same second (5-minute, hourly, later today). Settling them one
  // after another could run past the 60 s window, so they go out together; local nonces keep order.
  const due = [...live.values()].filter((m) => now >= m.expiry);
  if (!due.length) return;
  // Start from the chain's own next nonce so the first settles replace anything of ours still
  // pending, then hand the count back to the local manager.
  const base = DRY_RUN ? 0 : await pub.getTransactionCount({ address: account.address });
  await Promise.all(due.map((m, i) => settleOne(m, base + i)));
  if (!DRY_RUN) nonceManager.reset({ address: account.address, chainId: chain.id });
}

async function settleOne(m, nonce) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // Only the first try takes a nonce: by the second, the manager has re-read the chain.
      await send('settle', [m.id], `settle #${m.id}`, attempt === 1 ? { priority: true, nonce } : { priority: true });
      live.delete(m.id);
      break;
    } catch (e) {
      const reason = `${e.shortMessage || ''} ${e.message || ''}`;
      if (/MarketNotLive/.test(reason)) {
        live.delete(m.id);
        break;
      }
      // MarketNotResolved / AwaitingOraclePrint clear within a block or two (~4 s each); network
      // errors usually clear as fast.
      if (!/MarketNotResolved|AwaitingOraclePrint/.test(reason) || attempt === 4) {
        log('settle retry', `#${m.id}`, `attempt ${attempt}`, why(e));
      }
      if (attempt < 4) await sleep(3_000);
    }
  }
}

/**
 * Call before every transaction. A send can take 10-20 s to confirm on the public RPC, so never start
 * one when a market closes within that time: wait for the close, then settle straight away.
 */
const QUIET_BEFORE_EXPIRY_S = 25;
async function guard() {
  const wall = Date.now() / 1000;
  const closing = [...live.values()].map((m) => m.expiry).filter((e) => e - wall < QUIET_BEFORE_EXPIRY_S);
  if (closing.length) {
    const wait = (Math.max(...closing) + 2 - wall) * 1000;
    if (wait > 0) await sleep(wait);
  }
  await settleDue();
}

async function tick() {
  await syncMarkets();

  // 1. settle anything expired
  await settleDue();

  // 2. roll the epoch when it is over and clear
  const now = await chainNow();
  const epoch = await read('currentEpoch');
  const end = Number(await read('epochEnd', [epoch]));
  if (now >= end) {
    const open = await read('epochUnsettled', [epoch]);
    if (open === 0n) await send('rollEpoch', [], `rollEpoch ${epoch}`);
    else log(`epoch ${epoch} ended; ${open} market(s) still settling`);
    return; // no new markets until the epoch has rolled
  }

  // 3. keep rolling markets open
  for (const c of CADENCES) {
    const next = Math.ceil((now + 60) / c.seconds) * c.seconds;
    for (let k = 0; k < c.ahead; k++) {
      const expiry = next + k * c.seconds;
      if (expiry > end) break;
      const exists = [...live.values()].some((m) => m.expiry === expiry && m.tickSize === c.tickSize);
      if (!exists) {
        await guard();
        await send('createMarketAtSpot', [BigInt(expiry), c.tickSize], `open ${c.name} @${expiry}`);
      }
    }
  }
  const laterOpen = [...live.values()].some((m) => m.expiry === end && m.tickSize === LATER.tickSize);
  if (!laterOpen && end - now >= LATER.minLeadS) {
    await guard();
    await send('createMarketAtSpot', [BigInt(end), LATER.tickSize], `open ${LATER.name} @${end}`);
  }
  await syncMarkets();

  // 4. publish vol for every live market, from a fresh clock and spot each time
  const vol = await dvol();
  for (const m of [...live.values()]) {
    await guard();
    const t = await chainNow();
    // A market about to close keeps its last surface (valid for volMaxAge); don't spend the quiet window on it.
    if (!live.has(m.id) || m.expiry - t < 45 || t - m.lastVol < VOL_REFRESH_S) continue;
    try {
      const spotRaw = await read('spotPrice'); // 1e9 USD, reverts if the oracle print is stale
      const surface = flatSurface(vol, m.expiry - t);
      await send('pushVol', [m.id, spotRaw, spotRaw, BigInt(t), surface], `vol #${m.id} dvol=${vol}`);
      m.lastVol = t;
    } catch (e) {
      log('pushVol failed', `#${m.id}`, why(e));
    }
  }
}

log(`renqun keeper · ${NETWORK} · venue ${PREDICT} · keeper ${account.address}${DRY_RUN ? ' · DRY RUN' : ''}`);
const hasRole = await read('hasRole', [await read('KEEPER_ROLE'), account.address]);
if (!hasRole) throw new Error(`${account.address} lacks KEEPER_ROLE on ${PREDICT}`);

for (;;) {
  try {
    await tick();
  } catch (e) {
    log('tick error:', why(e));
    if (ONCE) process.exitCode = 1;
  }
  if (ONCE) break;
  await sleep(LOOP_MS);
}
