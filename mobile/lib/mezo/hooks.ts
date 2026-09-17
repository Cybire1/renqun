// Live data for the Mezo screens. Every hook polls only while its screen is focused and the app is
// in the foreground, and `refreshMezo()` makes all of them refetch at once after a transaction.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
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
} from './client';
import { cachedMezoAddress, mezoAddress, onMezoAccountChange } from './wallet';
import { dripAvailable, requestDripOnce, type DripResult } from './funding';
import { IS_TESTNET } from './network';

const bus = new Set<() => void>();
/** Last good answer per key, shared by every screen, so a tab opens with numbers instead of dashes. */
const lastGood = new Map<string, unknown>();

/** Refetch every mounted Mezo hook now (call after a transaction lands). */
export function refreshMezo(): void {
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
  const [data, setData] = useState<T | null>(() => (lastGood.get(key) as T | undefined) ?? null);
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
      if (alive.current) {
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

  // A new key (another address, another market) starts from a clean slate, unless the caller would
  // rather keep showing the last answer while the next one loads (quotes as the stake changes).
  const keepData = opts.keepData ?? false;
  useEffect(() => {
    alive.current = true;
    const cached = lastGood.get(key) as T | undefined;
    if (cached !== undefined) setData(cached);
    else if (!keepData) setData(null);
    setLoading(cached === undefined);
    inflight.current = false;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [key, refresh, keepData]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      let timer: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), intervalMs);
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          void refresh();
          timer ??= setInterval(() => void refresh(), intervalMs);
        } else if (timer) {
          clearInterval(timer);
          timer = null;
        }
      });
      bus.add(refresh);
      return () => {
        if (timer) clearInterval(timer);
        sub.remove();
        bus.delete(refresh);
      };
    }, [intervalMs, refresh, key]),
  );

  return { data, error, loading, refresh };
}

/** The device wallet address (null for the first frame on a cold start). */
export function useMezoAddress(): Address | null {
  const [addr, setAddr] = useState<Address | null>(cachedMezoAddress());
  useEffect(() => {
    let live = true;
    if (!addr) mezoAddress().then((a) => live && setAddr(a)).catch(() => {});
    const off = onMezoAccountChange((a) => live && setAddr(a));
    return () => {
      live = false;
      off();
    };
  }, [addr]);
  return addr;
}

/** Wall clock that ticks every `ms`, for countdowns. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Latest BTC print from Mezo's oracle, every few seconds. */
export const useSpot = () => usePoll<SpotPoint>(fetchSpot, 4_000, 'spot');

export const useMarkets = () => usePoll<Market[]>(() => fetchRecentMarkets(20), 8_000, 'markets');

export function useBalances(addr: Address | null) {
  return usePoll<Balances>(addr ? () => fetchBalances(addr) : null, 10_000, `bal:${addr}`);
}

export function usePositions(addr: Address | null) {
  return usePoll<Position[]>(addr ? () => fetchPositions(addr) : null, 10_000, `pos:${addr}`);
}

/** How much more the pool can pay out right now, for the bet sheet's Max. */
export const useCapacity = () => usePoll(fetchCapacity, 8_000, 'capacity');

export type StarterState = 'idle' | 'working' | 'done' | 'failed' | 'unavailable';

/**
 * Testnet: a wallet with no MUSD or no gas asks the starter drip once, so a new player can bet within
 * a minute of installing. Mainnet: gas only, and only when a drip is configured.
 */
export function useStarterFunds(addr: Address | null, musd: bigint | null, btc: bigint | null) {
  const [state, setState] = useState<StarterState>(dripAvailable() ? 'idle' : 'unavailable');
  const [result, setResult] = useState<DripResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!addr || !dripAvailable()) return;
    setState('working');
    setError(null);
    try {
      const r = await requestDripOnce(addr);
      setResult(r);
      setState('done');
      refreshMezo();
    } catch (e) {
      setError((e as Error).message);
      setState('failed');
    }
  }, [addr]);

  useEffect(() => {
    if (!addr || musd == null || btc == null || !dripAvailable() || asked.current === addr) return;
    const needsGas = btc < 5_000_000_000_000n;
    const needsMusd = IS_TESTNET && musd < 10n ** 18n;
    if (!needsGas && !needsMusd) return;
    asked.current = addr;
    void run();
  }, [addr, musd, btc, run]);

  return { state, result, error, retry: run };
}

export function useVault(addr: Address | null) {
  return usePoll<Vault>(addr ? () => fetchVault(addr) : null, 20_000, `vault:${addr}`);
}

/** Live chance of UP and DOWN for a market (0..1 each), refreshed every few seconds. */
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
export function useSpotSeries(minutes: number): { series: SpotPoint[]; spot: SpotPoint | null; error: unknown } {
  const [series, setSeries] = useState<SpotPoint[]>([]);
  const [error, setError] = useState<unknown>(null);
  const windowMs = minutes * 60_000;
  const historyLoaded = useRef(false);

  useEffect(() => {
    historyLoaded.current = false;
    setSeries([]);
  }, [minutes]);

  usePoll(
    async () => {
      // History is retried until it lands: a failed first read must not leave the chart with only
      // the prints collected since the screen opened.
      if (!historyLoaded.current) {
        const h = await fetchSpotHistory(minutes).catch(() => null);
        if (h && h.length > 4) {
          historyLoaded.current = true;
          setSeries((cur) => merge(h, cur, windowMs));
        }
      }
      const p = await fetchSpot();
      setSeries((cur) => merge(cur, [p], windowMs));
      setError(null);
      return p;
    },
    4_000,
    `spot:${minutes}`,
  );

  return { series, spot: series.length ? series[series.length - 1] : null, error };
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
