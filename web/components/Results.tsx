'use client';
// Every round of the day, as it closes. The figures say how the day went; the grid is the day itself,
// one cell per round (24 hours by twelve 5-minute rounds), each opening its round; the list below
// reads the same rounds as numbers.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  contractEvents,
  fetchMarketsSince,
  hhmm,
  outcomeOf,
  summarizeRounds,
  usd0,
  ROUND_WINDOW_MS,
  type Cadence,
  type Market,
  type Outcome,
} from '@renqun/client';
import { usePoll, useNow } from '@/lib/hooks';
import { EmptyState, Segmented, Skeleton, Tri } from './ui';
import { dayWords } from './RoundPage';

type Day = 'today' | 'yesterday';
const KINDS: { key: Cadence; label: string }[] = [
  { key: '5m', label: '5 min' },
  { key: '1h', label: 'Hourly' },
  { key: '1d', label: 'Later today' },
];
const LIST_STEP = 24;
const OUTCOME_WORDS: Record<Outcome, string> = { up: 'Up won', down: 'Down won', void: 'Refunded', live: 'Live' };

function dayBounds(day: Day, now: number): [number, number] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return day === 'today' ? [today, tomorrow.getTime()] : [yesterday.getTime(), today];
}

export function Results() {
  const now = useNow(1000);
  const [day, setDay] = useState<Day>('today');
  const [kind, setKind] = useState<Cadence>('5m');
  const [shown, setShown] = useState(LIST_STEP);
  // The day's bounds move only at midnight, so the key (and the fetch) stay put between ticks.
  const [start, end] = now ? dayBounds(day, now) : [0, 0];

  const rounds = usePoll<Market[]>(
    start ? () => fetchMarketsSince(start).then((ms) => ms.filter((m) => m.expiry < end && m.status !== 'none')) : null,
    day === 'today' ? 20_000 : 600_000,
    `results:${start}`,
  );
  const mints = usePoll(() => contractEvents<{ marketId: bigint }>('Minted'), 60_000, 'mints:all');
  const betsPer = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of mints.data ?? []) map.set(l.args.marketId.toString(), (map.get(l.args.marketId.toString()) ?? 0) + 1);
    return map;
  }, [mints.data]);

  const list = useMemo(() => (rounds.data ?? []).filter((m) => m.cadence === kind), [rounds.data, kind]);
  const sum = useMemo(() => summarizeRounds(list), [list]);
  const newestFirst = useMemo(() => [...list].sort((a, b) => b.expiry - a.expiry), [list]);
  const loading = !now || (rounds.loading && !rounds.data);

  return (
    <>
      <div className="shell">
        <div className="pf-head rs-head">
          <div>
            <span className="eyebrow pf-live">
              <i aria-hidden />
              Every round, as it closes
            </span>
            <h1 className="title pf-title">Results</h1>
          </div>
          <div className="rs-controls">
            <Segmented
              label="Day"
              items={[
                { key: 'today', label: 'Today' },
                { key: 'yesterday', label: 'Yesterday' },
              ]}
              value={day}
              onChange={(k) => {
                setDay(k);
                setShown(LIST_STEP);
              }}
            />
            <Segmented
              label="Round length"
              items={KINDS.map((k) => ({ key: k.key, label: k.label }))}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setShown(LIST_STEP);
              }}
            />
          </div>
        </div>
      </div>

      <section className="pf-band" aria-label="How the day went">
        <div className="shell pf-band-inner rs-band">
          <div className="pf-fig wide">
            <span className="pf-k">Rounds {day === 'today' ? 'so far' : ''}</span>
            <span className="pf-v">{loading ? '—' : sum.settled + sum.refunded}</span>
            <span className="pf-note">
              {loading ? ' ' : `${sum.settled} settled · ${sum.refunded} refunded${sum.live ? ` · ${sum.live} live` : ''}`}
            </span>
          </div>
          <div className="pf-fig">
            <span className="pf-k">Up against down</span>
            <span className="pf-v">
              {loading ? '—' : (
                <>
                  <span style={{ color: 'var(--green-text)' }}>{sum.up}</span>
                  <em>to</em>
                  <span style={{ color: 'var(--down-text)' }}>{sum.down}</span>
                </>
              )}
            </span>
            <span className="split" aria-hidden>
              <i className="up" style={{ flex: Math.max(sum.up, 0.0001) }} />
              <i className="down" style={{ flex: Math.max(sum.down, 0.0001) }} />
            </span>
          </div>
          <div className="pf-fig">
            <span className="pf-k">Longest run</span>
            <span className="pf-v">
              {sum.streak ? (
                <>
                  <span style={{ color: sum.streak.side === 'up' ? 'var(--green-text)' : 'var(--down-text)' }}>{sum.streak.side === 'up' ? 'Up' : 'Down'}</span>
                  <em>×</em>
                  {sum.streak.count}
                </>
              ) : (
                '—'
              )}
            </span>
            <span className="pf-note">
              {sum.streak ? `${hhmm(sum.streak.from.expiry - ROUND_WINDOW_MS[kind])} – ${hhmm(sum.streak.to.expiry)}` : 'no settled rounds yet'}
            </span>
          </div>
          <div className="pf-fig">
            <span className="pf-k">Bitcoin&apos;s range</span>
            <span className="pf-v">{sum.low != null && sum.high != null ? usd0(sum.high - sum.low) : '—'}</span>
            <span className="pf-note">{sum.low != null && sum.high != null ? `${usd0(sum.low)} to ${usd0(sum.high)} at the closes` : ' '}</span>
          </div>
        </div>
      </section>

      <div className="shell page rs-page">
        {rounds.error && !rounds.data ? (
          <section className="card">
            <EmptyState title="Mezo isn't answering" body="This page retries on its own." />
          </section>
        ) : (
          <>
            <section className="rs-day" aria-labelledby="grid-h">
              <div className="section-head">
                <h2 className="heading" id="grid-h">
                  {day === 'today' ? 'Today' : dayWords(start)} in rounds
                </h2>
                <Legend />
              </div>
              {loading ? <Skeleton width="100%" height={kind === '5m' ? 420 : 120} radius={20} /> : <DayGrid rounds={list} kind={kind} start={start} now={now} />}
            </section>

            <section className="rs-list-wrap" aria-labelledby="list-h">
              <div className="section-head">
                <h2 className="heading" id="list-h">
                  Round by round
                </h2>
                <span className="small">newest first</span>
              </div>
              {loading ? (
                <Skeleton width="100%" height={280} radius={20} />
              ) : newestFirst.length === 0 ? (
                <section className="card">
                  <EmptyState title="No rounds closed yet" body="They show here the moment each one closes." />
                </section>
              ) : (
                <>
                  <div className="card rs-list">
                    {newestFirst.slice(0, shown).map((m) => (
                      <RoundRow key={m.id.toString()} m={m} bets={betsPer.get(m.id.toString()) ?? 0} now={now} />
                    ))}
                  </div>
                  {shown < newestFirst.length ? (
                    <button type="button" className="btn soft rs-more" onClick={() => setShown((n) => n + LIST_STEP * 4)}>
                      Show more · {newestFirst.length - shown} left
                    </button>
                  ) : null}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function Legend() {
  return (
    <span className="rs-legend" aria-hidden>
      <span>
        <i className="hc up" /> Up
      </span>
      <span>
        <i className="hc down" /> Down
      </span>
      <span>
        <i className="hc void" /> Refunded
      </span>
      <span>
        <i className="hc live" /> Live
      </span>
    </span>
  );
}

/** The day as a grid: one row per hour, one cell per round, in the order they close. */
function DayGrid({ rounds, kind, start, now }: { rounds: Market[]; kind: Cadence; start: number; now: number }) {
  const span = ROUND_WINDOW_MS[kind];
  const slotOf = (m: Market) => Math.floor((m.expiry - span - start) / span);
  const bySlot = new Map<number, Market>();
  for (const m of rounds) bySlot.set(slotOf(m), m);
  const perRow = kind === '5m' ? 12 : kind === '1h' ? 12 : 4;
  const slots = kind === '5m' ? 288 : kind === '1h' ? 24 : 4;
  const rows = Math.ceil(slots / perRow);

  if (kind === '1d') {
    return (
      <div className="rs-later">
        {[...rounds].sort((a, b) => a.expiry - b.expiry).map((m) => (
          <Cell key={m.id.toString()} m={m} big />
        ))}
        {rounds.length === 0 ? <p className="body">No &ldquo;later today&rdquo; rounds closed on this day.</p> : null}
      </div>
    );
  }

  return (
    <div className={`rs-grid k${kind}`} role="list" aria-label="Rounds by the time they closed">
      {kind === '5m' ? (
        <div className="rs-cols" aria-hidden>
          <span />
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i}>{i % 3 === 0 ? `:${String(i * 5).padStart(2, '0')}` : ''}</span>
          ))}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, r) => (
        <div className="rs-row" key={r}>
          <span className="rs-hour mono" aria-hidden>
            {kind === '5m' ? String(new Date(start + r * 3_600_000).getHours()).padStart(2, '0') : r === 0 ? 'am' : 'pm'}
          </span>
          {Array.from({ length: perRow }, (_, c) => {
            const slot = r * perRow + c;
            const m = bySlot.get(slot);
            if (m) return <Cell key={c} m={m} />;
            const slotEnd = start + (slot + 1) * span;
            return <span key={c} className={`hc ${slotEnd <= now ? 'none' : 'later'}`} role="listitem" aria-label={`${hhmm(slotEnd)}: ${slotEnd <= now ? 'no round' : 'not yet'}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

function Cell({ m, big = false }: { m: Market; big?: boolean }) {
  const o = outcomeOf(m);
  const label = `${hhmm(m.expiry)}: ${OUTCOME_WORDS[o]}${m.settlement != null ? `, closed ${usd0(m.settlement)} against ${usd0(m.strike)}` : ''}`;
  return (
    <Link prefetch={false} href={`/rounds/${m.id}`} className={`hc ${o}${big ? ' big' : ''}`} role="listitem" aria-label={label} title={label}>
      {big ? (
        <>
          <b className="mono">{hhmm(m.expiry)}</b>
          <span>{OUTCOME_WORDS[o]}</span>
        </>
      ) : null}
    </Link>
  );
}

function RoundRow({ m, bets, now }: { m: Market; bets: number; now: number }) {
  const o = outcomeOf(m);
  const move = m.settlement != null ? m.settlement - m.strike : null;
  return (
    <Link prefetch={false} href={`/rounds/${m.id}`} className={`rs-row-link ${o}`}>
      <span className="rs-time">
        <b className="mono">{hhmm(m.expiry)}</b>
        <small>#{m.id.toString()}</small>
      </span>
      <span className="rs-prices">
        <span>
          <small>Line</small> <span className="mono">{usd0(m.strike)}</span>
        </span>
        <span className="rs-arrow" aria-hidden>
          →
        </span>
        <span>
          <small>{o === 'live' ? 'Closes' : 'Close'}</small>{' '}
          <span className="mono">{m.settlement != null ? usd0(m.settlement) : o === 'live' ? hhmm(m.expiry) : '—'}</span>
        </span>
      </span>
      <span className={`rs-move mono ${move == null ? '' : move > 0 ? 'up' : 'down'}`}>
        {move == null ? '' : `${move > 0 ? '+' : move < 0 ? '−' : ''}${usd0(Math.abs(move))}`}
      </span>
      <span className="rs-bets">{bets ? `${bets} bet${bets > 1 ? 's' : ''}` : ''}</span>
      <span className={`rs-outcome ${o}`}>
        {o === 'up' || o === 'down' ? <Tri dir={o} size={9} /> : null}
        {o === 'live' ? (m.expiry > now ? 'Live' : 'Settling') : OUTCOME_WORDS[o]}
      </span>
      <span className="chev" aria-hidden>
        ›
      </span>
    </Link>
  );
}
