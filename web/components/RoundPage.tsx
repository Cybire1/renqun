'use client';
// One round, start to finish: the line the keeper set, Bitcoin's path from Mezo's own oracle, the
// close, who bet what and what it paid, and the transactions behind each step. A live round draws
// itself as it runs; a settled one is a record anyone can check on the explorer.
import Link from 'next/link';
import {
  ROUND_WINDOW_MS,
  callWords,
  clock,
  explorerAddress,
  explorerTx,
  fetchMarketCount,
  fetchRoundDetail,
  fetchSpotBetween,
  hhmm,
  musd,
  neighbourRounds,
  roundName,
  shortAddr,
  usd0,
  venue,
  MEZO_PRICE_ORACLE,
  type Market,
  type RoundBet,
  type RoundDetail,
} from '@renqun/client';
import { usePoll, useMedia, useNow } from '@/lib/hooks';
import { useWallet } from '@/lib/wallet';
import { Chart } from './Chart';
import { EmptyState, Skeleton, Tri } from './ui';

const POINTS: Record<Market['cadence'], number> = { '5m': 48, '1h': 60, '1d': 72 };

export const dayWords = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const hms = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function RoundPage({ id }: { id: bigint }) {
  const now = useNow(1000);
  const phone = useMedia('(max-width: 560px)') ?? false;
  const { address } = useWallet();
  const detail = usePoll<RoundDetail>(() => fetchRoundDetail(id), 5_000, `round:${id}`);
  const d = detail.data;
  const live = d?.outcome === 'live';
  const m = d?.market ?? null;

  // The path: the whole run for a closed round (read once), the run so far for a live one.
  const from = d ? Math.min(d.openedAt, d.market.expiry - ROUND_WINDOW_MS[d.market.cadence]) : 0;
  const path = usePoll(
    d ? () => fetchSpotBetween(from, live ? Date.now() : d.market.expiry, POINTS[d.market.cadence]) : null,
    live ? 8_000 : 600_000,
    `path:${id}:${live ? 'live' : 'done'}`,
    { keepData: true },
  );
  const count = usePoll(fetchMarketCount, 30_000, 'marketCount');
  const around = usePoll(
    m && count.data ? () => neighbourRounds(m, count.data!) : null,
    live ? 15_000 : 120_000,
    `around:${id}:${count.data}`,
  );

  if (detail.error && !d) {
    return (
      <div className="shell page">
        <section className="card rd-empty">
          <EmptyState title="Mezo isn't answering" body="This page retries on its own every few seconds." />
        </section>
      </div>
    );
  }
  if (!d || !m) return <RoundSkeleton />;
  if (m.status === 'none') {
    return (
      <div className="shell page">
        <section className="card rd-empty">
          <EmptyState
            title={`There is no round #${id.toString()} yet`}
            body="Rounds are numbered as the keeper opens them."
            action={
              <Link className="btn red" href="/results">
                See today&apos;s results
              </Link>
            }
          />
        </section>
      </div>
    );
  }

  const settle = m.settlement;
  const move = settle != null ? settle - m.strike : null;
  const spotNow = path.data?.length ? path.data[path.data.length - 1].usd : null;
  const liveMove = live && spotNow != null ? spotNow - m.strike : null;
  const delay = d.settledAt != null ? Math.max(0, Math.round((d.settledAt - m.expiry) / 1000)) : null;
  const left = m.expiry - now;
  const staked = d.bets.reduce((s, b) => s + b.cost, 0n);

  return (
    <div className="shell page">
      <nav className="rd-crumbs" aria-label="Rounds">
        <Link href="/results" className="rd-back">
          ‹ Results
        </Link>
        <span className="rd-steps">
          {around.data?.prev ? (
            <Link prefetch={false} href={`/rounds/${around.data.prev.id}`} aria-label={`Previous round, closed ${hhmm(around.data.prev.expiry)}`}>
              ‹ {hhmm(around.data.prev.expiry)}
            </Link>
          ) : (
            <span aria-hidden>‹</span>
          )}
          <span className="rd-steps-k">{roundName(m.cadence)}</span>
          {around.data?.next ? (
            <Link prefetch={false} href={`/rounds/${around.data.next.id}`} aria-label={`Next round, closes ${hhmm(around.data.next.expiry)}`}>
              {hhmm(around.data.next.expiry)} ›
            </Link>
          ) : (
            <span aria-hidden>›</span>
          )}
        </span>
      </nav>

      <header className="pf-head rd-head">
        <div>
          <span className="eyebrow pf-live">
            <i aria-hidden className={live ? '' : 'still'} />
            {roundName(m.cadence)} round · #{m.id.toString()} · {dayWords(m.expiry)}
          </span>
          <h1 className="title pf-title rd-title">
            BTC above <em>{usd0(m.strike)}</em>?
          </h1>
        </div>
        <Verdict detail={d} now={now} />
      </header>

      <div className="rd-grid">
        <section className="card rd-chart" aria-label="Bitcoin over the round, from Mezo's oracle">
          <div className="rd-chart-top">
            <span className="label">Bitcoin, from Mezo&apos;s oracle</span>
            <span className="rd-legend">
              <span>
                <i className="k-line" aria-hidden /> Up line {usd0(m.strike)}
              </span>
              {settle != null ? (
                <span>
                  <i className={`k-close ${move != null && move > 0 ? 'up' : 'down'}`} aria-hidden /> Close {usd0(settle)}
                </span>
              ) : null}
            </span>
          </div>
          <Chart
            series={path.data ?? []}
            strike={m.strike}
            windowMs={m.expiry - from}
            from={from}
            to={m.expiry}
            height={phone ? 220 : 340}
            close={settle != null ? { t: m.expiry, usd: settle } : null}
          />
          <ol className="rd-times">
            <li>
              <b className="mono">{hms(d.openedAt)}</b>
              <span>Line set at BTC&apos;s price</span>
            </li>
            <li>
              <b className="mono">{hms(m.expiry - 30_000)}</b>
              <span>Betting closes</span>
            </li>
            <li>
              <b className="mono">{hms(m.expiry)}</b>
              <span>{live ? `Closes in ${clock(Math.max(0, left))}` : 'Round closes'}</span>
            </li>
            <li>
              <b className="mono">{d.settledAt != null ? hms(d.settledAt) : '—'}</b>
              <span>{m.status === 'void' ? 'Refunded' : d.settledAt != null ? `Settled, ${delay}s later` : 'Settles on the next print'}</span>
            </li>
          </ol>
        </section>

        <aside className="rd-side">
          <div className="card rd-facts">
            <Fact k="Up line" v={usd0(m.strike)} note="BTC when the round opened" />
            {live ? (
              <Fact
                k="Now"
                v={spotNow != null ? usd0(spotNow) : '—'}
                note={liveMove != null ? `${usd0(Math.abs(liveMove))} ${liveMove > 0 ? 'above' : 'at or below'} the line` : ' '}
                tone={liveMove != null ? (liveMove > 0 ? 'up' : 'down') : undefined}
              />
            ) : (
              <Fact
                k="Close"
                v={settle != null ? usd0(settle) : '—'}
                note={move != null ? `${usd0(Math.abs(move))} ${move > 0 ? 'above' : 'at or below'} the line` : 'No price arrived in time'}
                tone={move != null ? (move > 0 ? 'up' : 'down') : undefined}
              />
            )}
            <Fact
              k="Bets"
              v={String(d.bets.length)}
              note={d.bets.length ? `${musd(staked)} MUSD staked` : 'Nobody bet on this one'}
            />
            <Fact
              k={m.status === 'void' ? 'Refunded' : 'Pool paid'}
              v={`${musd(d.payout)}`}
              note={live ? 'Once it settles' : 'MUSD, to winners'}
            />
          </div>
          {live ? (
            <Link className="btn red block tall" href="/markets">
              Bet on a live round
            </Link>
          ) : null}
        </aside>
      </div>

      <section className="rd-section" aria-labelledby="bets-h">
        <div className="section-head">
          <h2 className="heading" id="bets-h">
            Bets on this round
          </h2>
          <span className="small">{d.bets.length ? `${d.bets.length} · ${musd(staked)} MUSD` : ''}</span>
        </div>
        {d.bets.length ? (
          <div className="card rd-bets">
            {d.bets.map((b) => (
              <BetRow key={b.positionId.toString()} b={b} m={m} mine={!!address && b.owner.toLowerCase() === address.toLowerCase()} />
            ))}
          </div>
        ) : (
          <div className="card rd-nobets">
            <p className="body">
              No bets on this round, so the pool had nothing at risk.{' '}
              {live ? (
                <Link className="link" href="/markets">
                  Be the first
                </Link>
              ) : (
                <Link className="link" href="/markets">
                  Call the next one
                </Link>
              )}
            </p>
          </div>
        )}
      </section>

      <section className="rd-section" aria-labelledby="chain-h">
        <div className="section-head">
          <h2 className="heading" id="chain-h">
            On the chain
          </h2>
        </div>
        <div className="rd-chain">
          <ChainLink k="Opened" tx={d.openTx} note={`${hms(d.openedAt)} · the keeper sets the line`} />
          <ChainLink
            k={m.status === 'void' ? 'Voided' : 'Settled'}
            tx={d.settleTx}
            note={d.settledAt != null ? `${hms(d.settledAt)} · ${m.status === 'void' ? 'every stake refunded' : `closed at ${usd0(settle ?? 0)}`}` : live ? 'after the close' : '—'}
          />
          <a className="rd-chain-row" href={explorerAddress(MEZO_PRICE_ORACLE)} target="_blank" rel="noreferrer">
            <span className="label">Price</span>
            <span className="strong">Mezo&apos;s BTC oracle</span>
            <span className="small">the validators&apos; own price, every block</span>
          </a>
          <a className="rd-chain-row" href={explorerAddress(venue())} target="_blank" rel="noreferrer">
            <span className="label">Contract</span>
            <span className="strong mono">{shortAddr(venue())}</span>
            <span className="small">holds the stakes and pays the winners</span>
          </a>
        </div>
      </section>
    </div>
  );
}

function Verdict({ detail, now }: { detail: RoundDetail; now: number }) {
  const m = detail.market;
  if (detail.outcome === 'live') {
    const left = m.expiry - now;
    return (
      <div className="rd-verdict live" role="status">
        <span className="rd-verdict-k">{left > 0 ? 'Live' : 'Settling'}</span>
        <span className="rd-verdict-v mono">{left > 0 ? clock(left) : '00:00'}</span>
      </div>
    );
  }
  if (detail.outcome === 'void') {
    return (
      <div className="rd-verdict void" role="status">
        <span className="rd-verdict-k">Refunded</span>
        <span className="rd-verdict-v">No price in time</span>
      </div>
    );
  }
  const up = detail.outcome === 'up';
  return (
    <div className={`rd-verdict ${up ? 'up' : 'down'}`} role="status">
      <span className="rd-verdict-k">
        <Tri dir={up ? 'up' : 'down'} size={11} /> {up ? 'Up won' : 'Down won'}
      </span>
      <span className="rd-verdict-v">Closed at {usd0(m.settlement ?? 0)}</span>
    </div>
  );
}

function Fact({ k, v, note, tone }: { k: string; v: string; note?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rd-fact">
      <span className="pf-k">{k}</span>
      <span className={`rd-fact-v${tone ? ` ${tone}` : ''}`}>{v}</span>
      {note ? <span className="small">{note}</span> : null}
    </div>
  );
}

function BetRow({ b, m, mine }: { b: RoundBet; m: Market; mine: boolean }) {
  // Stake and payout show truncated to the cent, so the gain is their difference as shown.
  const cent = 10n ** 16n;
  const gain = b.paid != null ? (b.paid / cent - b.cost / cent) * cent : null;
  const state =
    b.result === 'won'
      ? `Won +${musd(gain ?? 0n)}`
      : b.result === 'lost'
        ? `Lost ${musd(b.cost)}`
        : b.result === 'cashed'
          ? `Cashed out ${musd(b.paid ?? 0n)}`
          : b.result === 'refunded'
            ? 'Refunded'
            : 'In play';
  const tone = b.result === 'won' ? 'win' : b.result === 'lost' ? 'behind' : 'flat';
  return (
    <div className={`rd-bet ${tone}`}>
      <span className={`side-tile ${b.side}`} aria-hidden>
        {b.side !== 'range' ? <Tri dir={b.side} size={11} color={b.side === 'up' ? 'var(--green-text)' : 'var(--down-text)'} /> : <i className="range-glyph" />}
      </span>
      <span className="rd-bet-call">
        <b>{callWords(b.side, b.lower, b.higher, m)}</b>
        <small>
          <a href={explorerAddress(b.owner)} target="_blank" rel="noreferrer" className="mono">
            {mine ? 'You' : shortAddr(b.owner)}
          </a>{' '}
          · {hhmm(b.time)} · at {Math.round(b.price * 100)}¢
        </small>
      </span>
      <span className="rd-bet-num">
        <span className="mono">{musd(b.cost)}</span>
        <small>paid in</small>
      </span>
      <span className="rd-bet-num">
        <span className="mono strong">{musd(b.quantity)}</span>
        <small>pays</small>
      </span>
      <span className={`ledger-state ${tone}`}>{state}</span>
      <a className="rd-bet-tx" href={explorerTx(b.tx)} target="_blank" rel="noreferrer" aria-label="The bet on the explorer">
        ↗
      </a>
    </div>
  );
}

function ChainLink({ k, tx, note }: { k: string; tx: string | null; note: string }) {
  const body = (
    <>
      <span className="label">{k}</span>
      <span className="strong mono">{tx ? `${tx.slice(0, 10)}…${tx.slice(-6)}` : '—'}</span>
      <span className="small">{note}</span>
    </>
  );
  return tx ? (
    <a className="rd-chain-row" href={explorerTx(tx)} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className="rd-chain-row">{body}</div>
  );
}

function RoundSkeleton() {
  return (
    <div className="shell page" aria-busy>
      <div className="pf-head rd-head">
        <div>
          <Skeleton width={220} height={14} />
          <div style={{ marginTop: 16 }}>
            <Skeleton width={320} height={40} />
          </div>
        </div>
      </div>
      <div className="rd-grid">
        <section className="card rd-chart">
          <Skeleton width="100%" height={340} radius={16} />
        </section>
        <aside className="rd-side">
          <div className="card rd-facts">
            <Skeleton width="100%" height={220} radius={12} />
          </div>
        </aside>
      </div>
    </div>
  );
}
