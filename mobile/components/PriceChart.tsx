// Live price chart — the line draws on, runs GREEN above the target / RED below it (via
// two clipped copies of the same path), an area gradient fills under it, a dashed target
// line marks the strike, the right gutter shows price ticks, and a glowing end-dot pulses
// at the latest price. Two modes:
//   • card (default): bordered card, fixed `height` — used on the bet screen.
//   • flush: same, minus the card chrome, for sitting inside a grouped card.
//   • bare: fills its parent — used full-bleed on the feed.
// No standing header in any mode: the labels it carried are already on the screen around it.
//
// BETWEEN mode: pass `band={low, high}` to shade a range on the chart with two DRAGGABLE
// edge handles (RN Animated + PanResponder — decoupled from the reanimated line so the drag
// stays smooth; the snapped price commits via onBandChange on release). Replaces the single
// target line while active.
// react-native-svg + reanimated (both already in Expo Go — no dev-client rebuild).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { fonts, radius, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';
import { usd } from '../lib/format';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

const PAD_R = 50; // right gutter for the price ticks
const PAD_V = 14; // vertical breathing room inside the plot
const BAND_MIN_GAP = 20; // $ — the band can never be narrower than this

export interface Band {
  low: number;
  high: number;
}

function PriceChartInner({
  series,
  strike,
  loading,
  height = 150,
  bare = false,
  flush = false,
  band,
  onBandChange,
  onBandCommit,
  areaOpacity = 0.18,
}: {
  series: number[];
  strike: number;
  loading?: boolean;
  height?: number;
  bare?: boolean;
  /** Keep the header but drop the card chrome: for sitting INSIDE a grouped card,
   *  where a second border would just be a box in a box. */
  flush?: boolean;
  /** BETWEEN mode: shade + drag a finite range instead of a single strike line. */
  band?: Band;
  /** Fired when an edge settles (on release), with the snapped band. */
  onBandChange?: (b: Band) => void;
  /** Fired on release, after onBandChange — a good moment to re-quote. */
  onBandCommit?: () => void;
  /** Strength of the shading under the line. Light skins want less than the dark default. */
  areaOpacity?: number;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(0); // line draw-on 0→1
  const pulse = useSharedValue(0); // end-dot halo loop

  const { w, h: H } = size; // measured plot size (h fixed in card mode, flex in bare mode)
  const plotW = Math.max(0, w - PAD_R);
  const pts = series.length >= 2 ? series : [];
  const last = pts.length ? pts[pts.length - 1] : null;
  const above = last == null || strike <= 0 ? true : last >= strike;

  // Domain includes the strike AND the band edges so both are always in view.
  //
  // Only a REAL strike, though. Folding a 0 in here dragged the floor of the domain to zero, so a
  // BTC series drew as a flat line pinned to the top of the plot over a huge empty fill, and the
  // right-hand ticks counted down to a negative dollar price. A caller with no line to draw is not
  // asking for zero to be kept in view.
  const vals = pts.length ? [...pts] : [];
  if (strike > 0) vals.push(strike);
  if (band) vals.push(band.low, band.high);
  if (!vals.length) vals.push(0, 1);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const dom = (max - min) * 0.14 || (strike || 1) * 0.0008;
  min -= dom;
  max += dom;
  const span = max - min || 1;

  const x = (i: number) => (pts.length <= 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
  const y = (v: number) => PAD_V + (1 - (v - min) / span) * (H - PAD_V * 2);

  const coords = pts.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${plotW.toFixed(1)} ${H} L0 ${H} Z` : '';
  // With no strike there is no above and no below, so the split sits at the floor and the whole
  // series draws in one colour. Parking it mid-plot instead painted the bottom half of an ordinary
  // chart red, which reads as a loss against a line that was never there.
  const targetY = strike > 0 ? y(strike) : H;
  const lastC = coords.length ? coords[coords.length - 1] : null;
  const lineColor = above ? colors.up : colors.down;

  const len = useMemo(() => {
    let L = 0;
    for (let i = 1; i < coords.length; i++)
      L += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].y - coords[i - 1].y);
    return L || 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, w, H, strike, band?.low, band?.high]);

  // The draw-on is an ENTRANCE, not an update.
  //
  // It used to key on pts.length, which produced the worst of both behaviours. Append a tick and
  // the length changed, so the whole line erased and redrew over 850ms, several times a minute.
  // Replace the window with the same number of points and nothing fired at all, so the path
  // snapped between two shapes with no transition. Neither reads as a live price; one reads as a
  // glitch and the other as a still image. Now it plays once, when a chart first has a shape to
  // draw, and every update after that is carried by the morph below.
  const drawnFor = useRef('');
  useEffect(() => {
    const key = `${plotW.toFixed(0)}x${H.toFixed(0)}`;
    if (pts.length > 1 && plotW > 0 && H > 0) {
      if (drawnFor.current !== key) {
        drawnFor.current = key;
        progress.value = 0;
        progress.value = withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) });
      }
      pulse.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      drawnFor.current = '';
      cancelAnimation(pulse);
      pulse.value = 0;
    }
    return () => cancelAnimation(pulse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.length, plotW, H]);

  // ─── frame-to-frame morph: what actually makes it read as live ───
  //
  // Between two data frames the path is interpolated point by point on the UI thread, so a new
  // tick slides the line rather than teleporting it. Interpolation needs a stable point COUNT,
  // which is why the screen keeps its window constant; when the count does change (first paint,
  // a resize, a new market) we jump rather than morph, because pairing points across different
  // lengths would smear the whole line sideways.
  const prevFlat = useSharedValue<number[]>([]);
  const nextFlat = useSharedValue<number[]>([]);
  const morph = useSharedValue(1);
  const flat = useMemo(() => {
    const out: number[] = [];
    for (const c of coords) { out.push(c.x, c.y); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, w, H, strike, band?.low, band?.high]);

  useEffect(() => {
    if (flat.length < 4) return;
    if (nextFlat.value.length !== flat.length) {
      prevFlat.value = flat;
      nextFlat.value = flat;
      morph.value = 1;
      return;
    }
    prevFlat.value = nextFlat.value;
    nextFlat.value = flat;
    morph.value = 0;
    morph.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat]);

  // plotW and H are captured through the dependency array rather than mirrored into shared
  // values, because assigning a shared value during render is the very thing Reanimated warns
  // about (and the warning is already in this project's logs from elsewhere).
  // One animatedProps per element: the shape AND the entrance dash-offset travel together,
  // because a component may only take a single animatedProps object.
  const linePathProps = useAnimatedProps(() => {
    const a = prevFlat.value, b = nextFlat.value, t = morph.value;
    if (b.length < 4) return { d: '', strokeDashoffset: 0 };
    const same = a.length === b.length;
    let d = '';
    for (let i = 0; i < b.length; i += 2) {
      const px = same ? a[i] + (b[i] - a[i]) * t : b[i];
      const py = same ? a[i + 1] + (b[i + 1] - a[i + 1]) * t : b[i + 1];
      d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)} `;
    }
    return { d, strokeDashoffset: len * (1 - progress.value) };
  }, [len]);
  const areaPathProps = useAnimatedProps(() => {
    const a = prevFlat.value, b = nextFlat.value, t = morph.value;
    if (b.length < 4) return { d: '' };
    const same = a.length === b.length;
    let d = '';
    for (let i = 0; i < b.length; i += 2) {
      const px = same ? a[i] + (b[i] - a[i]) * t : b[i];
      const py = same ? a[i + 1] + (b[i + 1] - a[i + 1]) * t : b[i + 1];
      d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)} `;
    }
    return { d: `${d}L${plotW.toFixed(1)} ${H} L0 ${H} Z` };
  }, [plotW, H]);
  const dotProps = useAnimatedProps(() => {
    const a = prevFlat.value;
    const b = nextFlat.value;
    const t = morph.value;
    if (b.length < 2) return { cx: 0, cy: 0 };
    const i = b.length - 2;
    const same = a.length === b.length;
    return {
      cx: same ? a[i] + (b[i] - a[i]) * t : b[i],
      cy: same ? a[i + 1] + (b[i + 1] - a[i + 1]) * t : b[i + 1],
    };
  });

  const haloProps = useAnimatedProps(() => ({
    r: 4.5 + pulse.value * 6,
    opacity: 0.28 * (1 - pulse.value),
  }));

  const ticks = [0, 0.34, 0.68, 1].map((f) => ({ v: max - f * span, ty: PAD_V + f * (H - PAD_V * 2) }));
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // ─── draggable band overlay ───
  // The offsets are reanimated shared values, not RN Animated nodes. The old version
  // composed the fill height as RNA.add(new RNA.Value(base), RNA.subtract(tyLow, tyHigh))
  // INSIDE render, so every parent tick (this screen re-renders once a second for the
  // countdown) allocated a fresh node and rebuilt the fill's animated binding underneath the
  // finger. Shared values are written directly and read on the UI thread, so a re-render
  // during a drag costs nothing and the transform never has to round-trip the bridge.
  const tyHigh = useSharedValue(0);
  const tyLow = useSharedValue(0);
  const fillBase = useSharedValue(0);
  const dyHigh = useRef(0); // last clamped drag offset (px), read on release
  const dyLow = useRef(0);
  // Keep the number in the moving handle honest while the gesture is in progress. The
  // parent band is committed only on release so the chart domain does not continually
  // re-scale underneath the user's finger.
  const [previewBand, setPreviewBand] = useState<Band | null>(null);
  const previewBandRef = useRef<Band | null>(null);
  // Live values the pan handlers read. The responders are built ONCE (useRef below), so
  // anything they close over is frozen at first mount, when the chart has not been measured
  // and there is no band: H, yHigh and yLow are all 0. Reading those stale zeros made both
  // clamps degenerate — the high edge resolved to a constant +14px and the low edge to a
  // constant -14px, whatever the finger did, so the handles simply did not move. Every value
  // the handlers need therefore lives in this ref, refreshed on each render.
  const mapRef = useRef({ pxPerUsd: 1, H: 0, yHigh: 0, yLow: 0 });
  const bandRef = useRef<Band | undefined>(band);
  bandRef.current = band;
  const yHigh = band ? y(band.high) : 0;
  const yLow = band ? y(band.low) : 0;
  const plotInnerH = H - PAD_V * 2;
  mapRef.current = { pxPerUsd: plotInnerH / span, H, yHigh, yLow };

  const snap = (p: number) => Math.round(p / 10) * 10;

  const makeResponder = (edge: 'high' | 'low') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        previewBandRef.current = bandRef.current ?? null;
        setPreviewBand(previewBandRef.current);
      },
      onPanResponderMove: (_e, g) => {
        const b = bandRef.current;
        if (!b) return;
        const { pxPerUsd, H: h, yHigh: yH, yLow: yL } = mapRef.current;
        if (h <= 0) return; // not measured yet
        // clamp the drag so the two edges keep a minimum gap and stay a touch inside the plot
        const gapPx = BAND_MIN_GAP * pxPerUsd;
        let dy = g.dy;
        if (edge === 'high') {
          // high edge moving down (dy>0) must stop a gap above the low edge
          const maxDown = yL - yH - gapPx;
          dy = Math.min(dy, Math.max(0, maxDown));
          dy = Math.max(dy, PAD_V - yH); // don't leave the top
          dyHigh.current = dy;
          tyHigh.value = dy;
          const high = Math.max(b.low + BAND_MIN_GAP, Math.round(b.high - dy / pxPerUsd));
          previewBandRef.current = { low: b.low, high };
          setPreviewBand(previewBandRef.current);
        } else {
          const maxUp = -(yL - yH - gapPx);
          dy = Math.max(dy, Math.min(0, maxUp));
          dy = Math.min(dy, h - PAD_V - yL); // don't leave the bottom
          dyLow.current = dy;
          tyLow.value = dy;
          const low = Math.min(b.high - BAND_MIN_GAP, Math.round(b.low - dy / pxPerUsd));
          previewBandRef.current = { low, high: b.high };
          setPreviewBand(previewBandRef.current);
        }
      },
      onPanResponderRelease: () => {
        const b = bandRef.current;
        if (!b) return;
        const preview = previewBandRef.current ?? b;
        let next: Band;
        if (edge === 'high') {
          next = { low: b.low, high: Math.max(b.low + BAND_MIN_GAP, snap(preview.high)) };
          tyHigh.value = 0;
          dyHigh.current = 0;
        } else {
          next = { low: Math.min(b.high - BAND_MIN_GAP, snap(preview.low)), high: b.high };
          tyLow.value = 0;
          dyLow.current = 0;
        }
        previewBandRef.current = null;
        setPreviewBand(null);
        onBandChange?.(next);
        onBandCommit?.();
      },
      onPanResponderTerminate: () => {
        tyHigh.value = 0;
        tyLow.value = 0;
        dyHigh.current = 0;
        dyLow.current = 0;
        previewBandRef.current = null;
        setPreviewBand(null);
      },
    });
  const highPan = useRef(makeResponder('high')).current;
  const lowPan = useRef(makeResponder('low')).current;

  const bandActive = !!band && plotW > 0 && H > 0;
  // fill: top follows the high handle; height grows by (low drag − high drag). Written in an effect:
  // assigning a shared value during render is what Reanimated warns about on every frame.
  useEffect(() => {
    fillBase.value = Math.max(0, yLow - yHigh);
  }, [fillBase, yLow, yHigh]);
  const fillStyle = useAnimatedStyle(() => ({
    height: Math.max(0, fillBase.value + tyLow.value - tyHigh.value),
    transform: [{ translateY: tyHigh.value }],
  }));
  const highStyle = useAnimatedStyle(() => ({ transform: [{ translateY: tyHigh.value }] }));
  const lowStyle = useAnimatedStyle(() => ({ transform: [{ translateY: tyLow.value }] }));
  const displayBand = previewBand ?? band;

  const plot = (
    <View style={bare ? styles.plotFill : { height }} onLayout={onLayout}>
      {w > 0 && H > 0 && (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="pcUp" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.up} stopOpacity={areaOpacity} />
              <Stop offset="1" stopColor={colors.up} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="pcDown" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.down} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.down} stopOpacity={areaOpacity} />
            </LinearGradient>
            <ClipPath id="pcAbove">
              <Rect x={0} y={0} width={plotW} height={Math.max(0, targetY)} />
            </ClipPath>
            <ClipPath id="pcBelow">
              <Rect x={0} y={targetY} width={plotW} height={Math.max(0, H - targetY)} />
            </ClipPath>
          </Defs>

          {pts.length > 0 && (
            <>
              <AnimatedPath animatedProps={areaPathProps} fill="url(#pcUp)" clipPath="url(#pcAbove)" />
              <AnimatedPath animatedProps={areaPathProps} fill="url(#pcDown)" clipPath="url(#pcBelow)" />
              <AnimatedPath
                stroke={colors.up}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={len}
                animatedProps={linePathProps}
                clipPath="url(#pcAbove)"
              />
              <AnimatedPath
                stroke={colors.down}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={len}
                animatedProps={linePathProps}
                clipPath="url(#pcBelow)"
              />
            </>
          )}

          {/* Single strike target line — only when NOT in band mode, and only when there IS a
              strike. With strike 0 the target falls back to the middle of the domain, so a caller
              with no line to draw got a dashed rule across the centre of the chart that marked
              nothing at all. */}
          {!band && strike > 0 && (
            <Line
              x1={0}
              y1={targetY}
              x2={plotW}
              y2={targetY}
              stroke={colors.vermilion}
              strokeWidth={1}
              strokeDasharray="5 5"
              opacity={0.6}
            />
          )}

          {pts.length > 0 &&
            ticks.map((t, i) => (
              <SvgText
                key={i}
                x={w - 6}
                y={t.ty + 3}
                fill={colors.faint}
                fontSize={9}
                fontFamily={fonts.mono}
                textAnchor="end"
              >
                {`$${usd(t.v, 0)}`}
              </SvgText>
            ))}

          {lastC && (
            <>
              <AnimatedCircle fill={lineColor} animatedProps={haloProps} />
              <AnimatedCircle r={4} fill={lineColor} animatedProps={dotProps} />
              <AnimatedCircle r={4.5} fill="none" stroke={colors.ink} strokeWidth={1.5} animatedProps={dotProps} />
            </>
          )}
        </Svg>
      )}

      {/* draggable band overlay — RN Views on top of the SVG */}
      {bandActive && band && (
        <>
          <Reanimated.View
            pointerEvents="none"
            style={[styles.bandFill, { top: yHigh, width: plotW }, fillStyle]}
          />
          <Reanimated.View
            {...highPan.panHandlers}
            style={[styles.handle, { top: yHigh, width: w }, highStyle]}
          >
            <View style={[styles.handleLine, { width: plotW }]} />
            <View style={styles.handlePill}>
              <Text style={styles.handleGrip}>⋯</Text>
              <Text style={styles.handlePrice}>${usd(displayBand?.high ?? band.high, 0)}</Text>
            </View>
          </Reanimated.View>
          <Reanimated.View
            {...lowPan.panHandlers}
            style={[styles.handle, { top: yLow, width: w }, lowStyle]}
          >
            <View style={[styles.handleLine, { width: plotW }]} />
            <View style={styles.handlePill}>
              <Text style={styles.handleGrip}>⋯</Text>
              <Text style={styles.handlePrice}>${usd(displayBand?.low ?? band.low, 0)}</Text>
            </View>
          </Reanimated.View>
        </>
      )}

      {pts.length < 2 && (
        <Text style={styles.empty}>{loading ? 'loading chart…' : 'no price history yet'}</Text>
      )}
    </View>
  );

  if (bare) return plot;

  return (
    <View style={flush ? styles.flush : styles.card}>
      {/* No standing header. "BTC / USD · LIVE" repeated the BTC NOW row directly above it,
          and "Target $X" repeated the screen's own question. The one thing that isn't
          repeated anywhere is that the band edges can be dragged, so that hint stays, and
          only while there IS a band to drag. */}
      {band ? (
        <View style={styles.head}>
          <Text style={styles.headTarget}>Drag the edges ↕</Text>
        </View>
      ) : null}
      {plot}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.md,
    overflow: 'hidden',
  },
  flush: { paddingTop: space.md, paddingBottom: space.sm, paddingHorizontal: space.lg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: space.xs },
  headTarget: { color: colors.vermilion, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  plotFill: { flex: 1, justifyContent: 'center' },
  empty: { position: 'absolute', alignSelf: 'center', color: colors.faint, fontFamily: fonts.mono, fontSize: 11 },

  // band overlay
  bandFill: { position: 'absolute', left: 0, backgroundColor: 'rgba(224,77,38,0.12)', borderRadius: 2 },
  handle: { position: 'absolute', left: 0, height: 34, marginTop: -17, flexDirection: 'row', alignItems: 'center' },
  handleLine: { position: 'absolute', left: 0, top: 16, height: 1.5, backgroundColor: colors.vermilion, opacity: 0.9 },
  handlePill: {
    position: 'absolute', right: 0, top: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 28, paddingHorizontal: 8, borderRadius: radius.pill,
    backgroundColor: colors.vermilion,
  },
  handleGrip: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.monoBold, fontSize: 13, marginTop: -6, letterSpacing: -1 },
  handlePrice: { color: colors.white, fontFamily: fonts.monoBold, fontSize: 11, fontVariant: ['tabular-nums'] },
});

/**
 * Memoised. The bet screen re-renders once a second to tick its countdown, and this chart
 * has no interest in that: it only changes when the price series, the strike, the band or
 * the box size do. Without the boundary every countdown tick rebuilt a several-hundred-point
 * SVG path, which is felt most while dragging a band edge.
 */
export const PriceChart = memo(PriceChartInner, (a, b) =>
  a.series === b.series &&
  a.strike === b.strike &&
  a.loading === b.loading &&
  a.height === b.height &&
  a.bare === b.bare &&
  a.flush === b.flush &&
  a.areaOpacity === b.areaOpacity &&
  a.band?.low === b.band?.low &&
  a.band?.high === b.band?.high &&
  a.onBandChange === b.onBandChange &&
  a.onBandCommit === b.onBandCommit,
);
