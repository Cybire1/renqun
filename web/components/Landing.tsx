'use client';
// The front page. Everything on it is live: the strip at the top, the round in the hero, the pool
// numbers and the last results all come from Mezo as you read. The trading screen is /markets.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { zeroAddress } from 'viem';
import {
  MEZO,
  POS_INF_TICK,
  bettable,
  clock,
  explorerAddress,
  hhmm,
  inRange,
  inWords,
  liveRounds,
  musd,
  pays,
  pct,
  timeWords,
  usd0,
  type Market,
} from '@renqun/client';
import { useMarkets, useNow, useOdds, useSpotSeries, useVault } from '@/lib/hooks';
import { Chart } from './Chart';
import { WordMarkets } from './WordMarkets';
import { Countdown, Skeleton, Tri } from './ui';

const winnerOf = (m: Market): 'up' | 'down' | 'void' =>
  m.status === 'void' ? 'void' : inRange(m.settlementRaw, m.strikeTick, POS_INF_TICK, m.tickSize) ? 'up' : 'down';

export function Landing() {
  const now = useNow(1000);
  const markets = useMarkets();
  const { series, spot } = useSpotSeries(5);
  const vault = useVault(zeroAddress);
  const all = useMemo(() => markets.data ?? [], [markets.data]);

  const live = useMemo(() => (now ? liveRounds(all, '5m', now) : []), [all, now]);
  const round = live[0] ?? null;
  const odds = useOdds(round && bettable(round, now) ? round : null);

  const settledToday = useMemo(() => {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    return all.filter((m) => (m.status === 'settled' || m.status === 'void') && m.expiry >= dayStart);
  }, [all]);
  const upCount = settledToday.filter((m) => winnerOf(m) === 'up').length;
  const downCount = settledToday.filter((m) => winnerOf(m) === 'down').length;
  const recent = useMemo(
    () => all.filter((m) => m.status === 'settled').sort((a, b) => b.expiry - a.expiry).slice(0, 6),
    [all],
  );
  const v = vault.data;

  return (
    <>
      <Strip now={now} round={round} spotUsd={spot?.usd ?? null} pool={v?.nav ?? null} />

      <div className="shell">
        <section className="hero-2">
          <div className="hero-copy">
            <span className="eyebrow">Bitcoin rounds, paid in MUSD on Mezo</span>
            <h1>
              Call Bitcoin&apos;s next move.
              <em> Get paid in MUSD.</em>
            </h1>
            <p className="lede">
              A round opens every five minutes. Say Up or Down, and the contract pays the winners the moment Mezo&apos;s own oracle
              prints the closing price. No order book, no counterparty to chase.
            </p>
            <div className="hero-cta">
              <Link className="btn red tall" href="/markets">
                Open markets
              </Link>
              <a className="btn soft tall" href="#how">
                How it works
              </a>
            </div>
            <div className="hero-proof">
              <span>Live on Mezo testnet</span>
              <i />
              <a href={explorerAddress(MEZO.predict)} target="_blank" rel="noreferrer">
                Contract verified
              </a>
              <i />
              <span>Settled by Mezo&apos;s BTC oracle</span>
            </div>
          </div>

          <aside className="hero-round card" aria-label="The round running now">
            {round && now ? (
              <>
                <div className="round-top">
                  <span className="live label">
                    <i className="live-dot" aria-hidden />
                    5-minute round
                  </span>
                  <Countdown msLeft={round.expiry - now} />
                </div>
                <h2 className="hero-q">
                  BTC above <em>{usd0(round.strike)}</em>?
                </h2>
                <div className="score">
                  <span className="spot">{spot ? usd0(spot.usd) : '—'}</span>
                  {spot ? (
                    <span className={`pill ${spot.usd > round.strike ? 'up' : 'down'}`}>
                      <Tri dir={spot.usd > round.strike ? 'up' : 'down'} size={9} />
                      {usd0(Math.abs(spot.usd - round.strike))} {spot.usd > round.strike ? 'above' : 'below'}
                    </span>
                  ) : null}
                </div>
                <Chart series={series} strike={round.strike} windowMs={5 * 60_000} height={170} />
                <div className="hero-sides">
                  {(['up', 'down'] as const).map((s) => {
                    const chance = odds ? (s === 'up' ? odds.up : odds.down) : null;
                    return (
                      <Link key={s} href="/markets" className={`side-btn ${s}`}>
                        <Tri dir={s} size={11} />
                        {s === 'up' ? 'Up' : 'Down'}
                        <b>{chance != null ? pct(chance) : '—'}</b>
                        {chance != null && chance >= 0.01 && chance <= 0.99 ? <small>{pays(chance)}</small> : null}
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <Skeleton width="60%" height={18} />
                <Skeleton width="85%" height={34} />
                <Skeleton width="100%" height={170} radius={16} />
              </div>
            )}
          </aside>
        </section>

        <section className="numbers" aria-label="Right now on Renqun">
          <Stat label="In the pool" value={v ? musd(v.nav) : null} unit="MUSD" note="backs every open bet" />
          <Stat
            label="At risk now"
            value={v ? musd(v.atRisk) : null}
            unit="MUSD"
            note={v ? `limit ${musd(v.cap)}` : 'half the pool, at most'}
          />
          <Stat label="Rounds today" value={settledToday.length ? String(settledToday.length) : '0'} note={`${upCount} up · ${downCount} down`} />
          <Stat
            label="Next pool update"
            value={v ? hhmm(v.nextRoll) : null}
            note={v && now ? `in ${inWords(v.nextRoll - now)}` : 'deposits price then'}
          />
        </section>

        <Section id="how" n="01" title="Three steps, before the clock runs out">
          <div className="steps">
            <Step n="01" eyebrow="Pick" title="Pick a round">
              <p className="body">
                Rounds open every five minutes and every hour. Each one asks one question: where is Bitcoin at the close? Questions
                that run until the next pool update sit under Just ask.
              </p>
              <div className="step-demo">
                {round ? (
                  <>
                    <div className="line">
                      <span className="small">5-minute round</span>
                      <span className="mono">{clock(Math.max(0, round.expiry - now))}</span>
                    </div>
                    <div className="strong" style={{ fontSize: 18 }}>
                      BTC above {usd0(round.strike)}?
                    </div>
                  </>
                ) : (
                  <Skeleton width="80%" height={40} />
                )}
              </div>
            </Step>
            <Step n="02" eyebrow="Answer" title="Take a side">
              <p className="body">
                Up or Down, from 1 MUSD. What you pay is the chance itself: 40¢ for a bet that pays 1 MUSD if it lands. The contract
                prices it, so there is nobody to fill your order.
              </p>
              <div className="step-demo sides">
                {(['up', 'down'] as const).map((s) => {
                  const chance = odds ? (s === 'up' ? odds.up : odds.down) : null;
                  return (
                    <span key={s} className={`side-btn ${s}`} aria-hidden>
                      <Tri dir={s} size={11} />
                      {s === 'up' ? 'Up' : 'Down'}
                      <b>{chance != null ? pct(chance) : '—'}</b>
                    </span>
                  );
                })}
              </div>
            </Step>
            <Step n="03" eyebrow="Collect" title="Get paid at the close">
              <p className="body">
                Mezo&apos;s validators print the BTC price every block; that print settles the round. Winners collect in one tap, and
                you can cash out early at the live price. If no price arrives in time, everyone is refunded.
              </p>
              <div className="step-demo">
                <div className="recent" style={{ maskImage: 'none', WebkitMaskImage: 'none' }}>
                  {recent.length ? (
                    recent.map((m) => (
                      <span key={m.id.toString()} className={`recent-chip ${winnerOf(m)}`}>
                        <Tri dir={winnerOf(m) === 'up' ? 'up' : 'down'} size={9} />
                        {hhmm(m.expiry)}
                      </span>
                    ))
                  ) : (
                    <Skeleton width="70%" height={30} />
                  )}
                </div>
                <span className="small">Settled at {recent[0]?.settlement != null ? usd0(recent[0].settlement) : '—'}, from the chain&apos;s own price</span>
              </div>
            </Step>
          </div>
        </Section>

        <Section n="02" title="Just ask">
          <WordMarkets markets={all} spotUsd={spot?.usd ?? null} now={now} heading={false} />
        </Section>

        <Section n="03" title="Be the other side of every bet">
          <div className="earn-teaser">
            <div>
              <p className="body" style={{ maxWidth: 520 }}>
                The pool takes the other side of every round. It keeps the stakes and the 1% fee from losing bets and pays the
                winners. Open bets can never promise more than half of it, and withdrawals are never paused.
              </p>
              <div className="hero-cta" style={{ marginTop: 20 }}>
                <Link className="btn red" href="/earn">
                  Add to the pool
                </Link>
                <Link className="btn soft" href="/portfolio">
                  Your bets
                </Link>
              </div>
            </div>
            <div className="card pool-card">
              <div className="line">
                <span className="label">Pool</span>
                <span className="mono strong">{v ? musd(v.nav) : '—'} MUSD</span>
              </div>
              <div className="meter" aria-hidden>
                <span style={{ width: `${v && v.nav > 0n ? Math.min(100, Number((v.atRisk * 10_000n) / v.nav) / 100) : 0}%` }} />
                <i style={{ left: `${v && v.nav > 0n ? Math.min(100, Number((v.cap * 10_000n) / v.nav) / 100) : 50}%` }} />
              </div>
              <div className="line">
                <span className="small">{v ? `${musd(v.atRisk)} at risk` : ' '}</span>
                <span className="small">limit {v && v.nav > 0n ? Math.round(Number((v.cap * 10_000n) / v.nav) / 100) : 50}%</span>
              </div>
              <hr className="divider" />
              <div className="line">
                <span className="small">Next update</span>
                <span className="small strong">{v ? `${hhmm(v.nextRoll)} · in ${now && v ? inWords(v.nextRoll - now) : '—'}` : '—'}</span>
              </div>
            </div>
          </div>
        </Section>

        <Section n="04" title="Why you can check every word of this">
          <div className="proof-grid">
            <Proof title="The contract is verified" body="Read the code that holds the money and prices every bet, on Mezo's explorer." href={explorerAddress(MEZO.predict)} link="View contract" />
            <Proof title="The price is the chain's own" body="Settlement uses the BTC price Mezo's validators agree on every block, not a feed we run." />
            <Proof title="A late price refunds everyone" body="If no print lands within 60 seconds of a close, the round voids and every stake goes back." />
            <Proof title="The pool can always leave" body="Pausing stops new bets and deposits. Withdrawals and payouts are never paused." />
          </div>
        </Section>

        <Section n="05" title="Questions">
          <div className="faq">
            <Faq q="What do I need to start?">
              A wallet on Mezo and some MUSD. On testnet both are free: connect, and the site sends you 20 test MUSD and the few cents
              of BTC that gas costs.
            </Faq>
            <Faq q="How is the price of a bet decided?">
              The contract prices each side from the time left and Bitcoin&apos;s volatility, the same maths a short-dated option
              uses. You pay the chance plus a 1% fee, so a 40% chance costs about 40¢ for every 1 MUSD it pays.
            </Faq>
            <Faq q="Can I get out before the close?">
              Yes. Every open bet shows a cash-out price that moves with Bitcoin; take it any time before the round closes.
            </Faq>
            <Faq q="What if Bitcoin lands exactly on the line?">
              Up pays strictly above the line, so a close exactly on it pays Down.
            </Faq>
            <Faq q="Is this real money?">
              Not yet. Renqun runs on Mezo testnet, where MUSD is free test money and nothing is at stake. Mainnet waits on an audit.
            </Faq>
          </div>
        </Section>

        <section className="app-teaser card">
          <div>
            <span className="eyebrow">On your phone</span>
            <h2 className="ask-title">Renqun for iPhone</h2>
            <p className="body" style={{ maxWidth: 420 }}>
              The same rounds with a wallet made on the device: one swipe to bet, Face ID to reveal your backup key, and no browser
              extension anywhere. TestFlight soon.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apple-icon.png" width={96} height={96} alt="The Renqun app icon" className="app-icon" />
        </section>
      </div>
    </>
  );
}

function Strip({ now, round, spotUsd, pool }: { now: number; round: Market | null; spotUsd: number | null; pool: bigint | null }) {
  const items = [
    `BTC ${spotUsd != null ? usd0(spotUsd) : '—'}`,
    round && now ? `next close ${clock(round.expiry - now)}` : 'next round opening',
    `pool ${pool != null ? musd(pool) : '—'} MUSD`,
    'settled by Mezo’s oracle',
    'rounds every 5 minutes',
    round ? `line ${usd0(round.strike)}` : 'line —',
  ];
  return (
    <div className="strip" aria-hidden>
      <div className="strip-track">
        {[0, 1].map((copy) => (
          <div className="strip-run" key={copy}>
            {items.map((t) => (
              <span key={t}>
                {t}
                <i />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, note }: { label: string; value: string | null; unit?: string; note?: string }) {
  return (
    <div className="number">
      <span className="label">{label}</span>
      <span className="number-value">
        {value ?? <Skeleton width={90} height={26} />}
        {value && unit ? <span className="unit">{unit}</span> : null}
      </span>
      {note ? <span className="small">{note}</span> : null}
    </div>
  );
}

function Section({ n, title, id, children }: { n: string; title: string; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '-60px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} id={id} className={`band ${seen ? 'seen' : ''}`}>
      <div className="band-head">
        <span className="band-n mono">{n}</span>
        <h2 className="band-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Step({ n, eyebrow, title, children }: { n: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <article className="step">
      <span className="step-n">{n}</span>
      <span className="eyebrow">{eyebrow}</span>
      <h3 className="step-title">{title}</h3>
      {children}
    </article>
  );
}

function Proof({ title, body, href, link }: { title: string; body: string; href?: string; link?: string }) {
  return (
    <article className="proof">
      <h3 className="strong">{title}</h3>
      <p className="body">{body}</p>
      {href ? (
        <a className="link" href={href} target="_blank" rel="noreferrer">
          {link}
        </a>
      ) : null}
    </article>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="faq-item">
      <summary>
        {q}
        <span aria-hidden>+</span>
      </summary>
      <p className="body">{children}</p>
    </details>
  );
}
