// Add MUSD without leaving the app: free test MUSD (testnet), swap BTC on Mezo's DEX, send from
// MetaMask, or receive from any wallet.
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz, r, type } from '../../lib/mezo/theme';
import { btc, money, musd, shortAddr } from '../../lib/mezo/format';
import {
  btcAllowanceForDex,
  friendlyError,
  quoteBtcToMusd,
  txApproveBtcForDex,
  txSwapBtcForMusd,
} from '../../lib/mezo/client';
import { refreshMezo, useBalances, useMezoAddress, usePoll } from '../../lib/mezo/hooks';
import { dripAvailable, metamaskSendUrl, requestDrip, testMusdClaimed } from '../../lib/mezo/funding';
import { IS_TESTNET, MEZO_APP_URL } from '../../lib/mezo/network';
import { sendTx } from '../../lib/mezo/wallet';
import { Button, Divider, Glyph } from '../../components/mezo/ui';

const GAS_RESERVE = 20_000_000_000_000n; // keep 0.00002 BTC for gas when swapping "Max"
const BTC_CHIPS = ['0.0002', '0.0005', '0.001'];

const toBtcWei = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e8)) * 10n ** 10n : 0n;
};

export default function FundSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addr = useMezoAddress();
  const balances = useBalances(addr);
  const bal = balances.data;

  const [btcIn, setBtcIn] = useState('0.0005');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  // null until read: the free test MUSD offer only shows for a wallet that has not had it.
  const [claimed, setClaimed] = useState<boolean | null>(null);

  useEffect(() => {
    setClaimed(null);
    if (addr) void testMusdClaimed(addr).then(setClaimed);
  }, [addr]);

  const wei = toBtcWei(btcIn);
  const quote = usePoll(wei > 0n ? async () => ({ wei, out: await quoteBtcToMusd(wei) }) : null, 10_000, `swapq:${wei}`, { keepData: true });
  const out = quote.data?.wei === wei ? quote.data.out : null;
  const spendable = bal ? (bal.btc > GAS_RESERVE ? bal.btc - GAS_RESERVE : 0n) : 0n;
  const tooMuch = bal ? wei > spendable : false;
  const noBtc = bal ? spendable === 0n : false;
  const swapBusy = busy !== null && busy !== 'drip';

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setNote(null);
    try {
      const msg = await fn();
      haptic('success');
      if (msg) setNote(msg);
      refreshMezo();
    } catch (e) {
      haptic('warning');
      setNote(e instanceof Error && !('shortMessage' in e) ? e.message : friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const getTestMusd = () =>
    run('drip', async () => {
      if (!addr) return;
      const r = await requestDrip(addr);
      setClaimed(r.musdGiven);
      if (r.musd) return `${money(Number(BigInt(r.musd.amount)) / 1e18)} test MUSD added.`;
      return r.musdGiven ? 'This wallet already had its test MUSD.' : 'Nothing to add right now.';
    });

  const swap = () =>
    run('swap', async () => {
      if (!addr || wei === 0n) return;
      const quoted = await quoteBtcToMusd(wei);
      if ((await btcAllowanceForDex(addr)) < wei) {
        setBusy('Setting up · 1 of 2');
        await sendTx(txApproveBtcForDex(wei));
        setBusy('Swapping · 2 of 2');
      }
      await sendTx(txSwapBtcForMusd(wei, (quoted * 99n) / 100n, addr));
      return `Swapped ${btcIn} BTC for about ${money(Number(quoted) / 1e18)} MUSD.`;
    });

  const copy = async () => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    haptic('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Add MUSD
        </Text>
        <Text style={type.small}>{bal ? `You have ${musd(bal.musd)} MUSD · ${btc(bal.btc, 5)} BTC` : ' '}</Text>
      </View>

      {IS_TESTNET && dripAvailable() && claimed === false ? (
        <View style={styles.block}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={type.strong}>Free test MUSD</Text>
              <Text style={type.small}>Testnet only · once per wallet</Text>
            </View>
            <Button label="Get 20" tone="red" height={40} radius={999} busy={busy === 'drip'} disabled={busy !== null && busy !== 'drip'} onPress={getTestMusd} style={{ paddingHorizontal: 18 }} />
          </View>
        </View>
      ) : null}

      {noBtc ? (
        <View style={[styles.block, styles.rowBetween]}>
          <View style={{ flex: 1 }}>
            <Text style={type.strong}>Swap BTC for MUSD</Text>
            <Text style={type.small}>No BTC on Mezo yet</Text>
          </View>
          <Button label="Bridge BTC" tone="soft" height={40} radius={999} haptic="light" onPress={() => Linking.openURL(MEZO_APP_URL)} style={{ paddingHorizontal: 16 }} />
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={type.strong}>Swap BTC for MUSD</Text>
          <View style={styles.swapRow}>
            <TextInput
              value={btcIn}
              onChangeText={(t) => setBtcIn(t.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
              maxLength={10}
              style={[styles.btcInput, tooMuch && { color: mz.text3 }]}
              accessibilityLabel="BTC to swap"
            />
            <Text style={styles.unit}>BTC</Text>
            <Glyph name="arrowDown" size={16} color={mz.text3} />
            <Text style={styles.out} numberOfLines={1}>
              {out != null ? `≈ ${money(Number(out) / 1e18)}` : '…'} <Text style={styles.unit}>MUSD</Text>
            </Text>
          </View>
          <View style={styles.chips}>
            {BTC_CHIPS.map((c) => (
              <PressableScale key={c} haptic="light" scaleTo={0.94} onPress={() => setBtcIn(c)} style={styles.chip} accessibilityRole="button">
                <Text style={styles.chipText}>{c}</Text>
              </PressableScale>
            ))}
            <PressableScale
              haptic="light"
              scaleTo={0.94}
              onPress={() => setBtcIn((Number(spendable / 10n ** 10n) / 1e8).toString())}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel="Swap all but a little BTC for gas"
            >
              <Text style={styles.chipText}>Max</Text>
            </PressableScale>
          </View>
          <Button
            label={swapBusy ? (busy === 'swap' ? 'Swapping…' : busy!) : tooMuch ? 'Not enough BTC' : 'Swap'}
            tone="red"
            height={46}
            busy={swapBusy}
            disabled={!swapBusy && (tooMuch || wei === 0n || out == null || busy === 'drip')}
            onPress={swap}
          />
        </View>
      )}

      <View style={styles.block}>
        <Text style={type.strong}>From another wallet</Text>
        <View style={styles.pair}>
          <Button label="MetaMask" tone="soft" height={44} haptic="light" style={{ flex: 1 }} onPress={() => addr && Linking.openURL(metamaskSendUrl(addr))} />
          <Button label={showQr ? 'Hide QR' : 'Show QR'} tone="soft" height={44} haptic="light" style={{ flex: 1 }} onPress={() => setShowQr((x) => !x)} />
        </View>
        {showQr && addr ? (
          <Animated.View entering={FadeIn} style={styles.qr}>
            <QRCode value={addr} size={150} color={mz.ink} backgroundColor={mz.card} />
          </Animated.View>
        ) : null}
        <PressableScale haptic="none" onPress={copy} style={styles.addr} accessibilityRole="button" accessibilityLabel="Copy wallet address">
          <Text style={styles.addrText}>{addr ? shortAddr(addr) : '…'}</Text>
          <View style={styles.copy}>
            <Glyph name={copied ? 'check' : 'copy'} size={14} color={mz.ink} />
            <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
          </View>
        </PressableScale>
      </View>

      {note ? (
        <Animated.Text entering={FadeIn} style={styles.note} accessibilityLiveRegion="polite">
          {note}
        </Animated.Text>
      ) : null}

      <Divider style={{ marginTop: 4 }} />
      <View style={styles.rowBetween}>
        <PressableScale haptic="light" onPress={() => Linking.openURL(MEZO_APP_URL)} accessibilityRole="link" style={styles.linkRow}>
          <Text style={styles.link}>Borrow on Mezo</Text>
          <Text style={type.small}> · from 1,800 MUSD</Text>
        </PressableScale>
        <PressableScale haptic="light" onPress={() => router.back()} accessibilityRole="button" style={styles.linkRow}>
          <Text style={type.strong}>Done</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: mz.card, paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  head: { gap: 2 },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5, color: mz.black },
  block: { gap: 10, padding: 14, borderRadius: r.row, backgroundColor: mz.well },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },

  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btcInput: { minWidth: 92, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.6, color: mz.black, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.text3 },
  out: { flex: 1, textAlign: 'right', fontFamily: fonts.display, fontSize: 20, color: mz.ink, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: mz.card, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink, fontVariant: ['tabular-nums'] },

  pair: { flexDirection: 'row', gap: 8 },
  qr: { alignSelf: 'center', padding: 10, borderRadius: 12, backgroundColor: mz.card },
  addr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  addrText: { fontFamily: fonts.mono, fontSize: 14, color: mz.ink },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: mz.card },
  copyText: { fontFamily: fonts.bodySemi, fontSize: 12, color: mz.ink },

  note: { textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink },
  linkRow: { flexDirection: 'row', alignItems: 'baseline', minHeight: 40, paddingTop: 10 },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink, textDecorationLine: 'underline', textDecorationColor: mz.red },
});
