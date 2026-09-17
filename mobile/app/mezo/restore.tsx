// Restore a Mezo wallet from its backup key. Replaces this phone's wallet.
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/mezo/ui';
import { haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz } from '../../lib/mezo/theme';
import { shortAddr } from '../../lib/mezo/format';
import { refreshMezo } from '../../lib/mezo/hooks';
import { importMezoKey } from '../../lib/mezo/wallet';

export default function Restore() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = () => {
    Alert.alert(
      'Replace this wallet?',
      'The wallet on this phone is swapped for the one this key controls. Back up the current one first if it holds anything.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              const addr = await importMezoKey(key);
              haptic('success');
              refreshMezo();
              Alert.alert('Wallet restored', shortAddr(addr));
              router.back();
            } catch (e) {
              haptic('warning');
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.grabber} />
      <Text style={styles.title} accessibilityRole="header">
        Restore a wallet
      </Text>
      <Text style={styles.body}>Paste the backup key you saved. It starts with 0x and is 66 characters long.</Text>
      <TextInput
        value={key}
        onChangeText={(t) => {
          setKey(t);
          setError(null);
        }}
        placeholder="0x…"
        placeholderTextColor={mz.lineStrong}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        secureTextEntry
        style={styles.input}
        accessibilityLabel="Backup key"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button tone="red" label="Restore" busy={busy} disabled={key.trim().length < 64} onPress={restore} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: mz.card, padding: 24, gap: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: mz.line, marginTop: -10, marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 26, color: mz.black },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: mz.text2 },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mz.line,
    paddingHorizontal: 14,
    fontFamily: fonts.mono,
    fontSize: 13,
    color: mz.ink,
  },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink },
});
