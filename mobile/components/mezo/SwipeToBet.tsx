// Swipe-to-bet in the Mezo skin (canvas: "Mobile · Ticket"). A pill track tinted by side, a round
// thumb with an arrow, and the label centred past the thumb. Same gesture model as
// lib/SwipeToConfirm: RN PanResponder + RN Animated on the JS thread, so the thumb tracks the finger.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz } from '../../lib/mezo/theme';

const H = 54;
const THUMB = 44;
const PAD = 5;

export type SwipeTone = 'green' | 'ink' | 'red';

const TONE: Record<SwipeTone, { track: string; edge: string; thumb: string; glyph: string; label: string }> = {
  green: { track: mz.upSoft, edge: mz.upLine, thumb: mz.upThumb, glyph: mz.onGreen, label: mz.greenText },
  ink: { track: mz.downSoft, edge: mz.downLine, thumb: mz.downThumb, glyph: mz.onInk, label: mz.downText },
  red: { track: mz.redTint, edge: mz.red, thumb: mz.red, glyph: mz.onRed, label: mz.ink },
};

export function SwipeToBet({
  label,
  busyLabel = 'Placing…',
  tone,
  busy = false,
  disabled = false,
  onConfirm,
}: {
  label: string;
  busyLabel?: string;
  tone: SwipeTone;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const [trackW, setTrackW] = useState(0);
  const maxXRef = useRef(0);
  const stateRef = useRef({ busy, disabled, onConfirm });
  stateRef.current = { busy, disabled, onConfirm };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackW(w);
    maxXRef.current = Math.max(0, w - THUMB - PAD * 2);
  };

  useEffect(() => {
    if (!busy) Animated.spring(x, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
  }, [busy, x]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !stateRef.current.busy && !stateRef.current.disabled,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !stateRef.current.busy && !stateRef.current.disabled && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 2,
      onStartShouldSetPanResponder: () => !stateRef.current.busy && !stateRef.current.disabled,
      onMoveShouldSetPanResponder: (_, g) => !stateRef.current.busy && !stateRef.current.disabled && Math.abs(g.dx) > 2,
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), maxXRef.current)),
      onPanResponderRelease: (_, g) => {
        const maxX = maxXRef.current;
        const nx = Math.min(Math.max(0, g.dx), maxX);
        if (maxX > 0 && nx >= maxX * 0.82) {
          Animated.timing(x, { toValue: maxX, duration: 110, useNativeDriver: false }).start();
          haptic('success');
          stateRef.current.onConfirm();
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, speed: 16, bounciness: 8 }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false, speed: 16, bounciness: 8 }).start(),
    }),
  ).current;

  const t = TONE[tone];
  const maxX = Math.max(1, trackW - THUMB - PAD * 2);
  const fill = Animated.add(x, THUMB + PAD * 2);
  const labelOpacity = x.interpolate({ inputRange: [0, maxX * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const off = disabled && !busy;

  return (
    <View
      style={[styles.track, { backgroundColor: off ? mz.well : t.track, borderColor: off ? mz.line : t.edge }]}
      onLayout={onLayout}
      accessible
      accessibilityRole="button"
      accessibilityLabel={busy ? busyLabel : label}
      accessibilityHint="Swipe right to confirm. With VoiceOver, double tap."
      accessibilityState={{ disabled: disabled || busy, busy }}
      // VoiceOver users cannot drag; a double tap confirms for them.
      onAccessibilityTap={() => {
        if (!disabled && !busy) {
          AccessibilityInfo.announceForAccessibility('Placing bet');
          onConfirm();
        }
      }}
      {...pan.panHandlers}
    >
      <Animated.View style={[styles.fill, { width: fill, backgroundColor: off ? 'transparent' : t.track }]} pointerEvents="none" />
      <Animated.Text
        style={[styles.label, { color: off ? mz.text3 : t.label, opacity: busy ? 1 : labelOpacity }]}
        pointerEvents="none"
        numberOfLines={1}
      >
        {busy ? busyLabel : label}
      </Animated.Text>
      <Animated.View
        style={[styles.thumb, { backgroundColor: off ? mz.lineStrong : t.thumb, transform: [{ translateX: x }] }]}
        pointerEvents="none"
      >
        {busy ? (
          <ActivityIndicator color={t.glyph} />
        ) : (
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={off ? mz.card : t.glyph} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12h14M13 6l6 6-6 6" />
          </Svg>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: H, borderRadius: 999, borderWidth: 1, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999 },
  label: { textAlign: 'center', paddingLeft: THUMB, paddingRight: 12, fontFamily: fonts.displaySemi, fontSize: 15 },
  thumb: {
    position: 'absolute',
    left: PAD - 1,
    top: PAD - 1,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
