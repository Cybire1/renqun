import '../lib/polyfills';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderBack } from '../components/HeaderBack';
import { AppLock } from '../components/AppLock';
import { LaunchScreen } from '../components/LaunchScreen';
import { RenqunMark } from '../components/RenqunMark';
import { Button } from '../components/mezo/ui';
import { fonts } from '../lib/theme';
import { ThemeProvider } from '../lib/themeContext';
import { primeMezoWallet } from '../lib/mezo/wallet';
import { mz, type } from '../lib/mezo/theme';

// Honor iOS Dynamic Type, capped at 1.3x so the dense numeric layouts (dock, countdowns) hold.
const TextWithDefaults = Text as unknown as { defaultProps?: Record<string, unknown> };
TextWithDefaults.defaultProps = {
  ...(TextWithDefaults.defaultProps ?? {}),
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.3,
};

// Keep the native splash up until fonts and the device wallet are ready, so the first frame is
// the real Markets screen. Key generation is local and instant; the starter drip runs after.
SplashScreen.preventAutoHideAsync().catch(() => {});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.fallback}>
      <RenqunMark size={44} />
      <Text accessibilityRole="header" style={styles.fallbackTitle}>
        This screen hit a problem.
      </Text>
      <Text style={type.body}>Your wallet and bets are safe on Mezo. Retrying only reloads this screen.</Text>
      <Text numberOfLines={3} style={styles.errorText}>
        {error.message}
      </Text>
      <Button tone="red" label="Retry" onPress={() => void retry()} />
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });
  const [walletReady, setWalletReady] = useState(false);
  // The animated launch plays once over the native-splash handoff, then reveals the app.
  const [launchDone, setLaunchDone] = useState(false);
  useEffect(() => {
    primeMezoWallet()
      .catch(() => {})
      .finally(() => setWalletReady(true));
  }, []);

  const ready = loaded && walletReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null; // native splash stays visible

  // Bottom sheets for the bet ticket and Add MUSD size to their content.
  const SHEET = {
    presentation: 'formSheet' as const,
    sheetAllowedDetents: 'fitToContents' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    headerShown: false,
    contentStyle: { backgroundColor: mz.card },
  };
  const MODAL = { presentation: 'modal' as const, headerShown: false, contentStyle: { backgroundColor: mz.card } };

  return (
    <ThemeProvider>
      <StatusBar style="dark" />
      <AppLock>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: mz.sand },
            headerTintColor: mz.ink,
            headerTitleStyle: { fontFamily: fonts.displaySemi, fontSize: 16 },
            headerShadowVisible: false,
            headerBackTitle: '',
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: mz.sand },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
          <Stack.Screen
            name="set-pin"
            options={{
              title: '',
              headerTransparent: true,
              headerStyle: { backgroundColor: 'transparent' },
              headerLeft: () => <HeaderBack />,
              headerBackVisible: false,
            }}
          />
          <Stack.Screen name="mezo/bet" options={SHEET} />
          <Stack.Screen name="mezo/fund" options={SHEET} />
          <Stack.Screen name="mezo/welcome" options={MODAL} />
          <Stack.Screen name="mezo/restore" options={MODAL} />
        </Stack>
      </AppLock>
      {!launchDone && <LaunchScreen onDone={() => setLaunchDone(true)} />}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: 'center', gap: 16, padding: 24, backgroundColor: mz.sand },
  fallbackTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 35, letterSpacing: -0.6, color: mz.black },
  errorText: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: mz.text3 },
});
