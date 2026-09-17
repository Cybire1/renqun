import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { PressableScale } from '../lib/motion';
import { fonts, radius, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

export default function NotFound() {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.mark}>
        <Icon name="markets" color={colors.paperDim} size={36} />
      </View>
      <Text style={styles.eyebrow}>YOSUKU / PAGE NOT FOUND</Text>
      <Text accessibilityRole="header" style={styles.title}>
        This market is off the board.
      </Text>
      <Text style={styles.copy}>
        The link is stale or the page moved. Return to the live markets and pick an active BTC round.
      </Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Open live markets"
        haptic="medium"
        style={styles.button}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.buttonText}>Open Markets</Text>
      </PressableScale>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.ink,
    padding: space.xl,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(224,77,38,0.30)',
    backgroundColor: 'rgba(224,77,38,0.08)',
    marginBottom: space.xl,
  },
  eyebrow: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: space.md,
  },
  title: {
    color: colors.paper,
    fontFamily: fonts.display,
    fontSize: 35,
    lineHeight: 37,
    letterSpacing: -1.2,
    maxWidth: 430,
  },
  copy: {
    color: colors.paperDim,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: space.md,
    maxWidth: 430,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    marginTop: space.xl,
  },
  buttonText: {
    color: colors.ink,
    fontFamily: fonts.displaySemi,
    fontSize: 15,
    letterSpacing: -0.4,
    lineHeight: 18,
  },
});
