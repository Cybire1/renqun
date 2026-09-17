// App-lock: optional Face ID / Touch ID / device-passcode gate on app open and on
// sensitive actions (revealing the recovery key). Backed by expo-local-authentication;
// the preference persists in SecureStore (localStorage on web, where there's no biometric).
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const K_LOCK = 'yosuku_app_lock';
const K_PIN = 'yosuku_app_pin';
const K_AUTOLOCK = 'yosuku_autolock_ms';

async function get(k: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(k);
}
async function set(k: string, v: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(k, v); } catch { /* ignore */ }
    return;
  }
  await SecureStore.setItemAsync(k, v);
}
async function del(k: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.removeItem(k); } catch { /* ignore */ }
    return;
  }
  await SecureStore.deleteItemAsync(k);
}

// ── Live pref changes ────────────────────────────────────────────────────────
// The AppLock gate is a persistent ancestor; when Settings flips the lock on/off,
// changes the PIN, or the auto-lock window, it must re-read — otherwise the toggle
// looks like it did nothing until the next relaunch. Settings mutations emit here.
const prefListeners = new Set<() => void>();
export function onLockPrefsChanged(fn: () => void): () => void {
  prefListeners.add(fn);
  return () => { prefListeners.delete(fn); };
}
function emitLockPrefsChanged(): void {
  prefListeners.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

// ── Trusted interruptions ────────────────────────────────────────────────────
// iOS resigns "active" while a biometric sheet is up. That would otherwise look like
// a background→foreground to the auto-lock timer and re-lock the app the instant an
// in-app Face ID prompt (unlock, reveal key, toggle) finishes. authenticate() marks
// the window as trusted so AppLock ignores it.
let trusted = 0;
export function inTrustedInterruption(): boolean { return trusted > 0; }

/** Does this device have biometrics or a passcode we can prompt? */
export async function canUseAppLock(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function isAppLockEnabled(): Promise<boolean> {
  return (await get(K_LOCK)) === '1';
}

export async function setAppLockEnabled(on: boolean): Promise<void> {
  await set(K_LOCK, on ? '1' : '0');
  emitLockPrefsChanged();
}

/** Prompt Face ID / Touch ID / passcode. Returns true on success (or on web, where
 *  there's nothing to prompt). `reason` is shown in the system sheet. */
export async function authenticate(reason: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  trusted += 1;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use passcode',
    });
    return r.success;
  } catch {
    return false;
  } finally {
    // Keep the window trusted a beat past dismissal so the trailing "active" event
    // (fired as the sheet animates away) is still ignored by the auto-lock timer.
    setTimeout(() => { trusted = Math.max(0, trusted - 1); }, 700);
  }
}

// ── App PIN ────────────────────────────────────────────────────────────────
// A 6-digit fallback for when Face ID is unavailable, fails, or the user prefers a
// code. Persisted in SecureStore, which is the iOS Keychain / Android Keystore —
// encrypted at rest and hardware-backed — so the code never lives in plain storage.
// (It's a local unlock code, never sent anywhere.)
export const PIN_LENGTH = 6;

export async function hasPin(): Promise<boolean> {
  return !!(await get(K_PIN));
}
export async function setPin(pin: string): Promise<void> {
  await set(K_PIN, pin);
  emitLockPrefsChanged();
}
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await get(K_PIN);
  return stored != null && stored === pin;
}
export async function clearPin(): Promise<void> {
  await del(K_PIN);
  emitLockPrefsChanged();
}

// ── Session management: auto-lock timeout ────────────────────────────────────
// How long the app may sit in the background before it re-locks. "Immediately" (0)
// re-locks on every switch away; longer windows keep a session alive across quick
// app-switches so the user isn't re-prompted constantly.
export interface AutoLockOption { ms: number; label: string }
export const AUTOLOCK_OPTIONS: AutoLockOption[] = [
  { ms: 0, label: 'Immediately' },
  { ms: 30_000, label: 'After 30 seconds' },
  { ms: 60_000, label: 'After 1 minute' },
  { ms: 5 * 60_000, label: 'After 5 minutes' },
  { ms: 15 * 60_000, label: 'After 15 minutes' },
];

export async function getAutoLockMs(): Promise<number> {
  const v = await get(K_AUTOLOCK);
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export async function setAutoLockMs(ms: number): Promise<void> {
  await set(K_AUTOLOCK, String(ms));
  emitLockPrefsChanged();
}
export function autoLockLabel(ms: number): string {
  return AUTOLOCK_OPTIONS.find((o) => o.ms === ms)?.label ?? 'Immediately';
}
