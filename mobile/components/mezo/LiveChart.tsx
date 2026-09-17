// BTC from Mezo's oracle through the app's own PriceChart: it draws on once, slides between
// updates, splits green above the line and ink below (the Mezo palette), and pulses at the latest
// print. PriceChart morphs point-by-point, which needs a constant point count, so the oracle series
// is resampled onto a fixed grid over the window.
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { PriceChart } from '../PriceChart';
import type { SpotPoint } from '../../lib/mezo/client';

const POINTS = 48;

export function resample(series: SpotPoint[], windowMs: number, n = POINTS): number[] {
  if (series.length < 2) return [];
  const t1 = series[series.length - 1].t;
  // Only the span we actually have: padding a missing start with the first price drew a fake flat line.
  const t0 = Math.max(t1 - windowMs, series[0].t);
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * (t1 - t0)) / (n - 1);
    while (j + 1 < series.length && series[j + 1].t <= t) j++;
    const a = series[j];
    const b = series[Math.min(j + 1, series.length - 1)];
    if (t <= a.t || b.t === a.t) out.push(a.usd);
    else out.push(a.usd + ((b.usd - a.usd) * (t - a.t)) / (b.t - a.t));
  }
  return out;
}

function LiveChartInner({
  series,
  strike,
  windowMs,
  height = 200,
}: {
  series: SpotPoint[];
  strike: number;
  windowMs: number;
  height?: number;
}) {
  const values = useMemo(() => resample(series, windowMs), [series, windowMs]);
  return (
    <View style={{ height }} accessibilityRole="image" accessibilityLabel="BTC price over the round, with the UP line">
      <PriceChart series={values} strike={strike} bare loading={values.length === 0} areaOpacity={0.05} />
    </View>
  );
}

export const LiveChart = memo(LiveChartInner);
