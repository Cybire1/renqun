import type { Metadata } from 'next';
import Link from 'next/link';
import { MEZO, MEZO_PRICE_ORACLE, explorerAddress, fetchVenueStats, musd, type VenueStats } from '@renqun/client';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'Every Renqun round, bet and pool update, read from Mezo: rounds settled and refunded, bets, wallets, volume, the pool and the keeper.',
};

// Read from the chain and the explorer at most every two minutes; the page itself is plain HTML.
export const revalidate = 120;

const utc = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)} UTC`;
const utcDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const n0 = (n: number) => n.toLocaleString('en-US');

export default async function StatsPage() {
  let s: VenueStats | null = null;
  try {
    s = await fetchVenueStats();
  } catch {
    s = null;
  }

  if (!s) {
    return (
      <div className="shell page">
        <div className="pf-head">
          <h1 className="title pf-title">Stats</h1>
        </div>
        <section className="card st-down">
          <p className="body">Mezo&apos;s explorer isn&apos;t answering right now. This page reads it again within two minutes.</p>
        </section>
      </div>
    );
  }

  const decided = s.rounds.settled + s.rounds.refunded;
  const since = s.keeper.lastRefundAt;
  return (
    <>
      <div className="shell">
        <div className="pf-head st-head">
          <div>
            <span className="eyebrow pf-live">
              <i aria-hidden />
              Public · read from Mezo
            </span>
            <h1 className="title pf-title">Stats</h1>
          </div>
          <p className="st-updated small">
            Updated {utc(s.generatedAt)} · every figure re-derivable from the{' '}
            <a className="link" href={explorerAddress(MEZO.predict)} target="_blank" rel="noreferrer">
              contract&apos;s events
            </a>
          </p>
        </div>
      </div>

      <section className="pf-band" aria-label="All time">
        <div className="shell pf-band-inner">
          <div className="pf-fig wide">
            <span className="pf-k">Rounds run</span>
            <span className="pf-v">{n0(s.rounds.total)}</span>
            <span className="split" aria-hidden>
              <i className="up" style={{ flex: s.rounds.settled || 0.001 }} />
              <i className="void" style={{ flex: s.rounds.refunded || 0.001 }} />
            </span>
            <span className="pf-note">
              {n0(s.rounds.settled)} settled · {n0(s.rounds.refunded)} refunded · {s.rounds.live} live
            </span>
          </div>
          <div className="pf-fig">
            <span className="pf-k">Bets placed</span>
            <span className="pf-v">{n0(s.bets.count)}</span>
            <span className="pf-note">
              from {s.bets.wallets} wallet{s.bets.wallets === 1 ? '' : 's'}
            </span>
          </div>
          <div className="pf-fig">
            <span className="pf-k">MUSD staked</span>
            <span className="pf-v">{musd(s.bets.staked)}</span>
            <span className="pf-note">{musd(s.bets.paidOut)} paid back out</span>
          </div>
          <div className="pf-fig">
            <span className="pf-k">In the pool</span>
            <span className="pf-v">
              {musd(s.pool.nav)}
              <em>MUSD</em>
            </span>
            <span className="pf-note">{musd(s.pool.atRisk)} backing open bets</span>
          </div>
        </div>
      </section>

      <div className="shell page st-page">
        <section className="st-section" aria-labelledby="days-h">
          <div className="section-head">
            <h2 className="heading" id="days-h">
              Rounds, day by day
            </h2>
            <span className="rs-legend" aria-hidden>
              <span>
                <i className="hc st-settled" /> Settled
              </span>
              <span>
                <i className="hc void" /> Refunded
              </span>
            </span>
          </div>
          <DayBars days={s.days} />
          <p className="small st-caption">
            {since
              ? `The last refund was ${utcDay(since)} at ${utc(since)}: ${n0(s.keeper.settledSinceRefund)} rounds have settled in a row since. Refunds happen when no price is settled within 60 seconds of a close; early on the keeper ran on a laptop that slept.`
              : `Every one of ${n0(decided)} rounds has settled.`}
          </p>
        </section>

        <section className="st-section" aria-labelledby="keeper-h">
          <div className="section-head">
            <h2 className="heading" id="keeper-h">
              The keeper
            </h2>
            <span className="small">opens and settles every round</span>
          </div>
          <div className="st-facts">
            <Fact k="Last settle" v={s.keeper.lastSettledAt ? utc(s.keeper.lastSettledAt) : '—'} note="the latest round it closed" />
            <Fact k="Time to settle" v={s.keeper.medianDelaySec != null ? `${Math.round(s.keeper.medianDelaySec)}s` : '—'} note="after the close, median of the last 40" />
            <Fact k="Settled in a row" v={n0(s.keeper.settledSinceRefund)} note="since the last refund" />
          </div>
        </section>

        <section className="st-section" aria-labelledby="week-h">
          <div className="section-head">
            <h2 className="heading" id="week-h">
              The last seven days
            </h2>
            <span className="small">what Mezo&apos;s Founder Program measures, counted on-chain</span>
          </div>
          <div className="st-facts">
            <Fact k="Players" v={n0(s.week.players)} note="wallets that placed a bet" />
            <Fact k="Bets" v={n0(s.week.bets)} note="Up, Down and ranges" />
            <Fact k="MUSD bet" v={musd(s.week.staked)} note="stakes, with the 1% fee" />
          </div>
        </section>

        <section className="st-section" aria-labelledby="pool-h">
          <div className="section-head">
            <h2 className="heading" id="pool-h">
              The pool at each update
            </h2>
            <span className="small">priced every six hours, at 00, 06, 12 and 18 UTC</span>
          </div>
          <PoolLine history={s.pool.history} />
        </section>

        <section className="st-section" aria-labelledby="check-h">
          <div className="section-head">
            <h2 className="heading" id="check-h">
              Check it yourself
            </h2>
          </div>
          <div className="rd-chain">
            <a className="rd-chain-row" href={explorerAddress(MEZO.predict)} target="_blank" rel="noreferrer">
              <span className="label">Contract</span>
              <span className="strong">Source verified on Mezo</span>
              <span className="small">every stake, payout and refund</span>
            </a>
            <a className="rd-chain-row" href={explorerAddress(MEZO_PRICE_ORACLE)} target="_blank" rel="noreferrer">
              <span className="label">Price</span>
              <span className="strong">Mezo&apos;s BTC oracle</span>
              <span className="small">what every round settles on</span>
            </a>
            <a className="rd-chain-row" href="https://github.com/Cybire1/renqun" target="_blank" rel="noreferrer">
              <span className="label">Code</span>
              <span className="strong">Open source</span>
              <span className="small">contracts, keeper, web and iOS app</span>
            </a>
            <Link className="rd-chain-row" href="/results">
              <span className="label">Rounds</span>
              <span className="strong">Today, round by round</span>
              <span className="small">each with its price path and bets</span>
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="card st-fact">
      <span className="pf-k">{k}</span>
      <b>{v}</b>
      <span className="small">{note}</span>
    </div>
  );
}

/** Settled and refunded rounds per UTC day, stacked, on one scale. */
function DayBars({ days }: { days: VenueStats['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.settled + d.refunded));
  return (
    <div className="card st-days" role="img" aria-label={`Rounds per day over ${days.length} days`}>
      <div className="st-bars">
        {days.map((d) => {
          const total = d.settled + d.refunded;
          return (
            <div className="st-bar" key={d.day} title={`${d.day}: ${d.settled} settled, ${d.refunded} refunded`}>
              <span className="st-bar-n mono">{total}</span>
              <span className="st-bar-stack" style={{ height: `${(total / max) * 100}%` }}>
                <i className="void" style={{ flex: d.refunded }} />
                <i className="st-settled" style={{ flex: d.settled }} />
              </span>
              <span className="st-bar-day mono">{new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pool value at each six-hour update, with the share price it implies. */
function PoolLine({ history }: { history: VenueStats['pool']['history'] }) {
  if (history.length < 2) return <div className="card st-days"><p className="body">The pool&apos;s history starts with its second update.</p></div>;
  const W = 1000;
  const H = 160;
  const vals = history.map((h) => h.nav);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.2, hi * 0.02, 1);
  const x = (i: number) => (i / (history.length - 1)) * W;
  const y = (v: number) => 12 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 24);
  const d = history.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(h.nav).toFixed(1)}`).join('');
  const first = history[0];
  const last = history[history.length - 1];
  return (
    <div className="card st-pool">
      <div className="st-pool-top">
        <div>
          <span className="pf-k">Now</span>
          <b className="mono">{last.nav.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MUSD</b>
        </div>
        <div>
          <span className="pf-k">Share price</span>
          <b className="mono">{last.price.toFixed(6)}</b>
        </div>
        <div>
          <span className="pf-k">Updates</span>
          <b className="mono">{history.length}</b>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="st-pool-svg" role="img" aria-label={`Pool value from ${first.nav.toFixed(2)} to ${last.nav.toFixed(2)} MUSD`}>
        <path d={`${d}L${W} ${H}L0 ${H}Z`} fill="#171717" opacity={0.05} />
        <path d={d} fill="none" stroke="#171717" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="st-pool-axis small">
        <span>{utcDay(first.t)}</span>
        <span>{utcDay(last.t)}</span>
      </div>
    </div>
  );
}
