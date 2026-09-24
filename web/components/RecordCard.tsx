'use client';
// Your record, all time: every bet this wallet has seen decided, read from the contract's own events,
// so it matches what the explorer shows. The curve is the running result after each decided bet, in
// the order they were decided; the four figures say how it got there.
import Link from 'next/link';
import type { Address } from 'viem';
import { callWords, fetchRecord, hhmm, musd, type RecordEntry, type WalletRecord } from '@renqun/client';
import { usePoll } from '@/lib/hooks';
import { Skeleton } from './ui';
import { dayWords } from './RoundPage';

const signed = (wei: bigint) => `${wei > 0n ? '+' : wei < 0n ? '−' : ''}${musd(wei < 0n ? -wei : wei)}`;
const gainOf = (e: RecordEntry) => (e.paid ?? 0n) - e.cost;

export function RecordCard({ address }: { address: Address }) {
  const rec = usePoll<WalletRecord>(() => fetchRecord(address), 60_000, `record:${address}`);
  const r = rec.data;

  if (!r) {
    return rec.loading ? (
      <section className="card rec" aria-busy>
        <Skeleton width="100%" height={150} radius={14} />
      </section>
    ) : null;
  }
  if (r.decided === 0) {
    return (
      <section className="card rec rec-empty">
        <span className="pf-k">Your record</span>
        <p className="body">It starts with your first settled bet: win rate, best call, and the running result, straight from the chain.</p>
      </section>
    );
  }

  const tone = r.net > 0n ? 'up' : r.net < 0n ? 'down' : '';
  const rate = r.won + r.lost > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : null;
  return (
    <section className="card rec" aria-labelledby="rec-h">
      <div className="rec-main">
        <span className="pf-k" id="rec-h">
          Your record · all time
        </span>
        <span className={`rec-net ${tone}`}>
          {signed(r.net)}
          <em>MUSD</em>
        </span>
        <span className="pf-note">
          over {r.decided} decided bet{r.decided > 1 ? 's' : ''} · {musd(r.staked)} MUSD staked
        </span>
        <Curve points={r.curve} tone={tone} />
      </div>
      <div className="rec-figs">
        <div className="rec-fig">
          <span className="pf-k">Win rate</span>
          <b>{rate != null ? `${rate}%` : '—'}</b>
          <span className="pf-note">
            {r.won} won · {r.lost} lost
          </span>
        </div>
        <div className="rec-fig">
          <span className="pf-k">Best call</span>
          <b className="up">{r.best ? signed(gainOf(r.best)) : '—'}</b>
          <span className="pf-note">
            {r.best ? (
              <Link href={`/rounds/${r.best.market.id}`}>
                {callWords(r.best.side, r.best.lower, r.best.higher, r.best.market)} · {dayWords(r.best.market.expiry)} {hhmm(r.best.market.expiry)}
              </Link>
            ) : (
              'no win yet'
            )}
          </span>
        </div>
        <div className="rec-fig">
          <span className="pf-k">Current run</span>
          <b className={r.run?.kind === 'won' ? 'up' : r.run ? 'down' : ''}>{r.run ? `${r.run.count} ${r.run.kind === 'won' ? (r.run.count > 1 ? 'wins' : 'win') : r.run.count > 1 ? 'losses' : 'loss'}` : '—'}</b>
          <span className="pf-note">in a row, newest first</span>
        </div>
        <div className="rec-fig">
          <span className="pf-k">Cashed out</span>
          <b>{r.cashed}</b>
          <span className="pf-note">{r.cashed ? 'sold before the close' : 'none sold early'}</span>
        </div>
      </div>
    </section>
  );
}

/** The running result after each decided bet: one step per bet, the zero line dashed. */
function Curve({ points, tone }: { points: WalletRecord['curve']; tone: string }) {
  if (points.length < 2) return null;
  const W = 520;
  const H = 96;
  const values = [0, ...points.map((p) => p.net)];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || 1;
  const y = (v: number) => 6 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 12);
  const x = (i: number) => (i / points.length) * W;
  const path = [`M0 ${y(0).toFixed(1)}`, ...points.map((p, i) => `L${x(i + 1).toFixed(1)} ${y(p.net).toFixed(1)}`)].join('');
  const color = tone === 'up' ? '#128a4b' : tone === 'down' ? '#8a817a' : '#171717';
  const last = points[points.length - 1];
  return (
    <svg className="rec-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Running result, now ${last.net.toFixed(2)} MUSD`}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(23,23,23,0.18)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
      <path d={`${path}L${W} ${y(0).toFixed(1)}Z`} fill={color} opacity={0.08} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
