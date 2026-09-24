// What already happened on Renqun: a round's story, a day of rounds, a wallet's record, one bet's
// story for a share card, and the venue's public numbers. Everything is read from the chain (the
// contract, and Mezo's oracle at past blocks) or from Mezo's explorer, which indexes the contract's
// events. Nothing comes from a server of ours, so every figure can be re-derived by anyone.
import { decodeEventLog, pad, toEventSelector, toHex, type AbiEvent, type Address, type Hex } from 'viem';
import { yosukuPredictAbi as abi } from './abi/yosukuPredict';
import { MEZO, MEZO_PRICE_ORACLE } from './network';
import {
  NEG_INF_TICK,
  POS_INF_TICK,
  fetchMarket,
  fromF,
  inRange,
  mezoClient,
  tickToUsd,
  venue,
  type Cadence,
  type Market,
  type SpotPoint,
} from './venue';

const oracleAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { type: 'uint80' },
      { type: 'int256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint80' },
    ],
  },
] as const;

// ─── rounds ───

/** How long each kind of round runs, as the apps present it: the window its chart covers. The
 *  "later today" round runs for one pool period. */
export const ROUND_WINDOW_MS: Record<Cadence, number> = {
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '1d': 6 * 60 * 60_000,
};

export type Outcome = 'up' | 'down' | 'void' | 'live';

/** Who won a round: Up pays strictly above the line, Down at or below it. */
export function outcomeOf(m: Market): Outcome {
  if (m.status === 'void') return 'void';
  if (m.status !== 'settled') return 'live';
  return inRange(m.settlementRaw, m.strikeTick, POS_INF_TICK, m.tickSize) ? 'up' : 'down';
}

export type BetSide = 'up' | 'down' | 'range';

export const sideOf = (lower: bigint, higher: bigint): BetSide =>
  higher === POS_INF_TICK ? 'up' : lower === NEG_INF_TICK ? 'down' : 'range';

/** A bet in words: "Above $84,350", "At or below $84,350", "$84,350 – $84,400". */
export function callWords(side: BetSide, lower: bigint, higher: bigint, m: Market): string {
  if (side === 'up') return `Above ${usd(tickToUsd(lower, m.tickSize))}`;
  if (side === 'down') return `At or below ${usd(tickToUsd(higher, m.tickSize))}`;
  return `${usd(tickToUsd(lower, m.tickSize))} – ${usd(tickToUsd(higher, m.tickSize))}`;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export interface DaySummary {
  total: number;
  settled: number;
  refunded: number;
  live: number;
  up: number;
  down: number;
  /** The longest run of one side winning, in closing order. */
  streak: { side: 'up' | 'down'; count: number; from: Market; to: Market } | null;
  /** Lowest and highest settlement prints of the day's rounds. */
  low: number | null;
  high: number | null;
  /** The round whose close landed furthest from its line. */
  biggest: { market: Market; move: number } | null;
}

export function summarizeRounds(markets: Market[]): DaySummary {
  const sorted = [...markets].sort((a, b) => a.expiry - b.expiry);
  let up = 0;
  let down = 0;
  let refunded = 0;
  let live = 0;
  let low: number | null = null;
  let high: number | null = null;
  let biggest = null as DaySummary['biggest'];
  let streak = null as DaySummary['streak'];
  // Asserted rather than annotated, so the checker does not narrow it to null before the loop.
  let run = null as { side: 'up' | 'down'; count: number; from: Market } | null;
  for (const m of sorted) {
    const o = outcomeOf(m);
    if (o === 'live') {
      live++;
      continue;
    }
    if (o === 'void') {
      refunded++;
      continue;
    }
    if (o === 'up') up++;
    else down++;
    const s = m.settlement ?? m.strike;
    low = low == null ? s : Math.min(low, s);
    high = high == null ? s : Math.max(high, s);
    const move = s - m.strike;
    if (!biggest || Math.abs(move) > Math.abs(biggest.move)) biggest = { market: m, move };
    run = run && run.side === o ? { side: o, count: run.count + 1, from: run.from } : { side: o, count: 1, from: m };
    if (!streak || run.count > streak.count) streak = { side: run.side, count: run.count, from: run.from, to: m };
  }
  return { total: markets.length, settled: up + down, refunded, live, up, down, streak, low, high, biggest };
}

// ─── the explorer's event index ───

export interface ChainLog<T> {
  args: T;
  block: bigint;
  /** ms epoch of the block. */
  time: number;
  tx: Hex;
  logIndex: number;
}

type IndexedEvent = 'Minted' | 'Redeemed' | 'Claimed' | 'Settled' | 'Voided' | 'EpochRolled' | 'MarketCreated';

interface ExplorerRow {
  data: Hex;
  topics: (Hex | null)[];
  blockNumber: Hex;
  timeStamp: Hex;
  transactionHash: Hex;
  logIndex?: Hex;
}

/**
 * Every `eventName` the contract emitted, optionally filtered on indexed topics, oldest first. The
 * explorer answers with the newest 1,000 matches (in block order), so a full page continues backwards
 * from its oldest block; rows at that block repeat and are dropped.
 */
export async function contractEvents<T>(
  eventName: IndexedEvent,
  topics: Partial<Record<1 | 2 | 3, Hex>> = {},
  fromBlock: bigint = MEZO.deployBlock,
): Promise<ChainLog<T>[]> {
  const item = abi.find((x) => x.type === 'event' && x.name === eventName);
  if (!item) throw new Error(`no event ${eventName}`);
  const topic0 = toEventSelector(item as AbiEvent);
  const out: ChainLog<T>[] = [];
  const seen = new Set<string>();
  let to: bigint | 'latest' = 'latest';
  for (let page = 0; page < 25; page++) {
    const q = new URLSearchParams({ module: 'logs', action: 'getLogs', fromBlock: fromBlock.toString(), toBlock: to.toString(), address: venue(), topic0 });
    for (const [k, v] of Object.entries(topics)) {
      if (!v) continue;
      q.set(`topic${k}`, v);
      q.set(`topic0_${k}_opr`, 'and');
    }
    const res = await fetch(`${MEZO.explorerApi}?${q}`, { signal: AbortSignal.timeout(12_000) });
    const body = (await res.json()) as { message?: string; result?: ExplorerRow[] | string };
    if (!Array.isArray(body.result)) {
      if (typeof body.message === 'string' && /no (records|logs)/i.test(body.message)) break;
      throw new Error(`explorer: ${body.message ?? 'bad response'}`);
    }
    for (const row of body.result) {
      const key = `${row.transactionHash}:${row.logIndex ?? '0x0'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const decoded = decodeEventLog({
        abi,
        data: row.data,
        topics: row.topics.filter((t): t is Hex => t != null) as [Hex, ...Hex[]],
      });
      out.push({
        args: decoded.args as T,
        block: BigInt(row.blockNumber),
        time: Number(BigInt(row.timeStamp)) * 1000,
        tx: row.transactionHash,
        logIndex: Number(BigInt(row.logIndex ?? '0x0')),
      });
    }
    if (body.result.length < 1000) break;
    const oldest = body.result.reduce((b, r) => (BigInt(r.blockNumber) < b ? BigInt(r.blockNumber) : b), BigInt(body.result[0].blockNumber));
    if (to !== 'latest' && oldest >= to) break; // one block holds a full page; nothing older to reach
    to = oldest;
  }
  return out.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
}

const topicOf = (n: bigint) => pad(toHex(n));
const topicOfAddress = (a: Address) => pad(a.toLowerCase() as Hex);

interface MintedArgs {
  positionId: bigint;
  marketId: bigint;
  owner: Address;
  lowerTick: number;
  higherTick: number;
  quantity: bigint;
  price: bigint;
  premium: bigint;
  fee: bigint;
}
interface RedeemedArgs {
  positionId: bigint;
  owner: Address;
  price: bigint;
  proceeds: bigint;
  fee: bigint;
}
interface ClaimedArgs {
  positionId: bigint;
  owner: Address;
  payout: bigint;
}
interface SettledArgs {
  marketId: bigint;
  settlementPrice: bigint;
  payout: bigint;
}
interface VoidedArgs {
  marketId: bigint;
  refund: bigint;
}
interface EpochRolledArgs {
  epoch: bigint;
  nav: bigint;
  supply: bigint;
  releasedAssets: bigint;
  mintedShares: bigint;
}
interface MarketCreatedArgs {
  marketId: bigint;
  epoch: bigint;
  expiry: bigint;
  tickSize: bigint;
  minTick: number;
}

// ─── BTC over a past window, from the oracle itself ───

const pathCache = new Map<string, SpotPoint[]>();

/**
 * Mezo's oracle between two moments, read at past blocks (the RPC keeps full history). Block numbers
 * are placed by the chain's own timestamps rather than an assumed block time, so a window days old
 * still lands on the right minutes. Each point carries the oracle's own update time.
 */
export async function fetchSpotBetween(fromMs: number, toMs: number, points = 48): Promise<SpotPoint[]> {
  const key = `${fromMs}:${toMs}:${points}`;
  const cached = pathCache.get(key);
  if (cached) return cached;
  const client = mezoClient();
  const head = await client.getBlock();
  const headMs = Number(head.timestamp) * 1000;
  const endMs = Math.min(toMs, headMs);
  const guess = (t: number) => {
    const back = BigInt(Math.max(0, Math.round((headMs - t) / 1000 / MEZO.blockSeconds)));
    return head.number > back ? head.number - back : 1n;
  };
  // One correction against the real timestamp of the guessed end block, then the local block time
  // between it and the head places the start.
  let endBlock = guess(endMs);
  const probe = await client.getBlock({ blockNumber: endBlock });
  const probeMs = Number(probe.timestamp) * 1000;
  const span = Number(head.number - endBlock);
  const secPerBlock = span > 50 ? (headMs - probeMs) / 1000 / span : MEZO.blockSeconds;
  const drift = BigInt(Math.round((endMs - probeMs) / 1000 / secPerBlock));
  endBlock = endBlock + drift > head.number ? head.number : endBlock + drift;
  const back = BigInt(Math.max(1, Math.round((endMs - fromMs) / 1000 / secPerBlock)));
  const startBlock = endBlock > back ? endBlock - back : 1n;

  const n = Math.max(2, points);
  const step = (endBlock - startBlock) / BigInt(n - 1) || 1n;
  const blocks: bigint[] = [];
  for (let b = startBlock; b <= endBlock && blocks.length < n; b += step) blocks.push(b);
  if (blocks[blocks.length - 1] !== endBlock) blocks.push(endBlock);
  const rows = await Promise.all(
    blocks.map((blockNumber) =>
      client.readContract({ address: MEZO_PRICE_ORACLE, abi: oracleAbi, functionName: 'latestRoundData', blockNumber }).catch(() => null),
    ),
  );
  const byTime = new Map<number, number>();
  for (const r of rows) if (r) byTime.set(Number(r[3]) * 1000, Number(r[1]) / 1e18);
  const out = [...byTime.entries()].map(([t, v]) => ({ t, usd: v })).sort((a, b) => a.t - b.t);
  if (toMs < headMs - 60_000 && out.length > 4) pathCache.set(key, out);
  return out;
}

// ─── one round ───

export interface RoundBet {
  positionId: bigint;
  owner: Address;
  side: BetSide;
  lower: bigint;
  higher: bigint;
  /** What the bet pays if it wins, MUSD wei. */
  quantity: bigint;
  /** Premium plus fee, MUSD wei. */
  cost: bigint;
  /** The price paid per 1 MUSD of payout, 0..1. */
  price: number;
  time: number;
  tx: Hex;
  result: 'won' | 'lost' | 'refunded' | 'cashed' | 'live';
  /** What it paid or pays back (wins, refunds, cash-outs); null while live. */
  paid: bigint | null;
}

export interface RoundDetail {
  market: Market;
  outcome: Outcome;
  /** When the keeper opened the round and set its line (ms). */
  openedAt: number;
  openTx: Hex | null;
  settledAt: number | null;
  settleTx: Hex | null;
  /** Settled: what the pool owes winners. Voided: what it refunds. */
  payout: bigint;
  bets: RoundBet[];
}

export async function fetchRoundDetail(id: bigint): Promise<RoundDetail> {
  const market = await fetchMarket(id);
  const t = topicOf(id);
  const [created, settled, voided, minted] = await Promise.all([
    contractEvents<MarketCreatedArgs>('MarketCreated', { 1: t }),
    market.status === 'settled' ? contractEvents<SettledArgs>('Settled', { 1: t }) : Promise.resolve([]),
    market.status === 'void' ? contractEvents<VoidedArgs>('Voided', { 1: t }) : Promise.resolve([]),
    contractEvents<MintedArgs>('Minted', { 2: t }),
  ]);
  const redeemed = (
    await Promise.all(minted.map((m) => contractEvents<RedeemedArgs>('Redeemed', { 1: topicOf(m.args.positionId) })))
  ).flat();
  const cashed = new Map(redeemed.map((r) => [r.args.positionId.toString(), r.args.proceeds]));
  const outcome = outcomeOf(market);
  const bets: RoundBet[] = minted.map((l) => {
    const a = l.args;
    const lower = BigInt(a.lowerTick);
    const higher = BigInt(a.higherTick);
    const proceeds = cashed.get(a.positionId.toString());
    let result: RoundBet['result'] = 'live';
    let paid: bigint | null = null;
    if (proceeds != null) {
      result = 'cashed';
      paid = proceeds;
    } else if (outcome === 'void') {
      result = 'refunded';
      paid = a.premium;
    } else if (outcome !== 'live') {
      const won = inRange(market.settlementRaw, lower, higher, market.tickSize);
      result = won ? 'won' : 'lost';
      paid = won ? a.quantity : 0n;
    }
    return {
      positionId: a.positionId,
      owner: a.owner,
      side: sideOf(lower, higher),
      lower,
      higher,
      quantity: a.quantity,
      cost: a.premium + a.fee,
      price: fromF(a.price),
      time: l.time,
      tx: l.tx,
      result,
      paid,
    };
  });
  const close = settled[0] ?? voided[0] ?? null;
  const opened = created[0] ?? null;
  return {
    market,
    outcome,
    openedAt: opened ? opened.time : market.expiry - ROUND_WINDOW_MS[market.cadence],
    openTx: opened?.tx ?? null,
    settledAt: close?.time ?? null,
    settleTx: close?.tx ?? null,
    payout: settled[0]?.args.payout ?? voided[0]?.args.refund ?? 0n,
    bets,
  };
}

/** How many rounds the keeper has opened: the newest round's id. */
export async function fetchMarketCount(): Promise<bigint> {
  return mezoClient().readContract({ address: venue(), abi, functionName: 'marketCount' });
}

/** The same kind of round just before and after this one, by id (the kinds interleave). */
export async function neighbourRounds(m: Market, maxId: bigint): Promise<{ prev: Market | null; next: Market | null }> {
  const look = async (dir: 1n | -1n): Promise<Market | null> => {
    const ids: bigint[] = [];
    for (let i = 1n; i <= 16n; i++) {
      const id = m.id + dir * i;
      if (id < 1n || id > maxId) break;
      ids.push(id);
    }
    const found = await Promise.all(ids.map(fetchMarket));
    return found.find((x) => x.status !== 'none' && x.cadence === m.cadence) ?? null;
  };
  const [prev, next] = await Promise.all([look(-1n), look(1n)]);
  return { prev, next };
}

// ─── one bet, for a share card ───

export interface PositionStory {
  id: bigint;
  owner: Address;
  market: Market;
  side: BetSide;
  lower: bigint;
  higher: bigint;
  quantity: bigint;
  cost: bigint;
  price: number;
  placedAt: number;
  tx: Hex | null;
  result: RoundBet['result'];
  paid: bigint | null;
}

export async function fetchPositionStory(id: bigint): Promise<PositionStory | null> {
  const client = mezoClient();
  const count = await client.readContract({ address: venue(), abi, functionName: 'positionCount' });
  if (id < 1n || id > count) return null;
  const [row, minted, redeemed] = await Promise.all([
    client.readContract({ address: venue(), abi, functionName: 'positions', args: [id] }),
    contractEvents<MintedArgs>('Minted', { 1: topicOf(id) }),
    contractEvents<RedeemedArgs>('Redeemed', { 1: topicOf(id) }),
  ]);
  const [owner, marketId, lowerN, higherN, , quantity, premium] = row;
  const market = await fetchMarket(marketId);
  const lower = BigInt(lowerN);
  const higher = BigInt(higherN);
  const mint = minted[0]?.args;
  const outcome = outcomeOf(market);
  let result: RoundBet['result'] = 'live';
  let paid: bigint | null = null;
  if (redeemed[0]) {
    result = 'cashed';
    paid = redeemed[0].args.proceeds;
  } else if (outcome === 'void') {
    result = 'refunded';
    paid = premium;
  } else if (outcome !== 'live') {
    const won = inRange(market.settlementRaw, lower, higher, market.tickSize);
    result = won ? 'won' : 'lost';
    paid = won ? quantity : 0n;
  }
  return {
    id,
    owner,
    market,
    side: sideOf(lower, higher),
    lower,
    higher,
    quantity,
    cost: mint ? mint.premium + mint.fee : premium,
    price: mint ? fromF(mint.price) : Number(premium) / Number(quantity || 1n),
    placedAt: minted[0]?.time ?? market.expiry,
    tx: minted[0]?.tx ?? null,
    result,
    paid,
  };
}

// ─── a wallet's record ───

export interface RecordEntry {
  positionId: bigint;
  market: Market;
  side: BetSide;
  lower: bigint;
  higher: bigint;
  cost: bigint;
  quantity: bigint;
  result: RoundBet['result'];
  paid: bigint | null;
  /** When the outcome was fixed: the round's close, or the moment of a cash-out. */
  at: number;
}

export interface WalletRecord {
  entries: RecordEntry[];
  /** Bets with an outcome (won, lost, cashed out; refunds are left out). */
  decided: number;
  won: number;
  lost: number;
  cashed: number;
  refunded: number;
  live: number;
  /** Paid back minus paid in, over decided bets, MUSD wei (can be negative). */
  net: bigint;
  staked: bigint;
  best: RecordEntry | null;
  /** The current run of wins or losses, newest first. */
  run: { kind: 'won' | 'lost'; count: number } | null;
  /** Running net result after each decided bet, oldest first. */
  curve: { t: number; net: number }[];
}

export async function fetchRecord(owner: Address): Promise<WalletRecord> {
  const o = topicOfAddress(owner);
  const [minted, redeemed] = await Promise.all([
    contractEvents<MintedArgs>('Minted', { 3: o }),
    contractEvents<RedeemedArgs>('Redeemed', { 2: o }),
  ]);
  const cashed = new Map(redeemed.map((r) => [r.args.positionId.toString(), r]));
  const markets = await Promise.all(minted.map((l) => fetchMarket(l.args.marketId)));
  const entries: RecordEntry[] = minted.map((l, i) => {
    const a = l.args;
    const market = markets[i];
    const lower = BigInt(a.lowerTick);
    const higher = BigInt(a.higherTick);
    const outcome = outcomeOf(market);
    const r = cashed.get(a.positionId.toString());
    let result: RecordEntry['result'] = 'live';
    let paid: bigint | null = null;
    let at = market.expiry;
    if (r) {
      result = 'cashed';
      paid = r.args.proceeds;
      at = r.time;
    } else if (outcome === 'void') {
      result = 'refunded';
      paid = a.premium;
    } else if (outcome !== 'live') {
      const won = inRange(market.settlementRaw, lower, higher, market.tickSize);
      result = won ? 'won' : 'lost';
      paid = won ? a.quantity : 0n;
    }
    return { positionId: a.positionId, market, side: sideOf(lower, higher), lower, higher, cost: a.premium + a.fee, quantity: a.quantity, result, paid, at };
  });

  const decided = entries.filter((e) => e.result === 'won' || e.result === 'lost' || e.result === 'cashed').sort((a, b) => a.at - b.at);
  let net = 0n;
  const curve: WalletRecord['curve'] = [];
  for (const e of decided) {
    net += (e.paid ?? 0n) - e.cost;
    curve.push({ t: e.at, net: Number(net) / 1e18 });
  }
  const gain = (e: RecordEntry) => (e.paid ?? 0n) - e.cost;
  const best = decided.filter((e) => e.result === 'won').reduce<RecordEntry | null>((b, e) => (!b || gain(e) > gain(b) ? e : b), null);
  let run: WalletRecord['run'] = null;
  for (const e of [...decided].reverse()) {
    if (e.result === 'cashed') continue;
    const kind = e.result as 'won' | 'lost';
    if (!run) run = { kind, count: 1 };
    else if (run.kind === kind) run.count++;
    else break;
  }
  return {
    entries: entries.sort((a, b) => b.at - a.at),
    decided: decided.length,
    won: decided.filter((e) => e.result === 'won').length,
    lost: decided.filter((e) => e.result === 'lost').length,
    cashed: decided.filter((e) => e.result === 'cashed').length,
    refunded: entries.filter((e) => e.result === 'refunded').length,
    live: entries.filter((e) => e.result === 'live').length,
    net,
    staked: entries.reduce((s, e) => s + e.cost, 0n),
    best,
    run,
    curve,
  };
}

// ─── the venue's public numbers ───

export interface VenueStats {
  generatedAt: number;
  rounds: { total: number; settled: number; refunded: number; live: number };
  /** Rounds closed per UTC day, oldest first. */
  days: { day: string; settled: number; refunded: number }[];
  bets: { count: number; wallets: number; staked: bigint; fees: bigint; paidOut: bigint };
  /** The last seven days: the Founder Program's weekly measures. */
  week: { players: number; bets: number; staked: bigint };
  pool: { nav: bigint; supply: bigint; atRisk: bigint; history: { t: number; nav: number; price: number }[] };
  keeper: {
    lastSettledAt: number | null;
    lastRefundAt: number | null;
    /** Rounds settled in a row since the last refund. */
    settledSinceRefund: number;
    /** Median seconds from a round's close to its settlement, over the latest 40 rounds. */
    medianDelaySec: number | null;
  };
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function fetchVenueStats(): Promise<VenueStats> {
  const client = mezoClient();
  const v = venue();
  const [count, nav, supply, atRisk, settled, voided, minted, redeemed, claimed, rolled] = await Promise.all([
    client.readContract({ address: v, abi, functionName: 'marketCount' }),
    client.readContract({ address: v, abi, functionName: 'navAssets' }),
    client.readContract({ address: v, abi, functionName: 'totalSupply' }),
    client.readContract({ address: v, abi, functionName: 'liveMaxLiability' }),
    contractEvents<SettledArgs>('Settled'),
    contractEvents<VoidedArgs>('Voided'),
    contractEvents<MintedArgs>('Minted'),
    contractEvents<RedeemedArgs>('Redeemed'),
    contractEvents<ClaimedArgs>('Claimed'),
    contractEvents<EpochRolledArgs>('EpochRolled'),
  ]);

  const days = new Map<string, { settled: number; refunded: number }>();
  const bump = (ms: number, k: 'settled' | 'refunded') => {
    const d = dayKey(ms);
    const row = days.get(d) ?? { settled: 0, refunded: 0 };
    row[k]++;
    days.set(d, row);
  };
  settled.forEach((l) => bump(l.time, 'settled'));
  voided.forEach((l) => bump(l.time, 'refunded'));

  const weekAgo = Date.now() - 7 * 86_400_000;
  const recentMints = minted.filter((l) => l.time >= weekAgo);

  const lastVoid = voided[voided.length - 1] ?? null;
  const settledSinceRefund = lastVoid ? settled.filter((l) => l.block > lastVoid.block).length : settled.length;
  const latest = settled.slice(-40);
  const latestMarkets = await Promise.all(latest.map((l) => fetchMarket(l.args.marketId)));
  const delays = latest.map((l, i) => (l.time - latestMarkets[i].expiry) / 1000).filter((s) => s >= 0).sort((a, b) => a - b);

  return {
    generatedAt: Date.now(),
    rounds: {
      total: Number(count),
      settled: settled.length,
      refunded: voided.length,
      live: Math.max(0, Number(count) - settled.length - voided.length),
    },
    days: [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, r]) => ({ day, ...r })),
    bets: {
      count: minted.length,
      wallets: new Set(minted.map((l) => l.args.owner.toLowerCase())).size,
      staked: minted.reduce((s, l) => s + l.args.premium + l.args.fee, 0n),
      fees: minted.reduce((s, l) => s + l.args.fee, 0n) + redeemed.reduce((s, l) => s + l.args.fee, 0n),
      paidOut: claimed.reduce((s, l) => s + l.args.payout, 0n) + redeemed.reduce((s, l) => s + l.args.proceeds, 0n),
    },
    week: {
      players: new Set(recentMints.map((l) => l.args.owner.toLowerCase())).size,
      bets: recentMints.length,
      staked: recentMints.reduce((s, l) => s + l.args.premium + l.args.fee, 0n),
    },
    pool: {
      nav,
      supply,
      atRisk,
      history: rolled.map((l) => ({
        t: l.time,
        nav: Number(l.args.nav) / 1e18,
        price: l.args.supply > 0n ? Number((l.args.nav * 10n ** 18n) / l.args.supply) / 1e18 : 0,
      })),
    },
    keeper: {
      lastSettledAt: settled[settled.length - 1]?.time ?? null,
      lastRefundAt: lastVoid?.time ?? null,
      settledSinceRefund,
      medianDelaySec: delays.length ? delays[Math.floor(delays.length / 2)] : null,
    },
  };
}
