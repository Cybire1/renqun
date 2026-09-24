'use client';
// The round's picture: BTC from Mezo's oracle over the round's window, green above the Up line and
// warm grey below it, the line itself dashed in red. One scale places the line, the strike and the
// axis labels.
import { useEffect, useId, useRef, useState } from 'react';
import type { SpotPoint } from '@renqun/client';

const UP = '#128a4b';
const DOWN = '#8a817a';
const RED = '#ff004d';
const AXIS_W = 64;
const PAD_Y = 14;

export function Chart({
  series,
  strike,
  windowMs,
  height = 280,
  bare = false,
  from,
  to,
  close,
  band,
}: {
  series: SpotPoint[];
  strike: number;
  windowMs: number;
  height?: number;
  /** No axis column or gridlines: the line runs the full width, for the hero card. */
  bare?: boolean;
  /** A fixed time range (ms) instead of the latest `windowMs`: a past round's whole run. */
  from?: number;
  to?: number;
  /** The settlement print, marked where the round closed. */
  close?: SpotPoint | null;
  /** A price band a range bet pays inside, shaded. */
  band?: { low: number; high: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(0, width - (bare ? 0 : AXIS_W));
  const pts = series.length > 1 ? series : null;

  let body = null;
  if (pts && plotW > 0) {
    const tMax = to ?? pts[pts.length - 1].t;
    const tMin = from ?? tMax - windowMs;
    const span_t = Math.max(1, tMax - tMin);
    const values = [...pts.map((p) => p.usd), strike, ...(close ? [close.usd] : []), ...(band ? [band.low, band.high] : [])];
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const span = Math.max(hi - lo, 20);
    lo -= span * 0.12;
    hi += span * 0.12;
    const x = (t: number) => ((Math.min(Math.max(t, tMin), tMax) - tMin) / span_t) * plotW;
    const y = (usd: number) => PAD_Y + (1 - (usd - lo) / (hi - lo)) * (height - PAD_Y * 2);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.usd).toFixed(1)}`).join('');
    const first = pts[0];
    const last = pts[pts.length - 1];
    const area = `${line}L${x(last.t).toFixed(1)} ${height}L${x(first.t).toFixed(1)} ${height}Z`;
    const sy = y(strike);
    const ticks = [0, 1, 2, 3].map((i) => hi - ((hi - lo) * (i + 0.5)) / 4);
    const lastUp = last.usd > strike;

    body = (
      <>
        <defs>
          <clipPath id={`above-${id}`}>
            <rect x={0} y={0} width={plotW} height={sy} />
          </clipPath>
          <clipPath id={`below-${id}`}>
            <rect x={0} y={sy} width={plotW} height={height - sy} />
          </clipPath>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={UP} stopOpacity={0.1} />
            <stop offset="1" stopColor={UP} stopOpacity={0} />
          </linearGradient>
        </defs>
        {bare
          ? null
          : ticks.map((v) => (
              <g key={v}>
                <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="rgba(23,23,23,0.05)" />
                <text className="axis" x={plotW + 10} y={y(v) + 4}>
                  {Math.round(v).toLocaleString('en-US')}
                </text>
              </g>
            ))}
        {band ? (
          <rect x={0} width={plotW} y={y(band.high)} height={Math.max(2, y(band.low) - y(band.high))} fill={UP} opacity={0.09} />
        ) : null}
        <path d={area} fill={`url(#fill-${id})`} clipPath={`url(#above-${id})`} />
        <path d={line} fill="none" stroke={UP} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#above-${id})`} />
        <path d={line} fill="none" stroke={DOWN} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#below-${id})`} />
        <line x1={0} x2={plotW} y1={sy} y2={sy} stroke={RED} strokeWidth={1.4} strokeDasharray="5 5" />
        {close ? (
          <>
            <line x1={x(close.t)} x2={x(close.t)} y1={0} y2={height} stroke="rgba(23,23,23,0.18)" strokeDasharray="2 4" />
            <circle cx={x(close.t)} cy={y(close.usd)} r={10} fill={close.usd > strike ? UP : DOWN} opacity={0.18} />
            <circle cx={x(close.t)} cy={y(close.usd)} r={5} fill={close.usd > strike ? UP : DOWN} stroke="#fff" strokeWidth={2} />
          </>
        ) : (
          <>
            <circle cx={x(last.t)} cy={y(last.usd)} r={9} fill={lastUp ? UP : DOWN} opacity={0.16} />
            <circle cx={x(last.t)} cy={y(last.usd)} r={4.5} fill={lastUp ? UP : DOWN} stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </>
    );
  }

  return (
    <div ref={box} className="chart" style={{ height }}>
      {body ? (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`BTC price over the round, Up line at ${Math.round(strike)}`}>
          {body}
        </svg>
      ) : (
        <span className="skeleton" style={{ width: '100%', height, borderRadius: 16 }} aria-hidden />
      )}
    </div>
  );
}
