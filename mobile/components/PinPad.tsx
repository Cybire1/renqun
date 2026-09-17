// Reusable numeric PIN pad — dots + 10-key grid, theme-aware, with a shake on a wrong
// code. Controlled: the parent owns `value` and reacts when it reaches `length`. An
// optional Face ID key sits in the bottom-left slot on the unlock screen.
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Icon } from './Icon';
import { PressableScale, haptic } from '../lib/motion';
import { fonts, radius, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({
  value,
  onChange,
  length = 6,
  error = false,
  disabled = false,
  onBiometric,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
  onBiometric?: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (error) {
      haptic('warning');
      shake.value = withSequence(
        withTiming(-9, { duration: 45 }),
        withTiming(9, { duration: 45 }),
        withTiming(-6, { duration: 45 }),
        withTiming(6, { duration: 45 }),
        withTiming(0, { duration: 45 }),
      );
    }
  }, [error, shake]);

  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const press = (d: string) => {
    if (disabled || value.length >= length) return;
    haptic('light');
    onChange(value + d);
  };
  const del = () => {
    if (disabled || !value.length) return;
    haptic('light');
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dots, dotsStyle]}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && styles.dotOn,
              error && styles.dotErr,
            ]}
          />
        ))}
      </Animated.View>

      <View style={styles.grid}>
        {KEYS.map((k) => (
          <PressableScale key={k} style={styles.key} onPress={() => press(k)} accessibilityRole="button" accessibilityLabel={k}>
            <Text style={styles.keyText}>{k}</Text>
          </PressableScale>
        ))}
        {/* bottom-left: Face ID (unlock) or empty (setup) */}
        {onBiometric ? (
          <PressableScale style={styles.key} onPress={onBiometric} accessibilityRole="button" accessibilityLabel="Use Face ID">
            <Icon name="shield" color={colors.paperDim} size={24} />
          </PressableScale>
        ) : (
          <View style={styles.key} />
        )}
        <PressableScale style={styles.key} onPress={() => press('0')} accessibilityRole="button" accessibilityLabel="0">
          <Text style={styles.keyText}>0</Text>
        </PressableScale>
        <PressableScale style={styles.key} onPress={del} accessibilityRole="button" accessibilityLabel="Delete">
          <Text style={styles.keyDel}>⌫</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', gap: space.xxl },
    dots: { flexDirection: 'row', gap: 16, height: 16, alignItems: 'center' },
    dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: c.muted },
    dotOn: { backgroundColor: c.paper, borderColor: c.paper },
    dotErr: { borderColor: c.down },
    grid: { width: 300, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
    key: {
      width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    },
    keyText: { color: c.paper, fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.5 },
    keyDel: { color: c.paperDim, fontFamily: fonts.body, fontSize: 26 },
  });
}
