'use client';
// Live data for the Renqun pages. Every hook polls while the tab is visible, and `refreshAll()`
// makes all of them refetch at once after a transaction lands.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  fetchBalances,
  fetchCapacity,
  fetchPositions,
  fetchLaterMarket,
  fetchMarketsSince,
  fetchRecentMarkets,
  fetchSpot,
  fetchSpotHistory,
  fetchVault,
  rangeChance,
  sideRange,
  type Balances,
  type Market,
  type Position,
  type SpotPoint,
  type Vault,
} from '@renqun/client';

const bus = new Set<() => void>();
/** Last good answer per key, shared by every page, so a page opens with numbers instead of dashes. */
const lastGood = new Map<string, unknown>();

/** Refetch every mounted hook now (call after a transaction lands). */
export function refreshAll(): void {
  bus.forEach((fn) => fn());
}

export interface Poll<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function usePoll<T>(
  fetcher: (() => Promise<T>) | null,
  intervalMs: number,
  key: string,
  opts: { keepData?: boolean } = {},
): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(key);
  keyRef.current = key;
  const inflight = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const f = fetcherRef.current;
    const k = keyRef.current;
    if (!f || inflight.current) return;
    inflight.current = true;
    try {
      const next = await f();
      lastGood.set(k, next);
      if (alive.current && keyRef.current === k) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      inflight.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  // A new key (another address, another market) starts clean, unless the caller would rather keep
  // the last answer on screen while the next one loads (quotes as the stake changes).
  const keepData = opts.keepData ?? false;
  const enabled = fetcher !== null;
  useEffect(() => {
    alive.current = true;
    const cached = lastGood.get(key) as T | undefined;
    if (cached !== undefined) setData(cached);
    else if (!keepData) setData(null);
    setLoading(cached === undefined && fetcherRef.current !== null);
    inflight.current = false;
    void refresh();

    let timer: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        timer ??= setInterval(() => void refresh(), intervalMs);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    bus.add(refresh);
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      bus.delete(refresh);
    };
  }, [key, refresh, keepData, intervalMs, enabled]);

  return { data, error, loading, refresh };
}

/** Whether a media query matches; null until mounted, so server and client agree. */
export function useMedia(query: string): boolean | null {
  const [match, setMatch] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}

/** Wall clock that ticks every `ms`, for countdowns. Null until mounted, so server and client agree. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The recent rounds, plus the epoch's "later today" market, which opens hours before it closes and
 *  would otherwise drop out of the recent window long before it ends. */
async function fetchMarketsWithLater(): Promise<Market[]> {
  const [recent, later] = await Promise.all([fetchRecentMarkets(20), fetchLaterMarket()]);
  if (!later || recent.some((m) => m.id === later.id)) return recent;
  return [...recent, later].sort((a, b) => a.expiry - b.expiry);
}

export const useMarkets = () => usePoll<Market[]>(fetchMarketsWithLater, 8_000, 'markets');

/** Every round closing today (since local midnight), for the day's counts. The recent window above
 *  holds only the last 20 markets, which is under two hours of five-minute rounds. */
export const useToday = () => usePoll<Market[]>(() => fetchMarketsSince(new Date().setHours(0, 0, 0, 0)), 30_000, 'today');

export function useBalances(addr: Address | null) {
  return usePoll<Balances>(addr ? () => fetchBalances(addr) : null, 10_000, `bal:${addr}`);
}

export function usePositions(addr: Address | null) {
  return usePoll<Position[]>(addr ? () => fetchPositions(addr) : null, 10_000, `pos:${addr}`);
}

export function useVault(addr: Address | null) {
  return usePoll<Vault>(addr ? () => fetchVault(addr) : null, 20_000, `vault:${addr}`);
}

/** How much more the pool can pay out right now, for the ticket's Max. */
export const useCapacity = () => usePoll(fetchCapacity, 8_000, 'capacity');

/** Live chance of Up and Down (0..1 each) at a price line, the round's own line by default. */
export function useOdds(market: Market | null, lineTick?: bigint): { up: number; down: number } | null {
  const line = lineTick ?? market?.strikeTick;
  const { data } = usePoll(
    market && line != null
      ? async () => {
          const [upLo, upHi] = sideRange('up', line);
          const [dnLo, dnHi] = sideRange('down', line);
          const [up, down] = await Promise.all([rangeChance(market.id, upLo, upHi), rangeChance(market.id, dnLo, dnHi)]);
          return { id: market.id, line, up, down };
        }
      : null,
    5_000,
    `odds:${market?.id}:${line}`,
  );
  return data && market && data.id === market.id && data.line === line ? data : null;
}

/** Yes chances for several price lines on one round, in one refresh. */
export function useLineOdds(market: Market | null, ticks: bigint[]): Map<string, number> | null {
  const key = `lines:${market?.id}:${ticks.join(',')}`;
  const { data } = usePoll(
    market && ticks.length
      ? async () => {
          const yes = await Promise.all(ticks.map((t) => rangeChance(market.id, ...sideRange('up', t))));
          return { key, map: new Map(ticks.map((t, i) => [t.toString(), yes[i]])) };
        }
      : null,
    8_000,
    key,
    { keepData: true },
  );
  return data?.map ?? null;
}

/**
 * BTC from Mezo's oracle: `minutes` of history read at past blocks, then a new print every few
 * seconds appended on the right.
 */
export function useSpotSeries(minutes: number): { series: SpotPoint[]; spot: SpotPoint | null } {
  const [series, setSeries] = useState<SpotPoint[]>([]);
  const held = useRef<SpotPoint[]>([]);
  const lastHistory = useRef(0);
  const windowMs = minutes * 60_000;

  useEffect(() => {
    held.current = [];
    lastHistory.current = 0;
    setSeries([]);
  }, [minutes]);

  usePoll(
    async () => {
      const now = Date.now();
      const cur = held.current;
      const covered = cur.length > 1 ? cur[cur.length - 1].t - cur[0].t : 0;
      // Refill from the oracle whenever the window is mostly empty: the first load, a failed read, or
      // a tab that sat in the background long enough for its prints to age out of the round.
      if ((cur.length < 8 || covered < windowMs * 0.6) && now - lastHistory.current > 10_000) {
        lastHistory.current = now;
        const h = await fetchSpotHistory(minutes).catch(() => null);
        if (h && h.length > 4) {
          held.current = merge(h, held.current, windowMs);
          setSeries(held.current);
        }
      }
      const p = await fetchSpot();
      held.current = merge(held.current, [p], windowMs);
      setSeries(held.current);
      return p;
    },
    4_000,
    `spot:${minutes}`,
  );

  return { series, spot: series.length ? series[series.length - 1] : null };
}

function merge(a: SpotPoint[], b: SpotPoint[], windowMs: number): SpotPoint[] {
  const all = [...a, ...b].sort((x, y) => x.t - y.t);
  const out: SpotPoint[] = [];
  for (const p of all) {
    const last = out[out.length - 1];
    if (last && p.t - last.t < 1000) out[out.length - 1] = p;
    else out.push(p);
  }
  const cutoff = (out[out.length - 1]?.t ?? Date.now()) - windowMs;
  return out.filter((p) => p.t >= cutoff);
}
