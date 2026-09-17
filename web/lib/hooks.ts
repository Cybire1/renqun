'use client';
// Live data for the Renqun pages. Every hook polls while the tab is visible, and `refreshAll()`
// makes all of them refetch at once after a transaction lands.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  fetchBalances,
  fetchCapacity,
  fetchPositions,
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

export const useMarkets = () => usePoll<Market[]>(() => fetchRecentMarkets(20), 8_000, 'markets');

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

/** Live chance of Up and Down for a market (0..1 each), refreshed every few seconds. */
export function useOdds(market: Market | null): { up: number; down: number } | null {
  const { data } = usePoll(
    market
      ? async () => {
          const [upLo, upHi] = sideRange('up', market.strikeTick);
          const [dnLo, dnHi] = sideRange('down', market.strikeTick);
          const [up, down] = await Promise.all([rangeChance(market.id, upLo, upHi), rangeChance(market.id, dnLo, dnHi)]);
          return { id: market.id, up, down };
        }
      : null,
    5_000,
    `odds:${market?.id}`,
  );
  return data && market && data.id === market.id ? data : null;
}

/**
 * BTC from Mezo's oracle: `minutes` of history read at past blocks, then a new print every few
 * seconds appended on the right.
 */
export function useSpotSeries(minutes: number): { series: SpotPoint[]; spot: SpotPoint | null } {
  const [series, setSeries] = useState<SpotPoint[]>([]);
  const windowMs = minutes * 60_000;
  const historyLoaded = useRef(false);

  useEffect(() => {
    historyLoaded.current = false;
    setSeries([]);
  }, [minutes]);

  usePoll(
    async () => {
      // History is retried until it lands, so a failed first read never leaves a stub chart.
      if (!historyLoaded.current) {
        const h = await fetchSpotHistory(minutes).catch(() => null);
        if (h && h.length > 4) {
          historyLoaded.current = true;
          setSeries((cur) => merge(h, cur, windowMs));
        }
      }
      const p = await fetchSpot();
      setSeries((cur) => merge(cur, [p], windowMs));
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
