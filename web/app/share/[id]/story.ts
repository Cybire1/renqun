// One bet, told for sharing. The page and its preview images read the same story, once per request.
import { cache } from 'react';
import {
  ROUND_WINDOW_MS,
  fetchPositionStory,
  fetchSpotBetween,
  musd,
  roundName,
  tickToUsd,
  usd0,
  type PositionStory,
  type SpotPoint,
} from '@renqun/client';

export const loadStory = cache(async (raw: string): Promise<PositionStory | null> => {
  if (!/^\d{1,9}$/.test(raw) || raw === '0') return null;
  try {
    return await fetchPositionStory(BigInt(raw));
  } catch {
    return null;
  }
});

/** The round's price path for the card, or nothing if the oracle is slow to answer. */
export const loadPath = cache(async (raw: string): Promise<SpotPoint[]> => {
  const s = await loadStory(raw);
  if (!s) return [];
  const end = Math.min(s.market.expiry, Date.now());
  try {
    return await Promise.race([
      fetchSpotBetween(s.market.expiry - ROUND_WINDOW_MS[s.market.cadence], end, 40),
      new Promise<SpotPoint[]>((resolve) => setTimeout(() => resolve([]), 4_000)),
    ]);
  } catch {
    return [];
  }
});

const utcTime = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)} UTC`;
const utcDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

export interface Words {
  kicker: string;
  tone: 'up' | 'down' | 'flat';
  /** The call, with the price that matters kept separate so it can take the accent colour. */
  call: { before: string; price: string; after: string };
  result: string;
  detail: string;
  when: string;
  title: string;
  description: string;
}

export function words(s: PositionStory): Words {
  const m = s.market;
  const low = usd0(tickToUsd(s.lower, m.tickSize));
  const high = usd0(tickToUsd(s.higher, m.tickSize));
  const question = m.cadence === '1d';
  const call =
    s.side === 'up'
      ? { before: question ? 'Yes: Bitcoin above ' : 'Bitcoin above ', price: low, after: '' }
      : s.side === 'down'
        ? { before: question ? 'No: Bitcoin at or below ' : 'Bitcoin at or below ', price: high, after: '' }
        : { before: 'Bitcoin between ', price: low, after: ` and ${high}` };
  const cent = 10n ** 16n;
  const shown = (x: bigint) => (x / cent) * cent;
  const multiple = s.cost > 0n && s.paid != null ? Number(s.paid) / Number(s.cost) : null;
  const closed = m.settlement != null ? `closed at ${usd0(m.settlement)}` : '';
  let kicker = 'In play';
  let tone: Words['tone'] = 'flat';
  let result = `Pays ${musd(s.quantity)} MUSD`;
  let detail = `on ${musd(s.cost)} staked, if it lands`;
  if (s.result === 'won') {
    kicker = 'Called it';
    tone = 'up';
    result = `+${musd(shown(s.paid ?? 0n) - shown(s.cost))} MUSD`;
    detail = `paid ${musd(s.paid ?? 0n)} on ${musd(s.cost)} staked${multiple ? ` · ${multiple.toFixed(2)}×` : ''}`;
  } else if (s.result === 'lost') {
    kicker = 'Not this time';
    tone = 'down';
    result = `−${musd(s.cost)} MUSD`;
    detail = `Bitcoin ${closed || 'closed the other side'}`;
  } else if (s.result === 'cashed') {
    kicker = 'Cashed out early';
    result = `${musd(s.paid ?? 0n)} MUSD`;
    detail = `on ${musd(s.cost)} staked, sold before the close`;
  } else if (s.result === 'refunded') {
    kicker = 'Refunded';
    result = `${musd(s.paid ?? 0n)} MUSD back`;
    detail = 'no price arrived in time, so every stake went back';
  }
  const when = `${roundName(m.cadence)} round · ${utcDay(m.expiry)} · ${utcTime(m.expiry)}`;
  const sentence = `${call.before}${call.price}${call.after}`;
  return {
    kicker,
    tone,
    call,
    result,
    detail: s.result === 'won' && closed ? `${detail} · ${closed}` : detail,
    when,
    title: s.result === 'won' ? `${sentence}. Called it.` : sentence,
    description: `${kicker}: ${sentence}, ${when}. ${result}. Bitcoin rounds paid in MUSD, settled by Mezo's own price.`,
  };
}
