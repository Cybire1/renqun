import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'How a Renqun round runs, what a price means, how Up, Down and ranges pay, how settlement and refunds work, and the pool on the other side.',
};

const STEPS = [
  { t: 'Opens', b: 'The keeper opens the round. Its line is Bitcoin’s price at that moment.' },
  { t: 'You call it', b: 'Up, Down, or a range. What you pay is the chance itself, plus 1%.' },
  { t: 'Betting closes', b: '30 seconds before the close, so nobody trades the last tick.' },
  { t: 'It closes', b: 'Mezo’s validators agree Bitcoin’s price every block. The first print after the close decides it.' },
  { t: 'It settles', b: 'Winners collect in seconds. No price within 60 seconds, and every stake goes back.' },
];

export default function LearnPage() {
  return (
    <div className="shell page ln-page">
      <header className="pf-head ln-head">
        <div>
          <span className="eyebrow pf-live">
            <i aria-hidden />
            How it works
          </span>
          <h1 className="title pf-title ln-title">
            One question about Bitcoin,
            <br />
            answered by the chain.
          </h1>
          <p className="ln-lede">
            Every round asks where Bitcoin will be when it closes. Here is everything that happens between your tap and your payout, with the numbers the
            contract actually uses.
          </p>
        </div>
      </header>

      <section className="ln-section" aria-labelledby="round-h">
        <h2 className="heading ln-h" id="round-h">
          A round, start to finish
        </h2>
        <ol className="ln-steps">
          {STEPS.map((s, i) => (
            <li key={s.t} className="card">
              <span className="ln-n mono">{String(i + 1).padStart(2, '0')}</span>
              <b>{s.t}</b>
              <span className="body">{s.b}</span>
            </li>
          ))}
        </ol>
        <p className="small ln-note">Rounds run every five minutes and every hour, and one &ldquo;later today&rdquo; round runs to each pool update, with yes/no questions on it.</p>
      </section>

      <section className="ln-section ln-split" aria-labelledby="price-h">
        <div>
          <h2 className="heading ln-h" id="price-h">
            The price is the chance
          </h2>
          <p className="body">
            Every call pays 1 MUSD for each 1 MUSD of payout if it lands, so its price is the market&apos;s chance that it will. Up at 64¢ means a 64% chance.
            Stake 10 MUSD at 64¢ and it buys about 15.47 MUSD of payout: 10 ÷ 0.6464, the price with its 1% fee on top.
          </p>
          <p className="body">The contract prices every side from the time left and Bitcoin&apos;s volatility, and only sells between 1¢ and 99¢.</p>
        </div>
        <div className="card ln-price" aria-label="Worked example: Up at 64 cents">
          <div className="ln-price-bar" aria-hidden>
            <span style={{ width: '64%' }} />
            <i style={{ left: '64%' }} />
          </div>
          <div className="ln-price-scale mono small" aria-hidden>
            <span>1¢</span>
            <span>64¢</span>
            <span>99¢</span>
          </div>
          <div className="ln-price-rows">
            <div className="line">
              <span className="label">You stake</span>
              <span className="mono strong">10.00 MUSD</span>
            </div>
            <div className="line">
              <span className="label">Chance of Up</span>
              <span className="mono strong">64%</span>
            </div>
            <div className="line">
              <span className="label">Pays if Up</span>
              <span className="mono strong" style={{ color: 'var(--green-text)' }}>
                15.47 MUSD
              </span>
            </div>
            <div className="line">
              <span className="label">Pays if Down</span>
              <span className="mono strong">0</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ln-section" aria-labelledby="calls-h">
        <h2 className="heading ln-h" id="calls-h">
          Three ways to call it
        </h2>
        <div className="ln-calls">
          <Call kind="up" title="Up" body="Pays if Bitcoin closes strictly above the line." />
          <Call kind="down" title="Down" body="Pays if Bitcoin closes at or below the line. A close exactly on it pays Down." />
          <Call kind="range" title="Range" body="Pays if the close lands inside your band: above its low, at or below its high. Narrow, so it pays more." />
        </div>
      </section>

      <section className="ln-section ln-duo" aria-labelledby="exit-h">
        <div className="card ln-card">
          <h2 className="heading" id="exit-h">
            Cash out any time
          </h2>
          <p className="body">
            An open bet has a live price. Sell it back before the close and you get that price, less the 1% fee, whether it is winning or losing.
          </p>
        </div>
        <div className="card ln-card">
          <h2 className="heading">Refunds are automatic</h2>
          <p className="body">
            If no price is settled within 60 seconds of a close, the round voids and every stake goes back. Nobody decides a result by hand, ever.
          </p>
        </div>
      </section>

      <section className="ln-section ln-split" aria-labelledby="pool-h">
        <div>
          <h2 className="heading ln-h" id="pool-h">
            The pool on the other side
          </h2>
          <p className="body">
            There is no order book to wait on. A pool of MUSD takes the other side of every bet: it keeps losing stakes and the 1% fee, and pays the winners.
            Anyone can add to it on{' '}
            <Link className="link" href="/earn">
              Earn
            </Link>
            .
          </p>
        </div>
        <ul className="card ln-rules">
          <li>
            <b>Half at most</b>
            <span>Open bets can never promise more than half of the pool.</span>
          </li>
          <li>
            <b>Every six hours</b>
            <span>Deposits and withdrawals are priced at the next update: 00, 06, 12 and 18 UTC.</span>
          </li>
          <li>
            <b>Always able to leave</b>
            <span>Pausing stops new bets and deposits only. Withdrawals and payouts are never paused.</span>
          </li>
        </ul>
      </section>

      <section className="ln-section" aria-labelledby="know-h">
        <h2 className="heading ln-h" id="know-h">
          Before you play
        </h2>
        <div className="ln-know">
          <p className="body">
            <b className="strong">It runs on Mezo testnet.</b> MUSD there is free test money: the site sends a new wallet 20 MUSD and the gas to use it. Mainnet
            waits on a security audit.
          </p>
          <p className="body">
            <b className="strong">Everything is checkable.</b> The contract is verified on Mezo&apos;s explorer, the code is{' '}
            <a className="link" href="https://github.com/Cybire1/renqun" target="_blank" rel="noreferrer">
              open source
            </a>
            , and every round keeps its own page with its price path and its bets. The{' '}
            <Link className="link" href="/stats">
              stats
            </Link>{' '}
            are read from the chain.
          </p>
        </div>
      </section>

      <div className="ln-cta">
        <Link className="btn red tall" href="/markets">
          Call a round
        </Link>
        <Link className="btn soft tall" href="/results">
          See today&apos;s results
        </Link>
      </div>
    </div>
  );
}

function Call({ kind, title, body }: { kind: 'up' | 'down' | 'range'; title: string; body: string }) {
  // A price axis, the line in red, and the stretch this call pays on shaded.
  const pays = kind === 'up' ? { x: 60, w: 140 } : kind === 'down' ? { x: 0, w: 60 } : { x: 84, w: 40 };
  return (
    <div className={`card ln-call ${kind}`}>
      <svg viewBox="0 0 200 56" className="ln-call-svg" aria-hidden>
        <rect x={pays.x} y={8} width={pays.w} height={40} rx={8} className="ln-pays" />
        <line x1={0} x2={200} y1={28} y2={28} className="ln-axis" />
        <line x1={60} x2={60} y1={4} y2={52} className="ln-line" />
      </svg>
      <b>{title}</b>
      <span className="body">{body}</span>
    </div>
  );
}
