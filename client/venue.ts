// YosukuPredict on Mezo: reads and transaction builders for Renqun's web front end. The app keeps a
// twin in mobile/lib/mezo/client.ts. Chart history comes from the oracle itself, event scans are
// paged (the public RPC caps eth_getLogs at 10,000 blocks) with the explorer tried first, and the
// LP vault is read here too.
//
// Product model (same as DeepBook Predict): rolling BTC markets selling range digitals. A position
// pays `quantity` MUSD if BTC settles in (lower, higher]. Ticks index a 256-tick grid per market;
// strike = tick × tickSize (USD, 1e9-scaled). The keeper opens each grid centred on spot, so the
// centre tick is the market's opening price: the "UP line".
import {
  createPublicClient,
  fallback,
  http,
  maxUint256,
  pad,
  parseAbi,
  parseEventLogs,
  toEventSelector,
  type AbiEvent,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from 'viem';
import { yosukuPredictAbi as abi } from './abi/yosukuPredict';
import { store } from './storage';
import { MEZO, MEZO_BTC_TOKEN, MEZO_PRICE_ORACLE, mezoChain } from './network';

export const F = 1_000_000_000n;
export const WAD = 10n ** 18n;
export const POS_INF_TICK = (1n << 30n) - 1n;
export const NEG_INF_TICK = 0n;
export const GRID_TICKS = 256n;
const LOG_SPAN = 9_999n;
// Providers cap eth_getLogs differently (Mezo's RPC: 10,000 blocks; dRPC's free plan: about 100), and
// behind the fallback transport the refusal arrives as a bare "HTTP request failed". So any failed
// chunk shrinks the span and retries; only a failure at the smallest span is real. The working size
// is remembered for the session.
let logSpan = LOG_SPAN;
const MIN_LOG_SPAN = 20n;

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const oracleAbi = parseAbi(['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']);

/**
 * Primary RPC first, then the fallbacks; each retries once before handing over. The public fallbacks
 * are free tiers (dRPC refuses JSON-RPC batches of more than 3), so they batch in threes.
 */
export function mezoTransport(batch = true) {
  return fallback(
    [MEZO.rpcUrl, ...MEZO.rpcFallbacks].map((url, i) =>
      http(url, {
        batch: batch ? { batchSize: i === 0 ? 40 : 3, wait: 12 } : false,
        retryCount: 1,
        retryDelay: 300,
        timeout: 12_000,
      }),
    ),
    { retryCount: 1 },
  );
}

let _client: PublicClient | null = null;
/** One client for the app. Concurrent reads at the same block are folded into a single multicall,
 *  and the rest share JSON-RPC batches, so a screen refresh is one or two requests. */
export function mezoClient(): PublicClient {
  _client ??= createPublicClient({
    chain: mezoChain,
    transport: mezoTransport(),
    batch: { multicall: { wait: 12 } },
  }) as PublicClient;
  return _client;
}

export function venue(): Address {
  if (!MEZO.predict) throw new Error(`Renqun is not live on Mezo ${MEZO.network} yet`);
  return MEZO.predict;
}

// ─── units ───

export const fromWad = (x: bigint) => Number(x) / 1e18;
export const fromF = (x: bigint) => Number(x) / 1e9;

/** Decimal MUSD string → wei, rounded down to 0.01. */
export function toWad(musd: number): bigint {
  if (!Number.isFinite(musd) || musd <= 0) return 0n;
  return BigInt(Math.floor(musd * 100)) * 10n ** 16n;
}

// ─── markets ───

export type MarketStatus = 'none' | 'live' | 'settled' | 'void';
const STATUS: MarketStatus[] = ['none', 'live', 'settled', 'void'];
export type Cadence = '5m' | '1h' | '1d';

export interface Market {
  id: bigint;
  /** ms epoch */
  expiry: number;
  cadence: Cadence;
  epoch: bigint;
  tickSize: bigint;
  minTick: bigint;
  maxTick: bigint;
  /** Centre of the grid = BTC at open, rounded down to the grid. */
  strikeTick: bigint;
  strike: number;
  status: MarketStatus;
  /** USD, once settled. */
  settlement: number | null;
  settlementRaw: bigint;
}

export function cadenceOf(tickSize: bigint, _expiryMs?: number): Cadence {
  // The keeper opens 5-minute rounds on a $10 grid, hourly ones on $25, and one "later today" round
  // per pool period on $50 (it closes when the period ends; the apps ask yes/no questions on it).
  if (tickSize <= 10n * F) return '5m';
  if (tickSize <= 25n * F) return '1h';
  return '1d';
}

/** How a round is named on screen. */
export const roundName = (c: Cadence) => (c === '5m' ? '5-minute' : c === '1h' ? 'Hourly' : 'Later today');

/**
 * Round-number prices near spot for plain yes/no questions on a "later today" round ("Will Bitcoin
 * be above $77,000 at 7:00 PM?"). Yes pays above the price, No at or below it. Only prices inside
 * the round's grid come back, lowest first.
 */
export function questionLines(market: Market, spotUsd: number, count = 3): { tick: bigint; usd: number }[] {
  const step = spotUsd >= 20_000 ? 500 : spotUsd >= 2_000 ? 50 : 5;
  const base = Math.round(spotUsd / step) * step;
  const offsets = [0, step, -step, 2 * step, -2 * step, 3 * step, -3 * step];
  const out: { tick: bigint; usd: number }[] = [];
  for (const off of offsets) {
    const usd = base + off;
    const tick = usdToTick(usd, market.tickSize);
    if (tickToUsd(tick, market.tickSize) !== usd) continue; // not on the grid
    if (tick <= market.minTick || tick >= market.maxTick) continue;
    out.push({ tick, usd });
    if (out.length === count) break;
  }
  return out.sort((a, b) => a.usd - b.usd);
}

/** The price a directional position is about: above `line` (up) or at or below it (down). */
export function positionLine(p: { side: Side | 'range'; lower: bigint; higher: bigint; market: Market }): number | null {
  if (p.side === 'up') return tickToUsd(p.lower, p.market.tickSize);
  if (p.side === 'down') return tickToUsd(p.higher, p.market.tickSize);
  return null;
}

export const tickToUsd = (tick: bigint, tickSize: bigint) => Number(tick * tickSize) / 1e9;

export function usdToTick(usd: number, tickSize: bigint): bigint {
  return (BigInt(Math.round(usd * 1e9)) + tickSize / 2n) / tickSize;
}

function toMarket(id: bigint, row: readonly [bigint, bigint, bigint, number, number, bigint, ...unknown[]]): Market {
  const [expiry, epoch, tickSize, minTickN, status, settlementRaw] = row;
  const minTick = BigInt(minTickN);
  const expiryMs = Number(expiry) * 1000;
  const strikeTick = minTick + GRID_TICKS / 2n;
  return {
    id,
    expiry: expiryMs,
    cadence: cadenceOf(tickSize, expiryMs),
    epoch,
    tickSize,
    minTick,
    maxTick: minTick + GRID_TICKS - 1n,
    strikeTick,
    strike: tickToUsd(strikeTick, tickSize),
    status: STATUS[status] ?? 'none',
    settlement: settlementRaw > 0n ? fromF(settlementRaw) : null,
    settlementRaw,
  };
}

const marketCache = new Map<bigint, Market>();

export async function fetchMarket(id: bigint): Promise<Market> {
  const cached = marketCache.get(id);
  if (cached && cached.status !== 'live') return cached; // resolved markets never change
  const row = await mezoClient().readContract({ address: venue(), abi, functionName: 'markets', args: [id] });
  const m = toMarket(id, row);
  marketCache.set(id, m);
  return m;
}

/** The newest `lookback` markets, soonest expiry first. */
export async function fetchRecentMarkets(lookback = 12): Promise<Market[]> {
  const count = await mezoClient().readContract({ address: venue(), abi, functionName: 'marketCount' });
  const ids: bigint[] = [];
  for (let i = count; i > 0n && ids.length < lookback; i--) ids.push(i);
  const markets = await Promise.all(ids.map(fetchMarket));
  return markets.sort((a, b) => a.expiry - b.expiry);
}

/**
 * New bets close this long before a round ends. In the last seconds the odds swing to extremes and
 * the venue refuses them ("odds too lopsided", "price moved"), which reads as the app being broken;
 * closing early and saying so is clearer, and it keeps last-second bots off the pool.
 */
export const BETTING_CUTOFF_MS = 30_000;

export const bettable = (m: Market, now = Date.now()) => m.status === 'live' && m.expiry - now > BETTING_CUTOFF_MS;

/** Rounds still running (bettable or in their final seconds), per cadence, soonest first. */
export function liveRounds(markets: Market[], cadence: Cadence, now = Date.now()): Market[] {
  return markets.filter((m) => m.status === 'live' && m.cadence === cadence && m.expiry > now);
}

/** Rounds that still take bets, per cadence, soonest first. */
export function tradable(markets: Market[], cadence: Cadence, now = Date.now()): Market[] {
  return markets.filter((m) => m.cadence === cadence && bettable(m, now));
}

// ─── BTC price ───

export interface SpotPoint {
  t: number;
  usd: number;
}

export async function fetchSpot(): Promise<SpotPoint> {
  const [, answer, , updatedAt] = await mezoClient().readContract({
    address: MEZO_PRICE_ORACLE,
    abi: oracleAbi,
    functionName: 'latestRoundData',
  });
  return { t: Number(updatedAt) * 1000, usd: Number(answer) / 1e18 };
}

/** `points` oracle prints spread over the last `minutes`, read at past blocks. This is the exact
 *  series settlement uses, not a third-party feed. */
export async function fetchSpotHistory(minutes: number, points = 36): Promise<SpotPoint[]> {
  const client = mezoClient();
  const head = await client.getBlock();
  const span = BigInt(Math.max(1, Math.round((minutes * 60) / MEZO.blockSeconds)));
  const step = span / BigInt(points - 1) || 1n;
  const blocks: bigint[] = [];
  for (let i = BigInt(points - 1); i >= 0n; i--) {
    const b = head.number - i * step;
    if (b > 0n) blocks.push(b);
  }
  const rows = await Promise.all(
    blocks.map((blockNumber) =>
      client
        .readContract({ address: MEZO_PRICE_ORACLE, abi: oracleAbi, functionName: 'latestRoundData', blockNumber })
        .catch(() => null),
    ),
  );
  const headMs = Number(head.timestamp) * 1000;
  const out: SpotPoint[] = [];
  rows.forEach((r, i) => {
    if (!r) return;
    const t = headMs - Number(head.number - blocks[i]) * MEZO.blockSeconds * 1000;
    out.push({ t, usd: Number(r[1]) / 1e18 });
  });
  return out;
}

// ─── venue config ───

export interface VenueConfig {
  feeRate: bigint;
  minEntryPrice: bigint;
  maxEntryPrice: bigint;
  maxUtilization: bigint;
  lotSize: bigint;
  minPremium: bigint;
  minDeposit: bigint;
}

let _config: VenueConfig | null = null;
export async function fetchConfig(): Promise<VenueConfig> {
  if (_config) return _config;
  const c = await mezoClient().readContract({ address: venue(), abi, functionName: 'config' });
  _config = {
    feeRate: c[4],
    minEntryPrice: c[5],
    maxEntryPrice: c[6],
    maxUtilization: c[7],
    lotSize: c[8],
    minPremium: c[9],
    minDeposit: c[10],
  };
  return _config;
}

// ─── pricing ───

export type Side = 'up' | 'down';

/** UP pays above the line, DOWN pays at or below it. */
export function sideRange(side: Side, strikeTick: bigint): [bigint, bigint] {
  return side === 'up' ? [strikeTick, POS_INF_TICK] : [NEG_INF_TICK, strikeTick];
}

/** Chance (0..1) that BTC settles in (lower, higher] under the live surface. */
export async function rangeChance(marketId: bigint, lower: bigint, higher: bigint): Promise<number> {
  const p = await mezoClient().readContract({
    address: venue(),
    abi,
    functionName: 'rangePriceOf',
    args: [marketId, Number(lower), Number(higher)],
  });
  return fromF(p);
}

export interface Quote {
  /** 0..1 */
  chance: number;
  quantity: bigint;
  premium: bigint;
  fee: bigint;
  cost: bigint;
}

/** The largest lot-sized position whose premium + fee fits `stake`, priced by the contract. */
export async function quoteStake(market: Market, lower: bigint, higher: bigint, stake: bigint): Promise<Quote> {
  const cfg = await fetchConfig();
  const client = mezoClient();
  const price = await client.readContract({
    address: venue(),
    abi,
    functionName: 'rangePriceOf',
    args: [market.id, Number(lower), Number(higher)],
  });
  if (price === 0n || stake === 0n) return { chance: fromF(price), quantity: 0n, premium: 0n, fee: 0n, cost: 0n };
  const perUnit = (price * (F + cfg.feeRate)) / F; // 1e9-scaled MUSD per MUSD of payout
  let quantity = ((stake * F) / perUnit / cfg.lotSize) * cfg.lotSize;
  // The price can move between the two reads, and the contract rounds up, so the first guess can
  // overshoot. Scale down by the overshoot (at least one lot) until it fits.
  for (let i = 0; i < 4 && quantity > 0n; i++) {
    const [p, premium, fee] = await client.readContract({
      address: venue(),
      abi,
      functionName: 'quote',
      args: [market.id, Number(lower), Number(higher), quantity],
    });
    const cost = premium + fee;
    if (cost <= stake) return { chance: fromF(p), quantity, premium, fee, cost };
    const scaled = ((quantity * stake) / cost / cfg.lotSize) * cfg.lotSize;
    quantity = scaled < quantity ? scaled : quantity - cfg.lotSize;
  }
  return { chance: fromF(price), quantity: 0n, premium: 0n, fee: 0n, cost: 0n };
}

// ─── positions ───

export interface Position {
  id: bigint;
  marketId: bigint;
  lower: bigint;
  higher: bigint;
  open: boolean;
  quantity: bigint;
  premium: bigint;
  market: Market;
  side: Side | 'range';
  /** Would it pay if the market settled at `price`? */
  winsAt: (usd: number) => boolean;
  /** Resolved and not yet collected: what `claim` pays (0 for a loss). */
  claimable: bigint | null;
  /** Live early exit, when the market is still trading. */
  cashOut: bigint | null;
  /** Closed early with `redeem`. */
  cashedOut: boolean;
}

export function inRange(settlementRaw: bigint, lower: bigint, higher: bigint, tickSize: bigint): boolean {
  const limit = (settlementRaw + tickSize - 1n) / tickSize;
  return lower < limit && (higher === POS_INF_TICK || limit <= higher);
}

interface ScanState {
  scannedTo: string;
  ids: string[];
}

async function scanEvents(
  key: string,
  eventName: 'Minted' | 'Redeemed' | 'DepositRequested' | 'WithdrawRequested',
  owner: Address,
  pick: (args: Record<string, unknown>) => bigint,
): Promise<bigint[]> {
  const storeKey = `mezo_scan_${MEZO.network}_${MEZO.predict}_${key}_${owner.toLowerCase()}`;
  let state: ScanState = { scannedTo: (MEZO.deployBlock - 1n).toString(), ids: [] };
  try {
    const raw = await store.getItem(storeKey);
    if (raw) state = JSON.parse(raw) as ScanState;
  } catch {
    /* rescan */
  }
  const client = mezoClient();
  const head = await client.getBlockNumber();
  const found = new Set(state.ids);
  let from = BigInt(state.scannedTo) + 1n;
  const argFilter = eventName === 'Minted' || eventName === 'Redeemed' ? { owner } : { lp: owner };

  // The explorer answers the whole range in one call (under a second); the RPC needs pages.
  const fromExplorer = await explorerLogs(eventName, owner, from).catch(() => null);
  if (fromExplorer) {
    for (const id of fromExplorer) found.add(id.toString());
    state = { scannedTo: head.toString(), ids: [...found] };
    store.setItem(storeKey, JSON.stringify(state)).catch(() => {});
    return [...found].map((x) => BigInt(x));
  }
  let chunks = 0;
  while (from <= head) {
    const to = from + logSpan > head ? head : from + logSpan;
    let logs;
    try {
      logs = await client.getContractEvents({
        address: venue(),
        abi,
        eventName,
        args: argFilter as never,
        fromBlock: from,
        toBlock: to,
      });
    } catch (e) {
      if (logSpan > MIN_LOG_SPAN) {
        logSpan = logSpan / 5n > MIN_LOG_SPAN ? logSpan / 5n : MIN_LOG_SPAN;
        continue;
      }
      throw e;
    }
    for (const l of logs) found.add(pick(l.args as Record<string, unknown>).toString());
    state = { scannedTo: to.toString(), ids: [...found] };
    from = to + 1n;
    // Keep progress if a long first scan is interrupted.
    if (++chunks % 10 === 0) store.setItem(storeKey, JSON.stringify(state)).catch(() => {});
  }
  store.setItem(storeKey, JSON.stringify(state)).catch(() => {});
  return [...found].map((x) => BigInt(x));
}

// Indexed-topic position of the owner (or LP) and the id we want back, per event.
const EVENT_SHAPE: Record<string, { ownerTopic: 1 | 2 | 3; idTopic: 1 | 2 | 3 }> = {
  Minted: { ownerTopic: 3, idTopic: 1 }, // Minted(positionId, marketId, owner, …)
  Redeemed: { ownerTopic: 2, idTopic: 1 }, // Redeemed(positionId, owner, …)
  DepositRequested: { ownerTopic: 2, idTopic: 1 }, // DepositRequested(epoch, lp, …)
  WithdrawRequested: { ownerTopic: 2, idTopic: 1 }, // WithdrawRequested(epoch, lp, …)
};

async function explorerLogs(eventName: keyof typeof EVENT_SHAPE, owner: Address, fromBlock: bigint): Promise<bigint[]> {
  const item = abi.find((x) => x.type === 'event' && x.name === eventName);
  if (!item) throw new Error(`no event ${eventName}`);
  const topic0 = toEventSelector(item as AbiEvent);
  const { ownerTopic, idTopic } = EVENT_SHAPE[eventName];
  const ownerHex = pad(owner.toLowerCase() as Hex);
  const q = new URLSearchParams({
    module: 'logs',
    action: 'getLogs',
    fromBlock: fromBlock.toString(),
    toBlock: 'latest',
    address: venue(),
    topic0,
    [`topic${ownerTopic}`]: ownerHex,
    [`topic0_${ownerTopic}_opr`]: 'and',
  });
  const res = await fetch(`${MEZO.explorerApi}?${q}`, { signal: AbortSignal.timeout(8_000) });
  const body = (await res.json()) as { status?: string; message?: string; result?: { topics: string[] }[] | string };
  if (!Array.isArray(body.result)) {
    // "No logs found" is an empty answer, not a failure.
    if (typeof body.message === 'string' && /no (records|logs)/i.test(body.message)) return [];
    throw new Error(`explorer: ${body.message ?? 'bad response'}`);
  }
  // The explorer caps a page at 1,000 rows; past that, let the RPC scan finish the job.
  if (body.result.length >= 1000) throw new Error('explorer page limit');
  return body.result.map((l) => BigInt(l.topics[idTopic]));
}

/** Remember a position the moment it is minted, so it shows before the next scan. */
export async function rememberPosition(owner: Address, id: bigint): Promise<void> {
  const storeKey = `mezo_scan_${MEZO.network}_${MEZO.predict}_minted_${owner.toLowerCase()}`;
  try {
    const raw = await store.getItem(storeKey);
    const state: ScanState = raw ? JSON.parse(raw) : { scannedTo: (MEZO.deployBlock - 1n).toString(), ids: [] };
    if (!state.ids.includes(id.toString())) state.ids.push(id.toString());
    await store.setItem(storeKey, JSON.stringify(state));
  } catch {
    /* next scan finds it */
  }
}

/** Every position the address opened, newest first. */
export async function fetchPositions(owner: Address): Promise<Position[]> {
  const [ids, redeemed] = await Promise.all([
    scanEvents('minted', 'Minted', owner, (a) => a.positionId as bigint),
    scanEvents('redeemed', 'Redeemed', owner, (a) => a.positionId as bigint),
  ]);
  if (!ids.length) return [];
  const cashedOutIds = new Set(redeemed.map(String));
  const client = mezoClient();
  const rows = await Promise.all(
    ids.map((id) => client.readContract({ address: venue(), abi, functionName: 'positions', args: [id] })),
  );
  const now = Date.now();
  const out = await Promise.all(
    rows.map(async (r, i): Promise<Position | null> => {
      const [posOwner, marketId, lowerN, higherN, open, quantity, premium] = r;
      if (posOwner.toLowerCase() !== owner.toLowerCase()) return null;
      const market = await fetchMarket(marketId);
      const lower = BigInt(lowerN);
      const higher = BigInt(higherN);
      const side: Position['side'] =
        higher === POS_INF_TICK ? 'up' : lower === NEG_INF_TICK ? 'down' : 'range';
      let claimable: bigint | null = null;
      if (open && market.status === 'settled') {
        claimable = inRange(market.settlementRaw, lower, higher, market.tickSize) ? quantity : 0n;
      } else if (open && market.status === 'void') {
        claimable = premium;
      }
      let cashOut: bigint | null = null;
      if (open && market.status === 'live' && market.expiry > now) {
        cashOut = await client
          .readContract({ address: venue(), abi, functionName: 'quoteRedeem', args: [ids[i]] })
          .then((q) => q[1])
          .catch(() => null);
      }
      const winsAt = (usd: number) => inRange(BigInt(Math.round(usd * 1e9)), lower, higher, market.tickSize);
      const cashedOut = cashedOutIds.has(ids[i].toString());
      return { id: ids[i], marketId, lower, higher, open, quantity, premium, market, side, winsAt, claimable, cashOut, cashedOut };
    }),
  );
  return out.filter((p): p is Position => p !== null).sort((a, b) => (a.id > b.id ? -1 : 1));
}

// ─── wallet balances ───

export interface Balances {
  btc: bigint;
  musd: bigint;
  allowance: bigint;
}

export async function fetchBalances(owner: Address): Promise<Balances> {
  const client = mezoClient();
  const [btc, musd, allowance] = await Promise.all([
    client.getBalance({ address: owner }),
    client.readContract({ address: MEZO.musd, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    client.readContract({ address: MEZO.musd, abi: erc20Abi, functionName: 'allowance', args: [owner, venue()] }),
  ]);
  return { btc, musd, allowance };
}

// ─── LP vault ───

export interface Vault {
  nav: bigint;
  supply: bigint;
  /** Your yLP shares and their MUSD value. */
  shares: bigint;
  value: bigint;
  atRisk: bigint;
  cap: bigint;
  epoch: bigint;
  /** ms epoch of the next pool update. */
  nextRoll: number;
  /** Waiting for the next pool update. */
  queuedDeposit: bigint;
  queuedWithdrawShares: bigint;
  /** Rolled and ready to collect. */
  claimableDeposits: bigint[];
  claimableWithdrawals: bigint[];
}

export async function fetchVault(owner: Address): Promise<Vault> {
  const client = mezoClient();
  const v = venue();
  const [nav, supply, shares, atRisk, cfg, epoch] = await Promise.all([
    client.readContract({ address: v, abi, functionName: 'navAssets' }),
    client.readContract({ address: v, abi, functionName: 'totalSupply' }),
    client.readContract({ address: v, abi, functionName: 'balanceOf', args: [owner] }),
    client.readContract({ address: v, abi, functionName: 'liveMaxLiability' }),
    fetchConfig(),
    client.readContract({ address: v, abi, functionName: 'currentEpoch' }),
  ]);
  const [end, queuedDeposit, queuedWithdrawShares, depositEpochs, withdrawEpochs] = await Promise.all([
    client.readContract({ address: v, abi, functionName: 'epochEnd', args: [epoch] }),
    client.readContract({ address: v, abi, functionName: 'pendingDepositOf', args: [epoch, owner] }),
    client.readContract({ address: v, abi, functionName: 'pendingWithdrawOf', args: [epoch, owner] }),
    scanEvents('deposits', 'DepositRequested', owner, (a) => a.epoch as bigint),
    scanEvents('withdrawals', 'WithdrawRequested', owner, (a) => a.epoch as bigint),
  ]);
  const past = (xs: bigint[]) => [...new Set(xs.map(String))].map(BigInt).filter((e) => e < epoch);
  const [claimableDeposits, claimableWithdrawals] = await Promise.all([
    Promise.all(
      past(depositEpochs).map(async (e) =>
        (await client.readContract({ address: v, abi, functionName: 'pendingDepositOf', args: [e, owner] })) > 0n ? e : null,
      ),
    ),
    Promise.all(
      past(withdrawEpochs).map(async (e) =>
        (await client.readContract({ address: v, abi, functionName: 'pendingWithdrawOf', args: [e, owner] })) > 0n ? e : null,
      ),
    ),
  ]);
  return {
    nav,
    supply,
    shares,
    value: supply > 0n ? (shares * nav) / supply : 0n,
    atRisk,
    cap: (nav * cfg.maxUtilization) / F,
    epoch,
    nextRoll: Number(end) * 1000,
    queuedDeposit,
    queuedWithdrawShares,
    claimableDeposits: claimableDeposits.filter((e): e is bigint => e !== null),
    claimableWithdrawals: claimableWithdrawals.filter((e): e is bigint => e !== null),
  };
}

/** The venue only sells a side priced inside its entry band (1¢–99¢ as deployed). */
export async function inEntryBand(chance: number): Promise<boolean> {
  const cfg = await fetchConfig();
  const p = BigInt(Math.round(chance * 1e9));
  return p >= cfg.minEntryPrice && p <= cfg.maxEntryPrice;
}
export const ENTRY_BAND = { min: 0.01, max: 0.99 } as const;

/** How much more the pool can pay out right now (MUSD wei): its risk limit minus what is at risk. */
export async function fetchCapacity(): Promise<{ free: bigint; cap: bigint; atRisk: bigint }> {
  const client = mezoClient();
  const [nav, atRisk, cfg] = await Promise.all([
    client.readContract({ address: venue(), abi, functionName: 'navAssets' }),
    client.readContract({ address: venue(), abi, functionName: 'liveMaxLiability' }),
    fetchConfig(),
  ]);
  const cap = (nav * cfg.maxUtilization) / F;
  return { free: cap > atRisk ? cap - atRisk : 0n, cap, atRisk };
}

/** The largest stake a bet at `chance` can take before the pool refuses it (MUSD wei, 0.01 steps). */
export function maxStakeFor(freeWei: bigint, chance: number): bigint {
  if (chance <= 0) return 0n;
  // A bet raises the pool's worst case by at most its payout, and costs about payout × chance × 1.01.
  const stake = (Number(freeWei) / 1e18) * chance * 1.01 * 0.98; // 2% under, so the swipe never trips the limit
  return toWad(stake);
}

// ─── buying MUSD with BTC on Mezo's DEX ───

const routerAbi = parseAbi([
  'struct Route { address from; address to; bool stable; address factory; }',
  'function getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
]);
const btcToMusd = () => [{ from: MEZO_BTC_TOKEN, to: MEZO.musd, stable: false, factory: MEZO.dexFactory }] as const;

/** MUSD out for `btcIn` BTC wei, from the BTC/MUSD pool. */
export async function quoteBtcToMusd(btcIn: bigint): Promise<bigint> {
  if (btcIn === 0n) return 0n;
  const amounts = await mezoClient().readContract({
    address: MEZO.dexRouter,
    abi: routerAbi,
    functionName: 'getAmountsOut',
    args: [btcIn, btcToMusd()],
  });
  return amounts[amounts.length - 1];
}

export async function btcAllowanceForDex(owner: Address): Promise<bigint> {
  return mezoClient().readContract({ address: MEZO_BTC_TOKEN, abi: erc20Abi, functionName: 'allowance', args: [owner, MEZO.dexRouter] });
}

export const txApproveBtcForDex = (amount: bigint): TxRequest => ({
  address: MEZO_BTC_TOKEN,
  abi: erc20Abi,
  functionName: 'approve',
  args: [MEZO.dexRouter, amount],
  gasFloor: 100_000n,
});

export const txSwapBtcForMusd = (btcIn: bigint, minMusdOut: bigint, to: Address): TxRequest => ({
  address: MEZO.dexRouter,
  abi: routerAbi,
  functionName: 'swapExactTokensForTokens',
  args: [btcIn, minMusdOut, btcToMusd(), to, BigInt(Math.floor(Date.now() / 1000) + 600)],
  gasFloor: 350_000n,
});

// ─── transactions (pass to the wallet) ───

export interface TxRequest {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  /**
   * Minimum gas limit. Mezo's public nodes sometimes return estimates far below what a call uses
   * (a createMarket estimated 21,416 against 67,356 used), so each call carries a floor measured on
   * testnet with headroom. Mezo refunds at most half of an unused limit, so a floor of G costs at
   * least G/2 gas: about $0.02 per 300k at mainnet's 0.0015 gwei.
   */
  gasFloor: bigint;
}

// Measured on testnet 2026-09-16: mint 220k–321k, cash out ~153k, approve ~46k, settle ~94k.
export const txApproveMusd = (amount: bigint = maxUint256): TxRequest => ({
  address: MEZO.musd,
  abi: erc20Abi,
  functionName: 'approve',
  args: [venue(), amount],
  gasFloor: 100_000n,
});

export const txMint = (marketId: bigint, lower: bigint, higher: bigint, quantity: bigint, maxCost: bigint): TxRequest => ({
  address: venue(),
  abi,
  functionName: 'mint',
  args: [marketId, Number(lower), Number(higher), quantity, maxCost],
  gasFloor: 500_000n,
});

export const txRedeem = (positionId: bigint, minProceeds: bigint): TxRequest => ({
  address: venue(),
  abi,
  functionName: 'redeem',
  args: [positionId, minProceeds],
  gasFloor: 400_000n,
});

export const txClaim = (positionIds: bigint[]): TxRequest => ({
  address: venue(),
  abi,
  functionName: 'claimMany',
  args: [positionIds],
  gasFloor: 120_000n + 60_000n * BigInt(positionIds.length),
});

const venueTx = (functionName: string, args: readonly unknown[], gasFloor: bigint): TxRequest => ({
  address: venue(),
  abi,
  functionName,
  args,
  gasFloor,
});
export const txSettle = (marketId: bigint) => venueTx('settle', [marketId], 250_000n);
export const txRequestDeposit = (assets: bigint) => venueTx('requestDeposit', [assets], 200_000n);
export const txRequestWithdraw = (shares: bigint) => venueTx('requestWithdraw', [shares], 200_000n);
export const txClaimDeposit = (epoch: bigint) => venueTx('claimDeposit', [epoch], 150_000n);
export const txClaimWithdraw = (epoch: bigint) => venueTx('claimWithdraw', [epoch], 150_000n);

/** Slippage allowances. Short rounds reprice fast: a 16% UP moved 7% in ten seconds on testnet. */
// How far the price may move between the quote and the block. A 5-minute round near 50/50 moves
// about 5¢ on one oracle tick, so a flat percentage is either too tight there or too loose on a
// long shot. The bound is 3¢ per MUSD of payout, kept within a band of the quote.
const PRICE_MOVE_PCT = 3n; // cents per 1 MUSD of payout
const clampMove = (move: bigint, base: bigint, minPct: bigint, maxPct: bigint) => {
  const lo = (base * minPct) / 100n;
  const hi = (base * maxPct) / 100n;
  return move < lo ? lo : move > hi ? hi : move;
};

/** The most a bet may cost once it lands: the quote plus 3¢ per MUSD of payout, 3%–12% of the quote. */
export const maxCostFor = (cost: bigint, quantity: bigint) =>
  cost + clampMove((quantity * PRICE_MOVE_PCT) / 100n, cost, 3n, 12n);

/** What cashing out pays right now, and the least the app will accept once it lands. */
export async function quoteCashOut(positionId: bigint, quantity: bigint): Promise<{ proceeds: bigint; minProceeds: bigint }> {
  const [, proceeds] = await mezoClient().readContract({ address: venue(), abi, functionName: 'quoteRedeem', args: [positionId] });
  return { proceeds, minProceeds: proceeds - clampMove((quantity * PRICE_MOVE_PCT) / 100n, proceeds, 5n, 15n) };
}

/** A price-moved failure worth one more try at a fresh quote. */
export const isPriceMove = (e: unknown) => friendlyError(e) === MEZO_ERRORS.Slippage;

/** The position a mint receipt created, and what it actually charged (the price can move after the quote). */
export function mintedFrom(logs: Log[]): { id: bigint; cost: bigint } | null {
  const venueAddr = venue().toLowerCase();
  const minted = parseEventLogs({ abi, eventName: 'Minted', logs: logs.filter((l) => l.address.toLowerCase() === venueAddr) });
  const args = minted[0]?.args;
  return args ? { id: args.positionId, cost: args.premium + args.fee } : null;
}

/** Plain-language copy for the venue's custom errors. */
export const MEZO_ERRORS: Record<string, string> = {
  MarketNotLive: 'This round is closed.',
  MarketClosed: 'This round has ended.',
  BadRange: 'That price range is outside this round.',
  BadQuantity: 'Amounts go in 0.01 MUSD steps.',
  PriceOutOfBand: 'The odds are too lopsided to trade right now.',
  PremiumTooSmall: 'The smallest bet is 1 MUSD.',
  Slippage: 'The price moved. Try again.',
  ExposureLimit: 'The pool is full for this round. Try a smaller amount.',
  VolStale: 'Prices are refreshing. Try again in a few seconds.',
  SpotStale: 'Waiting for a fresh BTC price.',
  AwaitingOraclePrint: 'Waiting for the settlement price.',
  NotPositionOwner: 'This bet belongs to another wallet.',
  PositionClosed: 'Already closed or collected.',
  EnforcedPause: 'Trading is paused.',
  DepositTooSmall: 'The smallest deposit is 10 MUSD.',
  EpochNeedsRoll: 'The pool is updating. Try again in a minute.',
  EpochNotRolled: 'Not ready yet. It unlocks at the next pool update.',
  NothingToClaim: 'Nothing to collect.',
  ERC20InsufficientBalance: 'Not enough MUSD.',
  ERC20InsufficientAllowance: 'Allow MUSD first.',
};

export function friendlyError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = err?.cause?.data?.errorName;
  if (name && MEZO_ERRORS[name]) return MEZO_ERRORS[name];
  const text = `${err?.shortMessage ?? ''} ${err?.message ?? ''}`;
  for (const [k, v] of Object.entries(MEZO_ERRORS)) if (text.includes(k)) return v;
  if (/insufficient funds|gas required exceeds/i.test(text)) return 'You need a little BTC for gas.';
  if (/fetch|network|timed out|HTTP request failed/i.test(text)) return 'Mezo is not answering. Check your connection and try again.';
  return err?.shortMessage ?? 'Something went wrong. Try again.';
}
