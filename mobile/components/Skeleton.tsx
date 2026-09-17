// Shimmer skeletons — shown for structured content while it loads (markets, positions,
// leaderboard). Skeletons read ~20% faster than spinners and avoid the "blank = frozen"
// feel. First component of the shared components/ layer.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

export function Skeleton({
  height = 14,
  width = '100%',
  radius: r = radius.sm,
  style,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: colors.cardHi }, a, style]} />;
}

/** Placeholder matching a live market card's shape (no layout shift when data lands). */
export function MarketCardSkeleton() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton height={11} width={96} />
        <Skeleton height={11} width={52} />
      </View>
      <Skeleton height={17} width="68%" style={{ marginTop: space.md }} />
      <Skeleton height={26} width={148} style={{ marginTop: space.sm }} />
      <View style={[styles.row, { marginTop: space.lg, gap: space.sm }]}>
        <Skeleton height={46} width="48%" radius={radius.sm} />
        <Skeleton height={46} width="48%" radius={radius.sm} />
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
