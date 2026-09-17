// Wallet + Earn on Mezo: the balance you can bet with, ways to fund this device's wallet, and the
// pool that takes the other side of every bet.
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { WINE_GRADIENT, WINE_STOPS, liftSmall, mz, r, type } from '../../lib/mezo/theme';
import { btc, hhmm, inWords, musd, musdNearest, shortAddr } from '../../lib/mezo/format';
import {
  friendlyError,
  toWad,
  txApproveMusd,
  txClaimDeposit,
  txClaimWithdraw,
  txRequestDeposit,
  txRequestWithdraw,
} from '../../lib/mezo/client';
import { refreshMezo, useBalances, useMezoAddress, useNow, useVault } from '../../lib/mezo/hooks';
import { sendTx } from '../../lib/mezo/wallet';
import { MEZO, explorerAddress } from '../../lib/mezo/network';
import { Skeleton } from '../Skeleton';
import { Button, Divider, Glyph, Segmented, Surface, TopBar } from './ui';

type Mode = 'deposit' | 'withdraw';

export function MezoWalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addr = useMezoAddress();
  const now = useNow(15_000);
  const balances = useBalances(addr);
  const vault = useVault(addr);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bal = balances.data;
  const v = vault.data;
  const wei = toWad(parseFloat(amount.replace(',', '.')));
  const nextAt = v ? hhmm(v.nextRoll) : '—';
  const share = v && v.nav > 0n ? Number((v.value * 10_000n) / v.nav) / 100 : 0;
  const riskPct = v && v.nav > 0n ? Math.min(100, Number((v.atRisk * 10_000n) / v.nav) / 100) : 0;
  const capPct = v && v.nav > 0n ? Math.min(100, Number((v.cap * 10_000n) / v.nav) / 100) : 50;

  const copy = async () => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    haptic('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      haptic('success');
      if (key === 'deposit' || key === 'withdraw') setAmount('');
      refreshMezo();
    } catch (e) {
      haptic('warning');
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  // Deposit: approve once, then queue. Withdraw: MUSD → pool shares at today's value.
  const needsAllowance = mode === 'deposit' && bal ? bal.allowance < wei : false;
  const sharesFor = v && v.nav > 0n ? (wei * v.supply) / v.nav : 0n;
  let blocker: string | null = null;
  if (wei === 0n) blocker = 'Enter an amount';
  else if (mode === 'deposit' && bal && wei > bal.musd) blocker = 'Not enough MUSD';
  else if (mode === 'deposit' && wei < 10n ** 19n) blocker = 'Minimum 10 MUSD';
  else if (mode === 'withdraw' && v && wei > v.value) blocker = 'More than your share';
  else if (bal && bal.btc === 0n) blocker = 'Needs BTC for gas';

  const submit = () => {
    if (mode === 'deposit') {
      if (needsAllowance) return run('approve', () => sendTx(txApproveMusd()));
      return run('deposit', () => sendTx(txRequestDeposit(wei)));
    }
    const shares = v && wei >= v.value ? v.shares : sharesFor;
    return run('withdraw', () => sendTx(txRequestWithdraw(shares)));
  };

  const pending = v && (v.queuedDeposit > 0n || v.queuedWithdrawShares > 0n || v.claimableDeposits.length > 0 || v.claimableWithdrawals.length > 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar right={<View />} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 132 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void balances.refresh();
              void vault.refresh();
            }}
            tintColor={mz.text3}
          />
        }
      >
        {/* ── balance ── */}
        <View style={styles.balance}>
          <Text style={type.label}>Available to bet</Text>
          {bal ? (
            <Text style={styles.balanceValue} accessibilityLabel={`${musd(bal.musd)} MUSD`}>
              {musd(bal.musd)}
              <Text style={styles.balanceUnit}> MUSD</Text>
            </Text>
          ) : (
            <Skeleton width={180} height={48} radius={10} style={{ marginTop: 6 }} />
          )}
          <View style={styles.gas}>
            <View style={[styles.gasDot, { backgroundColor: bal && bal.btc === 0n ? mz.red : mz.green }]} />
            <Text style={type.small}>{bal ? `${btc(bal.btc, 5)} BTC for gas` : ' '}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Action icon="arrowDown" label={showQr ? 'Hide' : 'Receive'} onPress={() => setShowQr((x) => !x)} />
          <Action icon="plus" label="Add MUSD" onPress={() => router.push('/mezo/fund')} primary />
          {MEZO.faucet ? <Action icon="drop" label="Test BTC" onPress={() => Linking.openURL(MEZO.faucet!)} /> : null}
        </View>

        {showQr && addr ? (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <Surface style={styles.qrCard}>
              <View style={styles.qr}>
                <QRCode value={addr} size={176} color={mz.ink} backgroundColor={mz.card} />
              </View>
              <Text style={[type.small, { textAlign: 'center' }]}>Mezo {MEZO.network} only</Text>
            </Surface>
          </Animated.View>
        ) : null}

        <PressableScale haptic="none" scaleTo={0.98} onPress={copy} style={styles.addr} accessibilityRole="button" accessibilityLabel="Copy wallet address">
          <View style={{ flex: 1 }}>
            <Text style={type.small}>Your Mezo address</Text>
            <Text style={styles.addrText}>{addr ? shortAddr(addr) : '…'}</Text>
          </View>
          <View style={styles.copy}>
            <Glyph name={copied ? 'check' : 'copy'} size={15} color={mz.ink} />
            <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
          </View>
        </PressableScale>

        {bal && bal.musd === 0n ? (
          <Text style={[type.small, styles.hint]}>Tap Add MUSD to get started.</Text>
        ) : null}

        {/* ── earn ── */}
        <Text style={[type.title, styles.earnTitle]} accessibilityRole="header">
          Earn
        </Text>
        <Text style={[type.body, { marginTop: 2 }]}>Be the other side of every bet.</Text>

        <Surface style={styles.earn}>
          <LinearGradient colors={[...WINE_GRADIENT]} locations={[...WINE_STOPS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
          <View style={styles.earnBody}>
            <View style={styles.shareRow}>
              <View>
                <Text style={type.label}>Your share</Text>
                {v ? (
                  <Text style={styles.shareValue}>
                    {musdNearest(v.value)}
                    <Text style={styles.balanceUnit}> MUSD</Text>
                  </Text>
                ) : (
                  <Skeleton width={120} height={30} radius={8} style={{ marginTop: 6 }} />
                )}
              </View>
              {v && v.shares > 0n ? <Text style={styles.sharePct}>{share.toFixed(share < 1 ? 2 : 1)}%</Text> : null}
            </View>

            <View style={styles.meter} accessibilityLabel={v ? `${musd(v.atRisk)} MUSD at risk now, limit ${musd(v.cap)}` : undefined}>
              <View style={[styles.meterFill, { width: `${Math.max(riskPct, riskPct > 0 ? 1.5 : 0)}%` }]} />
              <View style={[styles.meterCap, { left: `${capPct}%` }]} />
            </View>

            <View style={styles.statsRow}>
              <MiniStat label="Pool" value={v ? musd(v.nav) : null} />
              <MiniStat label="At risk now" value={v ? musd(v.atRisk) : null} dot />
              <MiniStat label="Risk limit" value={v ? musd(v.cap) : null} />
            </View>

            <Divider style={{ marginVertical: 14 }} />

            <View style={styles.update}>
              <View style={styles.clockTile}>
                <Glyph name="clock" size={18} color={mz.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.strong}>Next update {nextAt}</Text>
                <Text style={type.small}>{v ? `in ${inWords(v.nextRoll - now)}` : ' '}</Text>
              </View>
            </View>

            {pending && v ? (
              <View style={styles.pending}>
                {v.queuedDeposit > 0n ? <Text style={type.small}>{musd(v.queuedDeposit)} MUSD joins at {nextAt}</Text> : null}
                {v.queuedWithdrawShares > 0n ? <Text style={type.small}>Withdrawal pays at {nextAt}</Text> : null}
                {v.claimableDeposits.map((e) => (
                  <Button key={`d${e}`} tone="red" height={48} label="Add your new pool share" busy={busy === `cd${e}`} onPress={() => run(`cd${e}`, () => sendTx(txClaimDeposit(e)))} />
                ))}
                {v.claimableWithdrawals.map((e) => (
                  <Button key={`w${e}`} tone="red" height={48} label="Collect your withdrawal" busy={busy === `cw${e}`} onPress={() => run(`cw${e}`, () => sendTx(txClaimWithdraw(e)))} />
                ))}
              </View>
            ) : null}
          </View>
        </Surface>

        <Surface style={styles.move}>
          <Segmented
            items={[
              { key: 'deposit', label: 'Deposit' },
              { key: 'withdraw', label: 'Withdraw' },
            ]}
            value={mode}
            onChange={(k) => {
              setMode(k);
              setError(null);
            }}
          />
          <View style={styles.amountRow}>
            <TextInput
              value={amount}
              placeholder="0"
              placeholderTextColor={mz.lineStrong}
              onChangeText={(t) => {
                setAmount(t.replace(/[^0-9.,]/g, ''));
                setError(null);
              }}
              keyboardType="decimal-pad"
              maxLength={12}
              style={styles.amount}
              accessibilityLabel={`${mode} amount in MUSD`}
            />
            <Text style={styles.amountUnit}>MUSD</Text>
            <PressableScale
              haptic="light"
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel="Use the maximum"
              onPress={() => {
                const max = mode === 'deposit' ? bal?.musd : v?.value;
                if (max != null) setAmount((Number(max / 10n ** 16n) / 100).toFixed(2));
              }}
              style={styles.max}
            >
              <Text style={styles.maxText}>Max</Text>
            </PressableScale>
          </View>
          <Text style={type.small}>{mode === 'deposit' ? `Wallet ${bal ? musd(bal.musd) : '—'}` : `Your share ${v ? musdNearest(v.value) : '—'}`}</Text>
          <View style={{ marginTop: 14, gap: 10 }}>
            {blocker ? (
              <Button tone="muted" disabled label={blocker} onPress={() => {}} />
            ) : (
              <Button
                tone="red"
                label={needsAllowance ? 'Allow MUSD for the pool' : mode === 'deposit' ? `Deposit · joins at ${nextAt}` : `Withdraw · pays at ${nextAt}`}
                busy={busy === 'approve' || busy === mode}
                onPress={submit}
              />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </Surface>

        {addr ? (
          <PressableScale haptic="light" onPress={() => Linking.openURL(explorerAddress(addr))} accessibilityRole="link" style={styles.explorer}>
            <Text style={styles.link}>This wallet on the Mezo explorer</Text>
            <Glyph name="external" size={14} color={mz.ink} />
          </PressableScale>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Action({ icon, label, onPress, primary }: { icon: 'arrowDown' | 'plus' | 'drop'; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale haptic="light" scaleTo={0.94} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <View style={[styles.actionDisc, primary ? { backgroundColor: mz.red } : { backgroundColor: mz.card, ...liftSmall }]}>
        <Glyph name={icon} size={22} color={primary ? mz.onRed : mz.ink} weight={2.2} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </PressableScale>
  );
}

function MiniStat({ label, value, dot }: { label: string; value: string | null; dot?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {dot ? <View style={styles.swatch} /> : null}
        <Text style={type.small}>{label}</Text>
      </View>
      {value == null ? <Skeleton width={60} height={14} radius={6} /> : <Text style={type.digitsBold}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mz.sand },

  balance: { marginTop: 8, gap: 2 },
  balanceValue: { fontFamily: fonts.display, fontSize: 48, letterSpacing: -1.6, color: mz.black, fontVariant: ['tabular-nums'] },
  balanceUnit: { fontFamily: fonts.bodySemi, fontSize: 15, color: mz.text3, letterSpacing: 0 },
  gas: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  gasDot: { width: 7, height: 7, borderRadius: 4 },

  actions: { flexDirection: 'row', gap: 22, marginTop: 20 },
  action: { alignItems: 'center', gap: 7 },
  actionDisc: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink },

  qrCard: { marginTop: 18, padding: 18, alignItems: 'center', gap: 12 },
  qr: { padding: 10, borderRadius: 14, backgroundColor: mz.card },

  addr: {
    marginTop: 18,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: r.row,
    backgroundColor: mz.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addrText: { fontFamily: fonts.mono, fontSize: 15, color: mz.ink, marginTop: 1 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: mz.sandDeep },
  copyText: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink },
  hint: { marginTop: 10, lineHeight: 18 },

  earnTitle: { marginTop: 30 },
  earn: { marginTop: 16, overflow: 'hidden' },
  rule: { height: 5 },
  earnBody: { padding: 18 },
  shareRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  shareValue: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.9, color: mz.black, fontVariant: ['tabular-nums'], marginTop: 2 },
  sharePct: { fontFamily: fonts.display, fontSize: 17, color: mz.ink, marginBottom: 6 },

  meter: { marginTop: 18, height: 8, borderRadius: 4, backgroundColor: mz.sandDeep },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: mz.red },
  meterCap: { position: 'absolute', top: -4, width: 2, height: 16, borderRadius: 1, backgroundColor: mz.ink },
  statsRow: { flexDirection: 'row', marginTop: 14, gap: 10 },
  swatch: { width: 8, height: 8, borderRadius: 2, backgroundColor: mz.red },

  update: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clockTile: { width: 40, height: 40, borderRadius: r.tile, backgroundColor: mz.sandDeep, alignItems: 'center', justifyContent: 'center' },
  pending: { marginTop: 14, gap: 10 },

  move: { marginTop: 14, padding: 18 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  amount: { flex: 1, fontFamily: fonts.display, fontSize: 40, letterSpacing: -1.2, color: mz.black, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  amountUnit: { fontFamily: fonts.bodySemi, fontSize: 15, color: mz.text3 },
  max: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: mz.sandDeep, justifyContent: 'center' },
  maxText: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink },

  error: { textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink },
  explorer: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 16, marginTop: 8 },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink, textDecorationLine: 'underline', textDecorationColor: mz.red },
});
