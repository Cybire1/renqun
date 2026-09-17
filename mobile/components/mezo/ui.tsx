// Building blocks for the Mezo screens. Surfaces are lifted by a warm shadow instead of outlined,
// labels are sentence case, and monospace is kept for digits that have to line up.
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { RenqunMark } from '../RenqunMark';
import { PressableScale, type HapticKind } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { lift, liftSmall, mz, r, type } from '../../lib/mezo/theme';
import { clock, musd, usd0 } from '../../lib/mezo/format';
import { useBalances, useMezoAddress } from '../../lib/mezo/hooks';

// ─── glyphs ───

export function Tri({ dir, size = 11, color }: { dir: 'up' | 'down'; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d={dir === 'up' ? 'M6 1.5 L11.2 10.5 H0.8 Z' : 'M6 10.5 L0.8 1.5 H11.2 Z'} fill={color} />
    </Svg>
  );
}

type GlyphName = 'plus' | 'arrowDown' | 'drop' | 'copy' | 'clock' | 'check' | 'close' | 'external';
const GLYPHS: Record<GlyphName, string> = {
  plus: 'M12 5v14M5 12h14',
  arrowDown: 'M12 4v14M6 12l6 6 6-6',
  drop: 'M12 3.5c3 3.6 6 7.2 6 10.5a6 6 0 1 1-12 0c0-3.3 3-6.9 6-10.5z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  external: 'M14 5h5v5M19 5l-9 9M17 14v5H5V7h5',
};

export function Glyph({ name, size = 18, color = mz.ink, weight = 2 }: { name: GlyphName; size?: number; color?: string; weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
      <Path d={GLYPHS[name]} />
    </Svg>
  );
}

// ─── text + surfaces ───

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.label, style]}>{children}</Text>;
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.surface, style]}>{children}</View>;
}
/** Older name. */
export const Card = Surface;

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: mz.hairline, marginLeft: inset }, style]} />;
}

// ─── top bar ───

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <View style={ui.topbar}>
      <View style={ui.brand} accessibilityRole="header" accessibilityLabel="Renqun on Mezo">
        <RenqunMark size={26} ink={mz.ink} dot={mz.red} />
        <Text style={ui.wordmark}>Renqun</Text>
      </View>
      {right ?? <BalancePill />}
    </View>
  );
}

export function BalancePill() {
  const router = useRouter();
  const addr = useMezoAddress();
  const { data } = useBalances(addr);
  return (
    <PressableScale
      haptic="light"
      onPress={() => router.navigate('/(tabs)/wallet')}
      accessibilityRole="button"
      accessibilityLabel={`Balance ${data ? musd(data.musd) : 'loading'} MUSD. Open wallet.`}
      style={ui.pill}
    >
      <Text style={ui.pillValue}>{data ? musd(data.musd) : '—'}</Text>
      <Text style={ui.pillUnit}>MUSD</Text>
      <View style={ui.pillPlus}>
        <Glyph name="plus" size={12} color={mz.onRed} weight={2.6} />
      </View>
    </PressableScale>
  );
}

// ─── controls ───

type Tone = 'red' | 'green' | 'ink' | 'white' | 'soft' | 'muted';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  red: { bg: mz.red, fg: mz.onRed },
  green: { bg: mz.green, fg: mz.onGreen },
  ink: { bg: mz.ink, fg: mz.onInk },
  white: { bg: mz.card, fg: mz.ink },
  soft: { bg: mz.sandDeep, fg: mz.ink },
  muted: { bg: mz.sandDeep, fg: mz.text3 },
};

export function Button({
  label,
  onPress,
  tone = 'red',
  busy = false,
  disabled = false,
  height = 56,
  radius = r.control,
  icon,
  haptic = 'medium',
  style,
  textStyle,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
  height?: number;
  radius?: number;
  icon?: ReactNode;
  haptic?: HapticKind;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const t = TONES[disabled ? 'muted' : tone];
  return (
    <PressableScale
      haptic={disabled || busy ? 'none' : haptic}
      onPress={() => {
        if (!disabled && !busy) onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={[ui.button, { height, borderRadius: radius, backgroundColor: t.bg }, tone === 'white' && !disabled && liftSmall, style]}
    >
      {busy ? <ActivityIndicator color={t.fg} /> : icon}
      <Text style={[ui.buttonText, { color: t.fg }, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** A pill track with a lifted white thumb. */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  style,
  height = 40,
}: {
  items: SegmentItem<K>[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  return (
    <View style={[ui.segTrack, style]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <PressableScale
            key={it.key}
            haptic="light"
            scaleTo={0.97}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.key)}
            style={[ui.segItem, { height }, on && ui.segItemOn]}
          >
            <Text style={[ui.segText, on && ui.segTextOn]}>
              {it.label}
              {it.count != null ? <Text style={ui.segCount}>{`  ${it.count}`}</Text> : null}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function Pill({ text, fg, bg, icon, style }: { text: string; fg: string; bg: string; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[ui.chip, { backgroundColor: bg }, style]}>
      {icon}
      <Text style={[ui.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** Rounded square carrying a bet's direction. */
export function SideTile({ side, size = 38 }: { side: 'up' | 'down' | 'range'; size?: number }) {
  if (side === 'range') {
    return (
      <View style={[ui.tile, { width: size, height: size, backgroundColor: mz.redTint }]}>
        <View style={{ width: size * 0.42, height: size * 0.3, borderLeftWidth: 2, borderRightWidth: 2, borderColor: mz.red, backgroundColor: mz.redBand }} />
      </View>
    );
  }
  return (
    <View style={[ui.tile, { width: size, height: size, backgroundColor: side === 'up' ? mz.upSoft : mz.downSoft }]}>
      <Tri dir={side} size={size * 0.32} color={side === 'up' ? mz.greenText : mz.downText} />
    </View>
  );
}

/** Time left in a round. Turns red for the last half minute. */
export function Countdown({ msLeft, size = 'md' }: { msLeft: number; size?: 'md' | 'lg' }) {
  const late = msLeft > 0 && msLeft < 30_000;
  return (
    <View
      style={[ui.countdown, size === 'lg' && ui.countdownLg, { backgroundColor: late ? mz.red : mz.sandDeep }]}
      accessibilityLabel={`${clock(msLeft)} left`}
    >
      <Glyph name="clock" size={size === 'lg' ? 15 : 13} color={late ? mz.onRed : mz.ink} weight={2.2} />
      <Text style={[ui.countdownText, size === 'lg' && { fontSize: 15 }, { color: late ? mz.onRed : mz.ink }]}>{clock(msLeft)}</Text>
    </View>
  );
}

/** A dollar price that ticks: a short flash (green up, ink down) and a small nudge on change. */
export function Ticker({ value, style }: { value: number | null; style?: StyleProp<TextStyle> }) {
  const prev = useRef<number | null>(null);
  const flash = useSharedValue(0); // -1 down, +1 up, 0 rest
  const nudge = useSharedValue(0);
  useEffect(() => {
    if (value == null) return;
    const p = prev.current;
    prev.current = value;
    if (p == null || Math.round(p) === Math.round(value)) return;
    const dir = value > p ? 1 : -1;
    flash.value = withSequence(withTiming(dir, { duration: 90 }), withTiming(0, { duration: 700 }));
    nudge.value = withSequence(withTiming(dir * -3, { duration: 90 }), withTiming(0, { duration: 260 }));
  }, [value, flash, nudge]);
  const a = useAnimatedStyle(() => ({
    color: interpolateColor(flash.value, [-1, 0, 1], [mz.text2, mz.black, mz.greenText]),
    transform: [{ translateY: nudge.value }],
  }));
  return <Animated.Text style={[style, a]}>{value == null ? '—' : usd0(value)}</Animated.Text>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={ui.empty}>
      <View style={ui.emptyMark}>
        <RenqunMark size={34} ink={mz.ink} dot={mz.red} />
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.body, { textAlign: 'center', maxWidth: 290, fontSize: 14 }]}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 6, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  surface: { backgroundColor: mz.card, borderRadius: r.surface, ...lift },

  topbar: { height: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.5, color: mz.black },
  pill: {
    height: 36,
    paddingLeft: 14,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: mz.card,
    ...liftSmall,
  },
  pillValue: { fontFamily: fonts.monoBold, fontSize: 13, color: mz.ink, fontVariant: ['tabular-nums'] },
  pillUnit: { fontFamily: fonts.bodyMed, fontSize: 12, color: mz.text3, marginRight: 4 },
  pillPlus: { width: 28, height: 28, borderRadius: 14, backgroundColor: mz.red, alignItems: 'center', justifyContent: 'center' },

  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 16, letterSpacing: -0.1 },

  segTrack: { flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: mz.sandDeep },
  segItem: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  segItemOn: { backgroundColor: mz.card, ...liftSmall },
  segText: { fontFamily: fonts.bodyMed, fontSize: 14, color: mz.text2 },
  segTextOn: { fontFamily: fonts.bodySemi, color: mz.ink },
  segCount: { fontFamily: fonts.mono, fontSize: 12, color: mz.text3 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, height: 26, borderRadius: 999 },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13 },

  tile: { borderRadius: r.tile, alignItems: 'center', justifyContent: 'center' },

  countdown: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 999 },
  countdownLg: { height: 36, paddingHorizontal: 12 },
  countdownText: { fontFamily: fonts.monoBold, fontSize: 13, fontVariant: ['tabular-nums'] },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 36, paddingHorizontal: 24 },
  emptyMark: { width: 72, height: 72, borderRadius: 36, backgroundColor: mz.sandDeep, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
