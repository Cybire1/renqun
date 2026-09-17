// A modal that re-verifies the app PIN for a sensitive action (reveal recovery key,
// turn the lock off) on devices with no biometrics. Resolves true on the correct PIN,
// false on cancel. Used by Settings' reauth() fallback when Face ID isn't available.
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { PinPad } from './PinPad';
import { PressableScale } from '../lib/motion';
import { verifyPin, PIN_LENGTH } from '../lib/lock';
import { fonts, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

export function PinPrompt({
  visible,
  reason,
  onResult,
}: {
  visible: boolean;
  reason: string;
  onResult: (ok: boolean) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => { if (visible) { setPin(''); setErr(false); } }, [visible]);

  useEffect(() => {
    if (!visible || pin.length < PIN_LENGTH) return;
    let alive = true;
    verifyPin(pin).then((ok) => {
      if (!alive) return;
      if (ok) onResult(true);
      else { setErr(true); setTimeout(() => { setPin(''); setErr(false); }, 450); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onResult(false)}>
      <View style={styles.screen}>
        <Text style={styles.title}>Enter your PIN</Text>
        <Text style={[styles.sub, err && { color: colors.down }]}>{err ? 'Incorrect PIN — try again' : reason}</Text>
        <View style={styles.pad}>
          <PinPad value={pin} onChange={setPin} error={err} length={PIN_LENGTH} />
        </View>
        <PressableScale haptic="light" onPress={() => onResult(false)} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </PressableScale>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: space.xl },
    title: { color: colors.paper, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.8, textAlign: 'center' },
    sub: { color: colors.paperDim, fontFamily: fonts.body, fontSize: 14, marginTop: space.sm, textAlign: 'center' },
    pad: { marginTop: space.xxl },
    cancel: { marginTop: space.xl, padding: space.sm },
    cancelText: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 15 },
  });
}
