// Create / change the app PIN — enter a 6-digit code, then confirm it. Reached from
// Settings → Security. Saves to the Keychain-backed store (lib/lock) and returns.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PinPad } from '../components/PinPad';
import { setPin as savePin, PIN_LENGTH } from '../lib/lock';
import { haptic } from '../lib/motion';
import { fonts, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

export default function SetPin() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (pin.length < PIN_LENGTH) return;
    if (step === 'create') {
      setFirst(pin);
      setStep('confirm');
      setPin('');
    } else if (pin === first) {
      savePin(pin)
        .then(() => { haptic('success'); router.back(); })
        .catch(() => {});
    } else {
      setErr(true);
      setTimeout(() => { setPin(''); setErr(false); setFirst(''); setStep('create'); }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, step]);

  const title = step === 'create' ? 'Create a PIN' : 'Confirm your PIN';
  const sub = err
    ? 'PINs didn’t match — start again'
    : step === 'create'
      ? 'Pick a 6-digit code to unlock Renqun.'
      : 'Enter it once more to confirm.';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.body}>
        <Text style={styles.eyebrow}>APP PIN</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.sub, err && { color: colors.down }]}>{sub}</Text>
        <View style={styles.pad}>
          <PinPad value={pin} onChange={setPin} error={err} length={PIN_LENGTH} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.ink },
    body: { flex: 1, alignItems: 'center', paddingTop: 110, paddingHorizontal: space.xl },
    eyebrow: { color: colors.vermilion, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2.5, marginBottom: space.sm },
    title: { color: colors.paper, fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.8, textAlign: 'center' },
    sub: { color: colors.paperDim, fontFamily: fonts.body, fontSize: 14, marginTop: space.sm, textAlign: 'center' },
    pad: { marginTop: 44 },
  });
}
