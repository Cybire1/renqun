// The one back control for every pushed detail screen. The native transparent-header
// chevron is easy to miss and, over content that renders under the header, unreliable to
// tap — so we render our own explicit circular button wired straight to router.back()
// (falling back to home if there's no stack entry, e.g. a deep link / notification open).
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { haptic } from '../lib/motion';
import { fonts, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

export function HeaderBack() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  return (
    <Pressable
      onPressIn={() => haptic('light')}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Minimal: the glyph IS the control. A filled circle with a shadow read as a heavy blob on
  // the cream hero and crowded the eyebrow beneath it. The tap target stays a comfortable 40pt
  // via padding + hitSlop, so losing the circle costs nothing in reachability.
  btn: {
    width: 40,
    height: 40,
    marginLeft: 2, // sit on the same left margin as the screen's title
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.45 },
  chevron: { color: colors.paper, fontFamily: fonts.display, fontSize: 30, lineHeight: 34 },
});
