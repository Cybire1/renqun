import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { explorerTx } from '@renqun/client';
import { RenqunMark } from '@/components/RenqunMark';
import { loadPath, loadStory, words } from './story';

// A settled bet never changes; a live one is re-read at most once a minute.
export const revalidate = 60;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await loadStory((await params).id);
  if (!s) return { title: 'A call on Renqun' };
  const w = words(s);
  return {
    title: w.title,
    description: w.description,
    openGraph: { title: w.title, description: w.description, type: 'article' },
    twitter: { card: 'summary_large_image', title: w.title, description: w.description },
  };
}

export default async function Share({ params }: Props) {
  const { id } = await params;
  const s = await loadStory(id);
  if (!s) notFound();
  const w = words(s);
  const path = await loadPath(id);

  return (
    <div className="shell page share-page">
      <article className={`share-card ${w.tone}`} aria-label="A call on Renqun">
        <header className="share-top">
          <span className="share-brand">
            <RenqunMark size={28} />
            Renqun
          </span>
          <span className="share-when mono">{w.when}</span>
        </header>
        <div className="share-body">
          <div className="share-copy">
            <span className={`share-kicker ${w.tone}`}>{w.kicker}</span>
            <h1 className="share-call">
              {w.call.before}
              <em>{w.call.price}</em>
              {w.call.after}
            </h1>
            <p className={`share-result ${w.tone}`}>{w.result}</p>
            <p className="share-detail">{w.detail}</p>
          </div>
          <Spark path={path} strike={s.market.strike} settle={s.market.settlement} tone={w.tone} />
        </div>
        <footer className="share-foot">
          <span>Settled by Mezo&apos;s own Bitcoin price · paid in MUSD</span>
          <span className="share-url">renqun.app</span>
        </footer>
      </article>

      <div className="share-cta">
        <Link className="btn red tall" href="/markets">
          Call the next round
        </Link>
        <Link className="btn soft tall" href={`/rounds/${s.market.id}`}>
          See the round
        </Link>
      </div>
      {s.tx ? (
        <p className="small share-proof">
          Placed on the chain:{' '}
          <a className="link" href={explorerTx(s.tx)} target="_blank" rel="noreferrer">
            see the bet on the Mezo explorer
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** The round's path in one line: the Up line dashed, the close marked. Server-drawn, no script. */
function Spark({ path, strike, settle, tone }: { path: { t: number; usd: number }[]; strike: number; settle: number | null; tone: string }) {
  if (path.length < 3) return <div className="share-spark empty" aria-hidden />;
  const W = 420;
  const H = 220;
  const values = [...path.map((p) => p.usd), strike, ...(settle != null ? [settle] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.15, 5);
  const t0 = path[0].t;
  const t1 = path[path.length - 1].t;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  const d = path.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.usd).toFixed(1)}`).join('');
  const color = tone === 'up' ? '#128a4b' : tone === 'down' ? '#8a817a' : '#171717';
  const endY = y(settle ?? path[path.length - 1].usd);
  return (
    <svg className="share-spark" viewBox={`-8 -8 ${W + 16} ${H + 16}`} role="img" aria-label="Bitcoin over the round">
      <line x1={0} x2={W} y1={y(strike)} y2={y(strike)} stroke="#ff004d" strokeWidth={2} strokeDasharray="7 7" />
      <path d={d} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={endY} r={12} fill={color} opacity={0.18} />
      <circle cx={W} cy={endY} r={6.5} fill={color} stroke="#fff" strokeWidth={2.5} />
    </svg>
  );
}
