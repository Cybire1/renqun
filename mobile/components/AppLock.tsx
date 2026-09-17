// App-lock gate: when enabled, covers the whole app with a branded lock screen and
// requires Face ID (or the app PIN) to continue.
//
// Session management: the app doesn't blindly re-lock on every switch-away. It stamps
// the time it went to the background and, on return, only re-locks if more than the
// user's chosen auto-lock window has elapsed. "Immediately" (0ms) locks every time. On
// leaving it also drops a privacy cover so the app-switcher snapshot never shows content,
// and it re-reads prefs live (so toggling the lock in Settings takes effect immediately).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { PinPad } from './PinPad';
import { RenqunMark } from './RenqunMark';
import { PressableScale } from '../lib/motion';
import {
  authenticate,
  canUseAppLock,
  getAutoLockMs,
  hasPin,
  inTrustedInterruption,
  isAppLockEnabled,
  onLockPrefsChanged,
  verifyPin,
  PIN_LENGTH,
} from '../lib/lock';
import { fonts, radius, space, type Palette } from '../lib/theme';
import { useColors } from '../lib/themeContext';

/** Shadows are LIFT, not light. A vermilion shadow on cream reads as a halo around
 *  the element instead of a shadow beneath it — the "glow" the founder kept flagging.
 *  A warm near-black keeps the depth and drops the glow; it sits fine on ink too, where
 *  a coloured shadow was invisible anyway. */
const SHADOW_INK = '#2A190D';

type Method = 'bio' | 'pin';
const THROTTLE_AFTER = 5; // wrong PIN attempts before a cooldown kicks in

/**
 * The locked mark: the brand figure, alone, breathing slowly. No ring, no tile, no disc
 * behind it. The figure with its arms up IS the brand and it carries the screen on its own;
 * anything drawn around it just made it look like a generic app icon in a badge. Holds
 * still under reduced-motion.
 */
function LockedMark({ colors }: { colors: Palette }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const breath = useSharedValue(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setStill(!!r));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (still) return;
    breath.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [still, breath]);

  const alive = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.035 }],
    opacity: 0.86 + breath.value * 0.14,
  }));

  return (
    <Animated.View style={[styles.markStage, alive]}>
      <RenqunMark size={96} />
    </Animated.View>
  );
}

export function AppLock({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false); // privacy cover (no auth) while away
  const [canBio, setCanBio] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [method, setMethod] = useState<Method>('bio');
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  const enabledRef = useRef(false);
  const autoLockRef = useRef(0);
  const bgAt = useRef<number | null>(null);
  const authing = useRef(false);
  const bioTried = useRef(false);

  const loadPrefs = useCallback(async () => {
    const [e, ms, bio, hp] = await Promise.all([
      isAppLockEnabled(), getAutoLockMs(), canUseAppLock(), hasPin(),
    ]);
    enabledRef.current = e;
    autoLockRef.current = ms;
    setEnabled(e);
    setCanBio(bio);
    setPinSet(hp);
    setPrefsLoaded(true);
    if (!e) { setLocked(false); setCovered(false); } // disabling clears any gate
  }, []);

  // Initial load locks immediately if enabled; later loads (Settings changed, or return
  // from background) only refresh refs so the NEXT session boundary applies the change.
  useEffect(() => {
    (async () => { await loadPrefs(); if (enabledRef.current) setLocked(true); })();
    return onLockPrefsChanged(() => { void loadPrefs(); });
  }, [loadPrefs]);

  // Session grace + privacy cover.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (!enabledRef.current) return;
      if (s === 'inactive' || s === 'background') {
        if (!inTrustedInterruption()) {
          setCovered(true);
          if (bgAt.current == null) bgAt.current = Date.now();
        }
      } else if (s === 'active') {
        setCovered(false);
        const since = bgAt.current;
        bgAt.current = null;
        if (!inTrustedInterruption() && since != null && Date.now() - since >= autoLockRef.current) {
          setLocked(true);
        }
        void loadPrefs();
      }
    });
    return () => sub.remove();
  }, [loadPrefs]);

  // When the lock appears, pick a method and (for bio) auto-prompt once. Fail open only
  // if there's genuinely no method, so the user can never be hard locked out.
  useEffect(() => {
    if (!locked) { bioTried.current = false; return; }
    if (!canBio && !pinSet) { setLocked(false); return; }
    const m: Method = canBio ? 'bio' : 'pin';
    setMethod(m);
    setPin('');
    setPinErr(false);
    if (m === 'bio' && !bioTried.current) {
      bioTried.current = true;
      void tryBio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, canBio, pinSet]);

  // Tick a clock while a PIN cooldown is active, so the countdown updates + auto-clears.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const cooldownLeft = Math.max(0, cooldownUntil - Math.max(nowTick, Date.now()));

  const unlock = () => {
    setLocked(false);
    setPin('');
    setPinErr(false);
    setAttempts(0);
    setCooldownUntil(0);
    bgAt.current = null;
  };

  const tryBio = async () => {
    if (authing.current) return;
    authing.current = true;
    const ok = await authenticate('Unlock Renqun');
    authing.current = false;
    if (ok) unlock();
    else if (pinSet) setMethod('pin');
  };

  // Verify the PIN the moment it's complete (unless throttled).
  useEffect(() => {
    if (method !== 'pin' || pin.length < PIN_LENGTH) return;
    if (cooldownLeft > 0) { setPin(''); return; }
    let alive = true;
    verifyPin(pin).then((ok) => {
      if (!alive) return;
      if (ok) { unlock(); return; }
      const na = attempts + 1;
      setAttempts(na);
      if (na % THROTTLE_AFTER === 0) {
        const step = na / THROTTLE_AFTER; // 1, 2, 3…
        setCooldownUntil(Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (step - 1)));
      }
      setPinErr(true);
      setTimeout(() => { setPin(''); setPinErr(false); }, 450);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, method]);

  const showAuth = enabled && locked;
  const showCover = !prefsLoaded || (enabled && covered && !locked);

  const pinSub = cooldownLeft > 0
    ? `Too many attempts — try again in ${Math.ceil(cooldownLeft / 1000)}s`
    : pinErr
      ? 'Incorrect PIN — try again'
      : 'Enter your 6-digit code to unlock.';

  return (
    <View style={{ flex: 1 }}>
      {children}

      {showCover && (
        <View style={styles.overlay}>
          <RenqunMark size={44} />
        </View>
      )}

      {showAuth && (
        <View style={styles.overlay}>
          {method === 'pin' ? (
            <View style={styles.wrap}>
              <View style={styles.markSm}><RenqunMark size={36} /></View>
              <Text style={styles.title}>Enter your PIN</Text>
              <Text style={[styles.sub, (pinErr || cooldownLeft > 0) && { color: colors.down }]}>{pinSub}</Text>
              <View style={styles.pad}>
                <PinPad
                  value={pin}
                  onChange={setPin}
                  error={pinErr}
                  disabled={cooldownLeft > 0}
                  length={PIN_LENGTH}
                  onBiometric={canBio ? () => { setMethod('bio'); void tryBio(); } : undefined}
                />
              </View>
            </View>
          ) : (
            <View style={styles.wrap}>
              {/* Mark and action, nothing else. The button already says what the screen is
                  for, so a headline above it was just repeating it in bigger type. */}
              <LockedMark colors={colors} />
              <PressableScale
                haptic="medium"
                onPress={tryBio}
                accessibilityRole="button"
                accessibilityLabel="Unlock with Face ID"
                style={styles.btn}
              >
                <Text style={styles.btnText}>Unlock with Face ID</Text>
              </PressableScale>
              {pinSet && (
                <PressableScale haptic="light" onPress={() => setMethod('pin')} style={styles.altBtn} accessibilityRole="button" accessibilityLabel="Enter PIN instead">
                  <Text style={styles.altText}>Use your PIN</Text>
                </PressableScale>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.ink,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.xl,
      zIndex: 100,
    },
    wrap: { alignItems: 'center' },

    // The mark stands on its own, no icon tile: the figure with its arms up IS the brand,
    // and boxing it made it read as a generic app icon. Two soft rings breathe behind it.
    markStage: { alignItems: 'center', justifyContent: 'center' },
    markSm: { marginBottom: space.lg },

    title: {
      color: colors.paper, fontFamily: fonts.display, fontSize: 30,
      lineHeight: 34, letterSpacing: -1.1, textAlign: 'center',
    },
    sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: space.sm, textAlign: 'center' },
    pad: { marginTop: space.xxl },
    btn: {
      marginTop: 56, minHeight: 54, paddingHorizontal: space.xxl, borderRadius: radius.pill,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.vermilion,
      shadowColor: SHADOW_INK, shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 9 },
    },
    btnText: { color: colors.white, fontFamily: fonts.displaySemi, fontSize: 16, letterSpacing: -0.2 },
    altBtn: { marginTop: space.lg, padding: space.sm },
    altText: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 14 },
  });
}
