// Shared motion + tactility primitives for THE BELL. The award-winning layer:
// every tappable surface springs + fires a haptic, content rises in on mount, and
// the "live" indicators breathe. Built on react-native-reanimated + expo-haptics.
import { ReactNode, useEffect } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { mz } from './mezo/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'none';

/** Fire a haptic (no-op on failure / web). Use 'success' on a confirmed trade. */
export function haptic(kind: HapticKind = 'light') {
  try {
    if (kind === 'none') return;
    if (kind === 'success') return void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (kind === 'warning') return void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const map = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    } as const;
    void Haptics.impactAsync(map[kind]);
  } catch {
    /* haptics unavailable (web / older sim) — ignore */
  }
}

type ScaleProps = Omit<PressableProps, 'style'> & {
  haptic?: HapticKind;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Tappable surface that springs down + fires a haptic on press — the core micro-interaction. */
export function PressableScale({ onPress, haptic: h = 'light', scaleTo = 0.965, style, children, ...rest }: ScaleProps) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => {
        s.value = withSpring(scaleTo, { damping: 18, stiffness: 420 });
      }}
      onPressOut={() => {
        s.value = withSpring(1, { damping: 15, stiffness: 320 });
      }}
      onPress={(e) => {
        haptic(h);
        onPress?.(e);
      }}
      style={[style, a]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Staggered entrance — content fades + rises in. Pass `index` for a cascade down a list. */
export function Appear({
  index = 0,
  delay = 0,
  children,
  style,
  accessible,
  accessibilityLabel,
}: {
  index?: number;
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessible?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay + index * 55).duration(380)}
      style={style}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Animated.View>
  );
}

/** A softly breathing dot — the "live" indicator (green by default; vermilion when urgent). */
export function LiveDot({ color = mz.green, size = 6 }: { color?: string; size?: number }) {
  const o = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.25, { duration: 950, easing: Easing.inOut(Easing.ease) }), -1, true);
    scale.value = withRepeat(withTiming(1.35, { duration: 950, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o, scale]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, a]} />;
}

export { Animated, FadeIn, FadeInDown };
