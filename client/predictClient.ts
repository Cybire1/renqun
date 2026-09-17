// YosukuPredict on Mezo — browser-safe data + tx client for a web front end.
//
// Same product model as DeepBook Predict: rolling expiry markets selling European cash-or-nothing
// RANGE DIGITALS on BTC. A position pays `quantity` MUSD if BTC settles in (lower, higher].
// Ticks are absolute indices on the market's grid; strike = tick × tickSize (1e9-scaled USD).
// NEG_INF_TICK / POS_INF_TICK are the open ends, identical to the Sui sentinels.
//
// Differences a caller must know:
//   • collateral is MUSD (18 decimals), not DUSDC (6); quantities are MUSD wei;
//   • no account wrapper / Auth hot-potato: the wallet approves MUSD once and calls `mint`;
//   • each market has its own tickSize and a 256-tick grid starting at `minTick`;
//   • settlement is permissionless (`settle`), payouts are pulled (`claim`).
//
// Reads are plain viem calls; writes return `writeContract` parameters for the caller's wallet.

import {
  createPublicClient,
  http,
  maxUint256,
  parseAbiItem,
  type Address,
  type PublicClient,
} from 'viem';
import { yosukuPredictAbi } from './abi/yosukuPredict';
import { MEZO, MEZO_PRICE_ORACLE, mezoChain } from './network';

export const FLOAT_SCALING = 1_000_000_000n;
export const POS_INF_TICK = (1n << 30n) - 1n; // 1073741823n, as on Sui
export const NEG_INF_TICK = 0n;
export const GRID_TICKS = 256;
export const MUSD_DECIMALS = 18;

export type Cadence = '1m' | '5m' | '1h' | '1d';
export type MarketStatus = 'none' | 'live' | 'settled' | 'void';
const STATUS: MarketStatus[] = ['none', 'live', 'settled', 'void'];

export interface MezoMarket {
  id: bigint;
  /** Expiry, ms epoch (seconds on-chain ×1000, to match Market624). */
  expiry: number;
  cadence: Cadence;
  epoch: bigint;
  /** 1e9-scaled USD per tick. */
  tickSize: bigint;
  minTick: bigint;
  maxTick: bigint;
  status: MarketStatus;
  /** 1e9-scaled USD; 0n until settled. */
  settlementPrice: bigint;
  maxLiability: bigint;
}

export interface MezoPosition {
  id: bigint;
  owner: Address;
  marketId: bigint;
  lowerTick: bigint;
  higherTick: bigint;
  open: boolean;
  quantity: bigint;
  premium: bigint;
}

let _client: PublicClient | null = null;
export function mezoClient(): PublicClient {
  _client ??= createPublicClient({ chain: mezoChain, transport: http(MEZO.rpcUrl) }) as PublicClient;
  return _client;
}

function venue(): Address {
  if (!MEZO.predict) throw new Error(`YosukuPredict is not deployed on Mezo ${MEZO.network} yet`);
  return MEZO.predict;
}

// ─── tick math ───

/** USD strike → tick on a market's grid (nearest). */
export function usdToTick(usd: number, tickSize: bigint): bigint {
  const raw = BigInt(Math.round(usd * 1e9));
  return (raw + tickSize / 2n) / tickSize;
}

/** Tick → USD strike. Open ends map to ±Infinity. */
export function tickToUsd(tick: bigint, tickSize: bigint): number {
  if (tick === NEG_INF_TICK) return -Infinity;
  if (tick === POS_INF_TICK) return Infinity;
  return Number(tick * tickSize) / 1e9;
}

export function inferCadence(expiryMs: number): Cadence {
  if (expiryMs % 86_400_000 === 0) return '1d';
  if (expiryMs % 3_600_000 === 0) return '1h';
  return expiryMs % 300_000 === 0 ? '5m' : '1m';
}

/** Directional bet as a range: UP = (strike, +∞), DOWN = (−∞, strike]. */
export function directionalRange(dir: 'up' | 'down', strikeTick: bigint): [bigint, bigint] {
  return dir === 'up' ? [strikeTick, POS_INF_TICK] : [NEG_INF_TICK, strikeTick];
}

/**
 * Did a range win? Mirrors the contract and DeepBook `range_codec::settlement_in_range`:
 * pays on (lower, higher]. Note lib/sui/settlement.ts#isWinningRange uses [lower, higher),
 * which disagrees with the Move source at the exact boundary.
 */
export function isWinningRange(settlement: bigint, lowerTick: bigint, higherTick: bigint, tickSize: bigint): boolean {
  const limit = (settlement + tickSize - 1n) / tickSize;
  return lowerTick < limit && (higherTick === POS_INF_TICK || limit <= higherTick);
}

// ─── reads ───

export async function fetchSpot(): Promise<{ usd: number; raw: bigint; updatedAt: number }> {
  const [, answer, , updatedAt] = await mezoClient().readContract({
    address: MEZO_PRICE_ORACLE,
    abi: [parseAbiItem('function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)')],
    functionName: 'latestRoundData',
  });
  return { usd: Number(answer) / 1e18, raw: answer / 1_000_000_000n, updatedAt: Number(updatedAt) * 1000 };
}

export async function fetchMarket(id: bigint): Promise<MezoMarket> {
  const [expiry, epoch, tickSize, minTick, status, settlementPrice, maxLiability] =
    await mezoClient().readContract({ address: venue(), abi: yosukuPredictAbi, functionName: 'markets', args: [id] });
  const expiryMs = Number(expiry) * 1000;
  return {
    id,
    expiry: expiryMs,
    cadence: inferCadence(expiryMs),
    epoch,
    tickSize,
    minTick: BigInt(minTick),
    maxTick: BigInt(minTick) + BigInt(GRID_TICKS - 1),
    status: STATUS[status] ?? 'none',
    settlementPrice,
    maxLiability,
  };
}

/** Live, unexpired markets, soonest expiry first. Scans the most recent `lookback` ids. */
export async function fetchLiveMarkets(lookback = 64): Promise<MezoMarket[]> {
  const count = await mezoClient().readContract({ address: venue(), abi: yosukuPredictAbi, functionName: 'marketCount' });
  const ids: bigint[] = [];
  for (let i = count; i > 0n && ids.length < lookback; i--) ids.push(i);
  const markets = await Promise.all(ids.map(fetchMarket));
  const now = Date.now();
  return markets.filter((m) => m.status === 'live' && m.expiry > now).sort((a, b) => a.expiry - b.expiry);
}

export interface Quote {
  /** Probability, 1e9-scaled. */
  price: bigint;
  premium: bigint;
  fee: bigint;
  /** premium + fee: what the wallet pays. */
  cost: bigint;
}

export async function quote(marketId: bigint, lowerTick: bigint, higherTick: bigint, quantity: bigint): Promise<Quote> {
  const [price, premium, fee] = await mezoClient().readContract({
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'quote',
    args: [marketId, Number(lowerTick), Number(higherTick), quantity],
  });
  return { price, premium, fee, cost: premium + fee };
}

/** Largest quantity (in 0.01-MUSD lots) whose cost fits `stake`, from a live price. */
export function quantityForStake(stake: bigint, price: bigint, feeRate: bigint, lot = 10n ** 16n): bigint {
  if (price === 0n) return 0n;
  const perUnitCost = (price * (FLOAT_SCALING + feeRate)) / FLOAT_SCALING; // 1e9-scaled
  const qty = (stake * FLOAT_SCALING) / perUnitCost;
  return (qty / lot) * lot;
}

export async function quoteRedeem(positionId: bigint): Promise<{ price: bigint; proceeds: bigint; fee: bigint }> {
  const [price, proceeds, fee] = await mezoClient().readContract({
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'quoteRedeem',
    args: [positionId],
  });
  return { price, proceeds, fee };
}

export async function fetchPosition(id: bigint): Promise<MezoPosition> {
  const [owner, marketId, lowerTick, higherTick, open, quantity, premium] = await mezoClient().readContract({
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'positions',
    args: [id],
  });
  return { id, owner, marketId, lowerTick: BigInt(lowerTick), higherTick: BigInt(higherTick), open, quantity, premium };
}

/** Mezo's public RPC rejects eth_getLogs spans over 10,000 blocks (~11 hours). */
const LOG_SPAN = 9_999n;

/** Every position an address ever opened (from indexed Minted events), newest first. */
export async function fetchPositionsOf(owner: Address): Promise<MezoPosition[]> {
  const client = mezoClient();
  const head = await client.getBlockNumber();
  const ids: bigint[] = [];
  for (let from = MEZO.deployBlock; from <= head; from += LOG_SPAN + 1n) {
    const to = from + LOG_SPAN > head ? head : from + LOG_SPAN;
    const logs = await client.getContractEvents({
      address: venue(),
      abi: yosukuPredictAbi,
      eventName: 'Minted',
      args: { owner },
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs) ids.push(l.args.positionId!);
  }
  return Promise.all(ids.reverse().map(fetchPosition));
}

export async function musdAllowance(owner: Address): Promise<bigint> {
  return mezoClient().readContract({
    address: MEZO.musd,
    abi: [parseAbiItem('function allowance(address,address) view returns (uint256)')],
    functionName: 'allowance',
    args: [owner, venue()],
  });
}

// ─── writes (pass to walletClient.writeContract) ───

export function buildApproveMusd(amount: bigint = maxUint256) {
  return {
    address: MEZO.musd,
    abi: [parseAbiItem('function approve(address,uint256) returns (bool)')],
    functionName: 'approve' as const,
    args: [venue(), amount] as const,
    chain: mezoChain,
  };
}

/** Buy a range digital. `maxCost` guards slippage: pass the quoted cost with a small buffer. */
export function buildMint(p: { marketId: bigint; lowerTick: bigint; higherTick: bigint; quantity: bigint; maxCost: bigint }) {
  return {
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'mint' as const,
    args: [p.marketId, Number(p.lowerTick), Number(p.higherTick), p.quantity, p.maxCost] as const,
    chain: mezoChain,
  };
}

export function buildRedeem(positionId: bigint, minProceeds: bigint) {
  return {
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'redeem' as const,
    args: [positionId, minProceeds] as const,
    chain: mezoChain,
  };
}

export function buildClaim(positionIds: bigint[]) {
  return {
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'claimMany' as const,
    args: [positionIds] as const,
    chain: mezoChain,
  };
}

export function buildSettle(marketId: bigint) {
  return {
    address: venue(),
    abi: yosukuPredictAbi,
    functionName: 'settle' as const,
    args: [marketId] as const,
    chain: mezoChain,
  };
}

/** Friendly copy for the venue's custom errors (mirrors friendlyVault624Error). */
export const MEZO_PREDICT_ERRORS: Record<string, string> = {
  MarketNotLive: 'This market is closed.',
  MarketClosed: 'This market has expired.',
  BadRange: 'That price range is outside this market.',
  BadQuantity: 'Size must be in 0.01 MUSD steps.',
  PriceOutOfBand: 'Odds are too extreme to trade right now.',
  PremiumTooSmall: 'Minimum bet is 1 MUSD.',
  Slippage: 'The price moved. Try again.',
  ExposureLimit: 'The pool is at capacity for this market. Try a smaller size.',
  VolStale: 'Pricing is refreshing. Try again in a few seconds.',
  SpotStale: 'Waiting for a fresh BTC price.',
  AwaitingOraclePrint: 'Waiting for the settlement price.',
  NotPositionOwner: 'This is not your position.',
  PositionClosed: 'Already closed or claimed.',
  EnforcedPause: 'Trading is paused.',
};
