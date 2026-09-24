'use client';
// Markets. The round's question and the live BTC print lead, the chart is the round's picture, and
// the ticket sits beside it. The featured round stays on screen through its final seconds so a
// bettor can watch the finish; the ticket moves to the next round once betting closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MEZO_PREDICT_LIVE,
  POS_INF_TICK,
  bettable,
  clock,
  hhmm,
  inRange,
  inWords,
  musd,
  liveRounds,
  pays,
  pct,
  roundName,
  bandOn,
  spotBand,
  usd0,
  type Cadence,
  type Market,
} from '@renqun/client';
import { useMarkets, useMedia, useNow, useOdds, useSpotSeries, useVault } from '@/lib/hooks';
import { zeroAddress } from 'viem';
import Link from 'next/link';
import { Chart } from './Chart';
import { Ticket, type BandUsd, type Call } from './Ticket';
import { WordMarkets } from './WordMarkets';
import { Countdown, EmptyState, Segmented, Sheet, Skeleton, Tri } from './ui';

const CADENCES: { key: Cadence; label: string; minutes: number }[] = [
  { key: '5m', label: '5 min', minutes: 5 },
  { key: '1h', label: '1 hour', minutes: 60 },
];

function winnerOf(m: Market): 'up' | 'down' | 'void' {
  if (m.status === 'void') return 'void';
  return inRange(m.settlementRaw, m.strikeTick, POS_INF_TICK, m.tickSize) ? 'up' : 'down';
}

export function Markets() {
  const now = useNow(1000);
  const [cadence, setCadence] = useState<Cadence>('5m');
  const [pickedId, setPickedId] = useState<bigint | null>(null);
  const [side, setSide] = useState<Call>('up');
  const [band, setBand] = useState<BandUsd | null>(null);
  // On phone widths the ticket waits in a bottom sheet until Up or Down is tapped.
  const narrow = useMedia('(max-width: 980px)');
  const phone = useMedia('(max-width: 560px)') ?? false;
  const [sheetOpen, setSheetOpen] = useState(false);
  const markets = useMarkets();
  const minutes = CADENCES.find((c) => c.key === cadence)!.minutes;
  const { series, spot } = useSpotSeries(minutes);

  const open = useMemo(() => (now ? liveRounds(markets.data ?? [], cadence, now) : []), [markets.data, cadence, now]);
  const market = open.find((m) => m.id === pickedId) ?? open[0] ?? null;
  const upNext = open.filter((m) => m !== market);
  const canBet = market ? bettable(market, now) : false;
  const nextBettable = upNext.find((m) => bettable(m, now)) ?? null;
  // The ticket bets on the featured round while it takes bets, then on the next one.
  const ticketMarket = canBet ? market : nextBettable;
  const odds = useOdds(ticketMarket);

  const recent = useMemo(
    () =>
      (markets.data ?? [])
        .filter((m) => m.cadence === cadence && (m.status === 'settled' || m.status === 'void'))
        .sort((a, b) => b.expiry - a.expiry)
        .slice(0, 10),
    [markets.data, cadence],
  );
  const justClosed = recent[0] && now - recent[0].expiry < 90_000 ? recent[0] : null;
  const distance = market && spot ? spot.usd - market.strike : null;
  // A range bet's band, shaded on the chart: the picked one, or the one Bitcoin is in now.
  const shownBand =
    side === 'range' && ticketMarket && spot
      ? ((band && bandOn(ticketMarket, band.low, band.high)) || spotBand(ticketMarket, spot.usd))
      : null;
  const loading = !now || (markets.loading && !markets.data);

  return (
    <div className="shell page">
      <div className="pf-head mk-head">
        <div>
          <span className="eyebrow pf-live">
            <i aria-hidden />
            Rounds every five minutes and every hour
          </span>
          <h1 className="title pf-title">Bitcoin</h1>
        </div>
        <Segmented
          label="Round length"
          items={CADENCES.map((c) => ({ key: c.key, label: c.label }))}
          value={cadence}
          onChange={(k) => {
            setCadence(k);
            setPickedId(null);
          }}
        />
      </div>

      {justClosed ? <JustClosed market={justClosed} /> : null}

      <div className="markets">
        <div className="area-round">
          {!MEZO_PREDICT_LIVE ? (
            <section className="card">
              <EmptyState title="Renqun isn't live on this network yet" />
            </section>
          ) : market ? (
            <section className="card round" aria-labelledby="round-q">
              <div className="round-top">
                <span className="live label">
                  <i className="live-dot" aria-hidden />
                  {roundName(cadence)} round
                </span>
                <Countdown msLeft={market.expiry - now} />
              </div>
              <h2 className="question" id="round-q">
                BTC above <em>{usd0(market.strike)}</em>?
              </h2>
              <div className="score">
                <Spot value={spot?.usd ?? null} />
                {distance != null ? (
                  <span className={`pill ${distance > 0 ? 'up' : 'down'}`}>
                    {distance !== 0 ? <Tri dir={distance > 0 ? 'up' : 'down'} size={9} /> : null}
                    {distance === 0 ? 'On the line' : `${usd0(Math.abs(distance))} ${distance > 0 ? 'above' : 'below'}`}
                  </span>
                ) : null}
              </div>
              <Chart
                series={series}
                strike={market.strike}
                windowMs={minutes * 60_000}
                height={phone ? 200 : 300}
                band={shownBand ? { low: shownBand.low, high: shownBand.high } : null}
              />
              <Progress market={market} now={now} minutes={minutes} />
              {!canBet ? (
                <button type="button" className="closed-note" disabled={!nextBettable} onClick={() => nextBettable && setPickedId(nextBettable.id)}>
                  <span className="strong">Betting closed for this round</span>
                  <span className="small" style={{ color: 'var(--ink)' }}>
                    {nextBettable ? `Next: closes ${hhmm(nextBettable.expiry)} ›` : 'Next round opening…'}
                  </span>
                </button>
              ) : null}
            </section>
          ) : loading ? (
            <section className="card round" aria-busy>
              <Skeleton width={140} height={18} />
              <div style={{ marginTop: 18 }}>
                <Skeleton width="70%" height={46} />
              </div>
              <div style={{ marginTop: 14 }}>
                <Skeleton width="100%" height={300} radius={16} />
              </div>
            </section>
          ) : markets.error ? (
            <section className="card">
              <EmptyState title="Mezo isn't answering" body="This page retries on its own every few seconds." />
            </section>
          ) : (
            <section className="card">
              <EmptyState
                title="The next round opens in a moment"
                body={`New ${cadence === '5m' ? '5-minute' : 'hourly'} rounds open on their own. This page updates by itself.`}
              />
            </section>
          )}
        </div>

        <div className="area-rest">
          {recent.length ? (
            <section className="section" aria-labelledby="recent-h">
              <div className="section-head">
                <h2 className="heading" id="recent-h">
                  Last rounds
                </h2>
                <span className="small">
                  <b style={{ color: 'var(--green-text)' }}>{recent.filter((m) => winnerOf(m) === 'up').length} up</b>
                  {'  ·  '}
                  <b style={{ color: 'var(--down-text)' }}>{recent.filter((m) => winnerOf(m) === 'down').length} down</b>
                  {'  ·  '}
                  <Link className="link" href="/results">
                    All results
                  </Link>
                </span>
              </div>
              <div className="recent">
                {recent.map((m) => {
                  const w = winnerOf(m);
                  return (
                    <Link
                      key={m.id.toString()}
                      href={`/rounds/${m.id}`}
                      className={`recent-chip ${w}`}
                      title={m.settlement != null ? `Closed at ${usd0(m.settlement)}, line ${usd0(m.strike)}` : 'No price in time: refunded'}
                    >
                      {w !== 'void' ? <Tri dir={w} size={9} /> : null}
                      {hhmm(m.expiry)}
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {upNext.length ? (
            <section className="section" aria-labelledby="next-h">
              <div className="section-head">
                <h2 className="heading" id="next-h">
                  Up next
                </h2>
              </div>
              <div className="card rows">
                {upNext.map((m) => (
                  <button key={m.id.toString()} type="button" className="row-btn" onClick={() => setPickedId(m.id)}>
                    <span style={{ flex: 1 }}>
                      <span className="strong" style={{ display: 'block' }}>
                        Closes {hhmm(m.expiry)}
                      </span>
                      <span className="small">Up line {usd0(m.strike)}</span>
                    </span>
                    <span className="mono">{clock(m.expiry - now)}</span>
                    <span className="chev" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {MEZO_PREDICT_LIVE && narrow === false ? (
          <div className="area-ticket ticket-column">
          <Ticket
            market={ticketMarket}
            side={side}
            onSide={setSide}
            odds={odds}
            now={now}
            nextRound={nextBettable}
            onPickNext={(m) => setPickedId(m.id)}
            spotUsd={spot?.usd ?? null}
            band={band}
            onBand={setBand}
          />
          <PoolCard now={now} />
          </div>
        ) : null}

        {MEZO_PREDICT_LIVE && narrow ? (
          <div className="area-ticket side-buttons" role="group" aria-label="Place a bet">
            {(['up', 'down'] as const).map((s) => {
              const chance = odds ? (s === 'up' ? odds.up : odds.down) : null;
              return (
                <button
                  key={s}
                  type="button"
                  className={`side-btn ${s}`}
                  disabled={!ticketMarket}
                  onClick={() => {
                    setSide(s);
                    setSheetOpen(true);
                  }}
                >
                  <Tri dir={s} size={11} />
                  {s === 'up' ? 'Up' : 'Down'}
                  <b>{chance != null ? pct(chance) : '—'}</b>
                  {chance != null && chance >= 0.01 && chance <= 0.99 ? <small>{pays(chance)}</small> : null}
                </button>
              );
            })}
            <button
              type="button"
              className="range-link"
              disabled={!ticketMarket}
              onClick={() => {
                setSide('range');
                setSheetOpen(true);
              }}
            >
              <i className="range-glyph" aria-hidden />
              Or call a price range
              <span aria-hidden>›</span>
            </button>
          </div>
        ) : null}
      </div>

      {narrow && sheetOpen ? (
        <Sheet open onClose={() => setSheetOpen(false)} title={side === 'range' ? 'Your range' : 'Your bet'}>
          <Ticket
            plain
            market={ticketMarket}
            side={side}
            onSide={setSide}
            odds={odds}
            now={now}
            nextRound={nextBettable}
            onPickNext={(m) => setPickedId(m.id)}
            spotUsd={spot?.usd ?? null}
            band={band}
            onBand={setBand}
          />
        </Sheet>
      ) : null}

      {MEZO_PREDICT_LIVE && now ? (
        <section className="mk-ask" aria-labelledby="ask-h">
          <div className="band-head">
            <div>
              <h2 className="band-title" id="ask-h">
                Or just ask.
              </h2>
              <p className="band-lede">No chart to read. Will Bitcoin be above a price later today? Answer yes or no.</p>
            </div>
          </div>
          <WordMarkets markets={markets.data ?? []} spotUsd={spot?.usd ?? null} now={now} heading={false} />
        </section>
      ) : null}
    </div>
  );
}

/** What the pool can still cover, under the ticket: the other side of every bet you place. */
function PoolCard({ now }: { now: number }) {
  const vault = useVault(zeroAddress);
  const v = vault.data;
  const pctOf = (x: bigint) => (v && v.nav > 0n ? Math.min(100, Number((x * 10_000n) / v.nav) / 100) : 0);
  return (
    <aside className="card pool-card" aria-label="The pool behind these rounds">
      <div className="line">
        <span className="label">The pool takes the other side</span>
      </div>
      <div className="line">
        <span className="strong">{v ? musd(v.nav) : '—'} MUSD</span>
        <Link className="link" href="/earn">
          Earn
        </Link>
      </div>
      <div className="meter" aria-hidden>
        <span style={{ width: `${pctOf(v?.atRisk ?? 0n)}%` }} />
        <i style={{ left: `${v ? pctOf(v.cap) : 50}%` }} />
      </div>
      <div className="line">
        <span className="small">{v ? `${musd(v.atRisk)} at risk` : ' '}</span>
        <span className="small">{v && now ? `updates ${hhmm(v.nextRoll)} · in ${inWords(v.nextRoll - now)}` : ' '}</span>
      </div>
    </aside>
  );
}

function Spot({ value }: { value: number | null }) {
  const prev = useRef<number | null>(null);
  const [dir, setDir] = useState<'' | 'tick-up' | 'tick-down'>('');
  useEffect(() => {
    if (value == null) return;
    const p = prev.current;
    prev.current = value;
    if (p == null || Math.round(p) === Math.round(value)) return;
    setDir(value > p ? 'tick-up' : 'tick-down');
    const t = setTimeout(() => setDir(''), 900);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className={`spot ${dir}`} aria-live="off">
      {value == null ? '—' : usd0(value)}
    </span>
  );
}

function Progress({ market, now, minutes }: { market: Market; now: number; minutes: number }) {
  const windowMs = minutes * 60_000;
  const done = Math.min(1, Math.max(0, 1 - (market.expiry - now) / windowMs));
  return (
    <>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(done * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Round progress">
        <span style={{ width: `${done * 100}%` }} />
      </div>
      <div className="progress-times">
        <span className="small">{hhmm(market.expiry - windowMs)}</span>
        <span className="small strong">Closes {hhmm(market.expiry)}</span>
      </div>
    </>
  );
}

function JustClosed({ market }: { market: Market }) {
  const w = winnerOf(market);
  return (
    <div className="just-closed" role="status">
      {w !== 'void' ? (
        <span className={`tri-tile ${w}`}>
          <Tri dir={w} size={10} color={w === 'up' ? 'var(--green-text)' : 'var(--down-text)'} />
        </span>
      ) : null}
      <span style={{ flex: 1 }}>
        {w === 'void'
          ? `${hhmm(market.expiry)} round had no price in time. Bets are refunded.`
          : `${hhmm(market.expiry)} closed at ${usd0(market.settlement ?? 0)}. ${w === 'up' ? 'Up' : 'Down'} won.`}
      </span>
      <Link className="link" href={`/rounds/${market.id}`}>
        See the round
      </Link>
    </div>
  );
}
