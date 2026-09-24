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
import { useMarkets, useNow, useOdds, useSpotSeries, useToday, useVault } from '@/lib/hooks';
import { Chart } from './Chart';
import { WordMarkets } from './WordMarkets';
import { Skeleton, Tri } from './ui';

/** A side's price as the cents it costs, which is how the round is actually quoted. */
const cents = (p: number) => (p >= 0.995 ? '99¢+' : p <= 0.005 ? '<1¢' : `${Math.round(p * 100)}¢`);

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
  // The rounds queued behind the one you can bet on — the cards fanned out in the deck.
  const upcoming = useMemo(() => live.slice(1, 3), [live]);
  const odds = useOdds(round && bettable(round, now) ? round : null);

  // The day's count reads every round since midnight, not just the recent window.
  const today = useToday();
  const settledToday = useMemo(
    () => (today.data ?? []).filter((m) => m.status === 'settled' || m.status === 'void'),
    [today.data],
  );
  const upCount = settledToday.filter((m) => winnerOf(m) === 'up').length;
  const downCount = settledToday.filter((m) => winnerOf(m) === 'down').length;
  const recent = useMemo(
    () => all.filter((m) => m.status === 'settled').sort((a, b) => b.expiry - a.expiry).slice(0, 6),
    [all],
  );
  const v = vault.data;

  return (
    <>
      <Strip pool={v?.nav ?? null} />

      <div className="shell">
        <section className="hero-2">
          <div className="grid-field" aria-hidden />

          <div className="hero-copy">
            <h1>
              Call Bitcoin&apos;s
              <br />
              next move.
            </h1>
            <div className="hero-sub">
              <i aria-hidden />
              <em>Get paid in MUSD.</em>
            </div>
            <div className="hero-cta">
              <Link className="btn red tall" href="/markets">
                Open markets
              </Link>
              <a className="btn soft tall" href="#how">
                How it works
              </a>
            </div>
          </div>

          {/* The deck: the round you can bet on, with the ones queued behind it. */}
          <div className="deck">
            {upcoming[1] ? (
              <div className="deck-back two" aria-hidden>
                <span>Then {hhmm(upcoming[1].expiry)}</span>
                <span className="mono">line {usd0(upcoming[1].strike)}</span>
              </div>
            ) : null}
            {upcoming[0] ? (
              <div className="deck-back one" aria-hidden>
                <span>Up next · opens {hhmm(upcoming[0].expiry)}</span>
                <span className="mono">line {usd0(upcoming[0].strike)}</span>
              </div>
            ) : null}

            <aside className="hero-round card" aria-label="The round running now">
              {round && now ? (
                <>
                  <div className="hr-rail">
                    <span className="live label">
                      <i className="live-dot" aria-hidden />
                      5-minute round
                    </span>
                    <span className="hr-clock">
                      <em>closes in</em>
                      <b className={round.expiry - now < 30_000 ? 'final' : undefined}>{clock(Math.max(0, round.expiry - now))}</b>
                    </span>
                  </div>
                  <div className="hr-drain" aria-hidden>
                    <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, (round.expiry - now) / 300_000))})` }} />
                  </div>

                  <div className="hr-body">
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
                  </div>

                  <div className="hr-chart">
                    <Chart series={series} strike={round.strike} windowMs={5 * 60_000} height={168} bare />
                  </div>

                  {recent.length ? (
                    <div className="hr-last">
                      <span className="hr-last-k">Last</span>
                      {recent.slice(0, 4).map((m) => (
                        <span key={m.id.toString()} className={`recent-chip ${winnerOf(m)}`}>
                          <Tri dir={winnerOf(m) === 'up' ? 'up' : 'down'} size={8} />
                          {hhmm(m.expiry)}
                        </span>
                      ))}
                      <span className="hr-last-n">{settledToday.length} today</span>
                    </div>
                  ) : null}

                  <div className="hero-sides">
                    {(['up', 'down'] as const).map((s) => {
                      const chance = odds ? (s === 'up' ? odds.up : odds.down) : null;
                      return (
                        <Link key={s} href="/markets" className={`side-btn ${s}`}>
                          <span className="sb-top">
                            <Tri dir={s} size={12} />
                            {s === 'up' ? 'Up' : 'Down'}
                            <b>{chance != null ? cents(chance) : '—'}</b>
                          </span>
                          <small>
                            {chance != null && chance >= 0.01 && chance <= 0.99
                              ? `1 MUSD pays ${pays(chance).replace('\u00d7', '')}`
                              : bettable(round, now)
                                ? 'take this side'
                                : 'closing'}
                          </small>
                        </Link>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gap: 12, padding: 22 }}>
                  <Skeleton width="60%" height={18} />
                  <Skeleton width="85%" height={34} />
                  <Skeleton width="100%" height={170} radius={16} />
                </div>
              )}
            </aside>
          </div>
        </section>

        <section className="numbers" aria-label="Right now on Renqun">
          <Stat
            label="In the pool"
            value={v ? musd(v.nav) : null}
            unit="MUSD"
            note={v ? `${musd(v.atRisk)} at risk · never more than ${musd(v.cap)}` : 'backs every open bet'}
            wide
            bar={
              v && v.nav > 0n ? (
                <span className="stat-meter" aria-hidden>
                  <i style={{ width: `${Math.min(100, Number((v.atRisk * 10_000n) / v.nav) / 100)}%` }} />
                  <b style={{ left: `${Math.min(100, Number((v.cap * 10_000n) / v.nav) / 100)}%` }} />
                </span>
              ) : null
            }
          />
          <Stat
            label="Rounds today"
            value={String(settledToday.length)}
            note={`${upCount} up · ${downCount} down`}
            bar={
              settledToday.length ? (
                <span className="split" aria-hidden>
                  <i className="up" style={{ flexGrow: upCount || 0.001 }} />
                  <i className="down" style={{ flexGrow: downCount || 0.001 }} />
                </span>
              ) : null
            }
          />
          <Stat
            label="Next pool update"
            value={v ? hhmm(v.nextRoll) : null}
            note={v && now ? `in ${inWords(v.nextRoll - now)} · deposits price then` : 'deposits price then'}
          />
        </section>

        <Section id="how" n="01" title="Three steps, before the clock runs out">
          <div className="steps">
            <Step
              n="01"
              title="Pick a round"
              demo={
                <div className="demo-card">
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
              }
            >
              <p className="body">One opens every five minutes, and every hour. Each asks a single question: where is Bitcoin at the close?</p>
            </Step>
            <Step
              n="02"
              title="Take a side"
              demo={
                <div className="demo-sides">
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
              }
            >
              <p className="body">Up or Down, from 1 MUSD. What you pay is the chance itself, so there is nobody to fill your order.</p>
            </Step>
            <Step
              n="03"
              title="Get paid at the close"
              demo={
                <div className="demo-card">
                <div className="recent" style={{ maskImage: 'none', WebkitMaskImage: 'none', overflowX: 'visible' }}>
                  {recent.length ? (
                    recent.slice(0, 4).map((m) => (
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
              }
            >
              <p className="body">The chain prints the price and the contract pays. Cash out early at any time before the close.</p>
            </Step>
          </div>
        </Section>

        <Section n="02" title="Or just ask." lede="No chart to read. Will Bitcoin be above a price later today? Answer yes or no.">
          <WordMarkets markets={all} spotUsd={spot?.usd ?? null} now={now} heading={false} />
        </Section>

        <Section
          n="03"
          tone="white"
          title="Be the other side of every bet."
          lede="The pool takes the other side of every round. It keeps the stakes and the 1% fee from losing bets, and pays the winners."
        >
          <div className="earn-teaser">
            <div>
              <p className="body earn-body">
                Open bets can never promise more than half of the pool, and withdrawals are never paused — not even while the venue
                is.
              </p>
              <div className="hero-cta" style={{ marginTop: 28 }}>
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

        <Section n="04" title="Check every word of this." lede="Nothing here asks to be trusted. Each of these is something you can read on the chain yourself.">
          <div className="proof-grid">
            <Proof n="01" title="The contract is verified" body="Read the code that holds the money and prices every bet." href={explorerAddress(MEZO.predict)} link="View contract" />
            <Proof n="02" title="The price is the chain's own" body="Settlement uses the BTC price Mezo's validators agree on every block, not a feed we run." />
            <Proof n="03" title="A late price refunds everyone" body="If no print lands within 60 seconds of a close, the round voids and every stake goes back." />
            <Proof n="04" title="The pool can always leave" body="Pausing stops new bets and deposits. Withdrawals and payouts are never paused." />
          </div>
        </Section>

        <Section n="05" tone="white" title="Questions.">
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

        <section className="closing">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apple-icon.png" width={112} height={112} alt="The Renqun app icon" className="app-icon" />
          <div className="closing-copy">
            <span className="eyebrow">On your phone</span>
            <h2 className="closing-title">Renqun for iOS</h2>
            <p className="body">
              The same rounds with a wallet made on the device: one swipe to bet, Face ID to reveal your backup key, and no browser
              extension anywhere.
            </p>
          </div>
          <Link className="btn red tall" href="/markets">
            Open markets
          </Link>
        </section>
      </div>
    </>
  );
}

function Strip({ pool }: { pool: bigint | null }) {
  // Bitcoin, the line and the countdown live in the bar now, so the strip carries only what the
  // bar cannot: the pool behind the bets, and how the thing settles.
  const items = [
    `pool ${pool != null ? musd(pool) : '—'} MUSD behind every bet`,
    'settled by Mezo’s oracle',
    'rounds every 5 minutes',
    'winners paid at the close',
    'no order book, no counterparty',
    'cash out any time before the close',
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

function Stat({
  label,
  value,
  unit,
  note,
  bar,
  wide,
}: {
  label: string;
  value: string | null;
  unit?: string;
  note?: string;
  /** A picture of this figure — a meter, a split — drawn under it. */
  bar?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`number${wide ? ' wide' : ''}`}>
      <span className="label">{label}</span>
      <span className="number-value">
        {value ?? <Skeleton width={90} height={26} />}
        {value && unit ? <span className="unit">{unit}</span> : null}
      </span>
      {bar ?? null}
      {note ? <span className="small">{note}</span> : null}
    </div>
  );
}

function Section({
  n,
  title,
  id,
  lede,
  tone = 'sand',
  children,
}: {
  n: string;
  title: string;
  id?: string;
  lede?: string;
  tone?: 'sand' | 'white';
  children: ReactNode;
}) {
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
    <section ref={ref} id={id} className={`band ${tone} ${seen ? 'seen' : ''}`}>
      <div className="band-head">
        <span className="band-n mono">{n}</span>
        <div>
          <h2 className="band-title">{title}</h2>
          {lede ? <p className="band-lede">{lede}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, demo, children }: { n: string; title: string; demo: ReactNode; children: ReactNode }) {
  return (
    <article className="step">
      <span className="step-n">{n}</span>
      <div className="step-copy">
        <h3 className="step-title">{title}</h3>
        {children}
      </div>
      <div className="step-demo">{demo}</div>
    </article>
  );
}

function Proof({ n, title, body, href, link }: { n: string; title: string; body: string; href?: string; link?: string }) {
  return (
    <article className="proof">
      <span className="proof-n mono">{n}</span>
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
    <div className="faq-item">
      <h3 className="faq-q">{q}</h3>
      <p className="body">{children}</p>
    </div>
  );
}
