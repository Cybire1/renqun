// Settings on Mezo: security (app lock, PIN), the wallet's backup key, restore and reset, and what
// this build is connected to.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPrompt } from '../PinPrompt';
import { PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { authenticate, canUseAppLock, hasPin, isAppLockEnabled, setAppLockEnabled } from '../../lib/lock';
import { mz, type } from '../../lib/mezo/theme';
import { shortAddr } from '../../lib/mezo/format';
import { MEZO, explorerAddress } from '../../lib/mezo/network';
import { refreshMezo, useMezoAddress } from '../../lib/mezo/hooks';
import { exportMezoKey, resetMezoWallet } from '../../lib/mezo/wallet';
import { Card, Label, TopBar } from './ui';

export function MezoSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addr = useMezoAddress();
  const [lockAvail, setLockAvail] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [pinPrompt, setPinPrompt] = useState<{ reason: string; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    canUseAppLock().then(setLockAvail);
    isAppLockEnabled().then(setLockOn);
  }, []);
  useFocusEffect(
    useCallback(() => {
      hasPin().then(setPinSet);
      return () => setKey(null); // never leave the key on screen after navigating away
    }, []),
  );

  // Face ID when the phone has it, else the app PIN, else nothing to check.
  const reauth = (reason: string): Promise<boolean> => {
    if (lockAvail) return authenticate(reason);
    if (pinSet) return new Promise((resolve) => setPinPrompt({ reason, resolve }));
    return Promise.resolve(true);
  };

  const toggleLock = async (next: boolean) => {
    if (next && !lockAvail && !pinSet) {
      Alert.alert('Set a PIN first', 'Create a PIN so you can unlock the app.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Set PIN', onPress: () => router.push('/set-pin') },
      ]);
      return;
    }
    if (!(await reauth(next ? 'Turn on app lock' : 'Turn off app lock'))) return;
    await setAppLockEnabled(next);
    setLockOn(next);
    haptic('success');
  };

  const reveal = async () => {
    if (key) {
      setKey(null);
      return;
    }
    if (!(await reauth('Show your backup key'))) return;
    setKey(await exportMezoKey());
    haptic('light');
  };

  const reset = () =>
    Alert.alert(
      'Reset this wallet?',
      'The wallet is removed from this phone and a new, empty one is made. Anything in it is gone unless you saved the backup key.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!(await reauth('Reset your wallet'))) return;
            await resetMezoWallet();
            setKey(null);
            refreshMezo();
            haptic('success');
          },
        },
      ],
    );

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 130, gap: 8 }} showsVerticalScrollIndicator={false}>
        <Text style={[type.title, { marginTop: 6 }]} accessibilityRole="header">
          Settings
        </Text>

        <Label style={styles.section}>Security</Label>
        <Card>
          {Platform.OS !== 'web' ? (
            <Row title="App lock" sub={lockAvail ? 'Face ID or passcode when you open Renqun' : 'Your PIN when you open Renqun'}>
              <Switch value={lockOn} onValueChange={toggleLock} trackColor={{ true: mz.red, false: mz.line }} thumbColor={mz.card} ios_backgroundColor={mz.line} />
            </Row>
          ) : null}
          <Divider />
          <Row title={pinSet ? 'Change PIN' : 'Set a PIN'} sub="A 6-digit fallback unlock" onPress={() => router.push('/set-pin')} chevron />
        </Card>

        <Label style={styles.section}>Wallet</Label>
        <Card>
          <Row
            title="Address"
            sub={addr ? shortAddr(addr) : '…'}
            onPress={async () => {
              if (!addr) return;
              await Clipboard.setStringAsync(addr);
              haptic('success');
            }}
            trailing="Copy"
          />
          <Divider />
          <Row title={key ? 'Hide backup key' : 'Show backup key'} sub="The only way to recover this wallet" onPress={reveal} chevron={!key} />
          {key ? (
            <View style={styles.keyBox}>
              <Text style={styles.warn}>Anyone with this key controls your funds. Never share it or paste it into a website.</Text>
              <Text selectable style={styles.key}>
                {key}
              </Text>
              <PressableScale
                haptic="none"
                onPress={async () => {
                  await Clipboard.setStringAsync(key);
                  haptic('success');
                }}
                accessibilityRole="button"
                style={styles.copyKey}
              >
                <Text style={styles.copyKeyText}>Copy key</Text>
              </PressableScale>
            </View>
          ) : null}
          <Divider />
          <Row title="Restore from a backup key" onPress={() => router.push('/mezo/restore')} chevron />
          <Divider />
          <Row title="Reset wallet" sub="Remove it from this phone" onPress={reset} danger />
        </Card>

        <Label style={styles.section}>About</Label>
        <Card>
          <Row title="Network" sub={`Mezo ${MEZO.network} · chain ${MEZO.chainId}`} />
          <Divider />
          {MEZO.predict ? (
            <Row title="Betting contract" sub={shortAddr(MEZO.predict)} onPress={() => Linking.openURL(explorerAddress(MEZO.predict))} trailing="Explorer" />
          ) : null}
          <Divider />
          <Row title="Settlement" sub="Mezo’s BTC/USD oracle, printed every block" />
        </Card>
        <Text style={styles.footer}>Renqun {version} · Mezo {MEZO.network}</Text>
      </ScrollView>
      <PinPrompt
        visible={!!pinPrompt}
        reason={pinPrompt?.reason ?? ''}
        onResult={(ok) => {
          pinPrompt?.resolve(ok);
          setPinPrompt(null);
        }}
      />
    </View>
  );
}

function Row({
  title,
  sub,
  onPress,
  chevron,
  trailing,
  danger,
  children,
}: {
  title: string;
  sub?: string;
  onPress?: () => void;
  chevron?: boolean;
  trailing?: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: mz.ink, textDecorationLine: 'underline', textDecorationColor: mz.red }]}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {children}
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
      {chevron ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <PressableScale haptic="light" onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </PressableScale>
  );
}

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mz.sand },
  section: { marginTop: 20, marginBottom: 6, marginLeft: 4 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: mz.ink },
  rowSub: { ...type.small, marginTop: 2 },
  trailing: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink },
  chevron: { fontFamily: fonts.displaySemi, fontSize: 20, color: mz.text3 },
  divider: { height: 1, backgroundColor: mz.lineSoft, marginLeft: 16 },
  keyBox: { marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 14, backgroundColor: mz.sandDeep, gap: 10 },
  warn: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 17, color: mz.ink },
  key: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 18, color: mz.ink },
  copyKey: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  copyKeyText: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink, textDecorationLine: 'underline', textDecorationColor: mz.red },
  footer: { ...type.small, marginTop: 24, textAlign: 'center' },
});
