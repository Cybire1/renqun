// The card a shared bet unfurls as: the call, how it went, and the round's path, in Renqun's colours.
import { ImageResponse } from 'next/og';
import { loadPath, loadStory, words } from './story';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A Bitcoin call on Renqun, settled on Mezo';
export const revalidate = 60;

const INK = '#171717';
const RED = '#FF004D';
const SAND = '#F4F0ED';
const TONES = { up: { fg: '#03703C', bg: '#DFF5E9', line: '#128a4b' }, down: { fg: '#48423D', bg: '#ECE6E0', line: '#8a817a' }, flat: { fg: INK, bg: '#EAE3DD', line: INK } };

async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

function Mark({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="8 4 224 224">
      <g stroke={INK} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M78 122L120 62L162 122" />
        <path d="M20 206L62 146L104 206" />
        <path d="M136 206L178 146L220 206" />
      </g>
      <circle cx={120} cy={29} r={14} fill={RED} />
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, path, sora, inter, mono] = await Promise.all([
    loadStory(id),
    loadPath(id),
    googleFont('Sora', 700),
    googleFont('Inter', 500),
    googleFont('JetBrains+Mono', 700),
  ]);
  const fonts = [
    sora && { name: 'Sora', data: sora, weight: 700 as const, style: 'normal' as const },
    inter && { name: 'Inter', data: inter, weight: 500 as const, style: 'normal' as const },
    mono && { name: 'Mono', data: mono, weight: 700 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));

  if (!s) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, background: SAND, fontFamily: 'Sora', fontSize: 64, color: INK }}>
          <Mark size={96} />
          Renqun
        </div>
      ),
      { ...size, fonts },
    );
  }

  const w = words(s);
  const tone = TONES[w.tone];
  // The path, drawn to the chart box's own scale.
  const CW = 400;
  const CH = 236;
  let chart = null;
  if (path.length > 2) {
    const values = [...path.map((p) => p.usd), s.market.strike, ...(s.market.settlement != null ? [s.market.settlement] : [])];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.15, 5);
    const t0 = path[0].t;
    const t1 = path[path.length - 1].t;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * CW;
    const y = (v: number) => (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * CH;
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.usd).toFixed(1)}`).join('');
    const endY = y(s.market.settlement ?? path[path.length - 1].usd);
    chart = (
      <svg width={CW + 24} height={CH + 24} viewBox={`-12 -12 ${CW + 24} ${CH + 24}`}>
        <line x1={0} x2={CW} y1={y(s.market.strike)} y2={y(s.market.strike)} stroke={RED} strokeWidth={2.5} strokeDasharray="8 8" />
        <path d={d} fill="none" stroke={tone.line} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={CW} cy={endY} r={9} fill={tone.line} stroke="#FFFFFF" strokeWidth={3} />
      </svg>
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: SAND, padding: '52px 64px', fontFamily: 'Inter', color: INK }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'Sora', fontSize: 34 }}>
            <Mark size={44} />
            Renqun
          </div>
          <div style={{ display: 'flex', fontFamily: 'Mono', fontSize: 21, color: '#7A716A', letterSpacing: 1 }}>{w.when.toUpperCase()}</div>
        </div>

        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 640 }}>
            <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '10px 18px', borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 24, letterSpacing: 1 }}>
              {w.kicker.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 22, fontFamily: 'Sora', fontSize: 62, lineHeight: 1.05, letterSpacing: -2 }}>
              <span>{w.call.before}</span>
              <span style={{ color: RED }}>{w.call.price}</span>
              <span>{w.call.after}</span>
            </div>
            <div style={{ display: 'flex', marginTop: 26, fontFamily: 'Sora', fontSize: 50, color: tone.fg, letterSpacing: -1.5 }}>{w.result}</div>
            <div style={{ display: 'flex', marginTop: 8, fontSize: 25, color: '#545454' }}>{w.detail}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 440, height: 290, borderRadius: 32, background: '#FFFFFF', boxShadow: '0 12px 30px rgba(90,52,24,0.10)' }}>
            {chart ?? <Mark size={120} />}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 23, color: '#6B6B6B' }}>
          <span>Settled by Mezo&apos;s own Bitcoin price · paid in MUSD</span>
          <span style={{ fontFamily: 'Sora', fontSize: 30, color: RED }}>renqun.app</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
