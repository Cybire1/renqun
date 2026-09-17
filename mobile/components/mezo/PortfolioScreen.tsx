// Portfolio on Mezo: what is in play and what it could pay, winnings to collect, and every bet as
// a row (live ones with where they stand right now and a cash-out).
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { lift, mz, r, type } from '../../lib/mezo/theme';
import { clock, hhmm, musd, timeWords, usd0 } from '../../lib/mezo/format';
import { friendlyError, isPriceMove, positionLine, quoteCashOut, roundName, txClaim, txRedeem, type Position } from '../../lib/mezo/client';
import { refreshMezo, useMezoAddress, useNow, usePositions, useSpot } from '../../lib/mezo/hooks';
import { TxRevertedError, sendTx } from '../../lib/mezo/wallet';
import { Skeleton } from '../Skeleton';
import { Button, EmptyState, Segmented, SideTile, Surface, TopBar } from './ui';

type Tab = 'open' | 'settled';

export function MezoPortfolioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const addr = useMezoAddress();
  const now = useNow(1000);
  const positions = usePositions(addr);
  const spot = useSpot();
  const [picked, setPicked] = useState<Tab | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = positions.data ?? [];
  const open = useMemo(() => all.filter((p) => p.open && p.market.status === 'live'), [all]);
  const settled = useMemo(() => all.filter((p) => !(p.open && p.market.status === 'live')), [all]);
  const ready = useMemo(() => all.filter((p) => p.claimable != null && p.claimable > 0n), [all]);
  const readyTotal = ready.reduce((sum, p) => sum + (p.claimable ?? 0n), 0n);
  const wins = ready.filter((p) => p.market.status === 'settled').length;
  const refunds = ready.length - wins;
  const inPlay = open.reduce((sum, p) => sum + p.premium, 0n);
  const couldPay = open.reduce((sum, p) => sum + p.quantity, 0n);
  // Until the person picks, show where the news is: results when nothing is open.
  const tab: Tab = picked ?? (open.length === 0 && settled.length > 0 ? 'settled' : 'open');

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      haptic('success');
      refreshMezo();
    } catch (e) {
      haptic('warning');
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const claimAll = () => run('claim', () => sendTx(txClaim(ready.map((p) => p.id))));
  // Re-price at the tap: the number on the row can be seconds old on a fast round. If the price still
  // runs past the bound before the block, quote again and resend, up to twice.
  const cashOut = (p: Position) =>
    run(`redeem:${p.id}`, async () => {
      for (let attempt = 0; ; attempt++) {
        const { minProceeds } = await quoteCashOut(p.id, p.quantity);
        try {
          return await sendTx(txRedeem(p.id, minProceeds));
        } catch (e) {
          if (attempt < 2 && (e instanceof TxRevertedError || isPriceMove(e))) continue;
          throw e;
        }
      }
    });

  const list = tab === 'open' ? open : settled;
  const loading = positions.loading && !positions.data;
  const failed = !positions.data && !positions.loading && positions.error != null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 132 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void positions.refresh()} tintColor={mz.text3} />}
      >
        <Text style={[type.title, styles.title]} accessibilityRole="header">
          Portfolio
        </Text>

        <View style={styles.stats}>
          <Stat label="In play" value={loading ? null : failed ? '—' : musd(inPlay)} />
          <Stat label="Could pay" value={loading ? null : failed ? '—' : musd(couldPay)} strong />
        </View>

        {readyTotal > 0n ? (
          <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOut} style={styles.claim}>
            <View style={{ flex: 1 }}>
              <Text style={styles.claimLabel}>
                {wins ? `You won ${wins === 1 ? 'a round' : `${wins} rounds`}` : 'Refund ready'}
                {wins && refunds ? ` · ${refunds} refund${refunds > 1 ? 's' : ''}` : ''}
              </Text>
              <Text style={styles.claimValue}>
                {musd(readyTotal)}
                <Text style={styles.claimUnit}> MUSD</Text>
              </Text>
            </View>
            <Button label="Collect" tone="white" height={46} radius={999} busy={busy === 'claim'} onPress={claimAll} style={{ paddingHorizontal: 22 }} />
          </Animated.View>
        ) : null}

        <Segmented
          items={[
            { key: 'open', label: 'Open', count: open.length },
            { key: 'settled', label: 'Settled', count: settled.length },
          ]}
          value={tab}
          onChange={(k) => setPicked(k)}
          style={{ marginTop: 18 }}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ marginTop: 14 }}>
          {loading ? (
            <Surface style={{ padding: 16, gap: 18 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Skeleton width={38} height={38} radius={11} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="60%" height={14} radius={7} />
                    <Skeleton width="40%" height={11} radius={6} />
                  </View>
                </View>
              ))}
            </Surface>
          ) : failed ? (
            <Surface>
              <EmptyState
                title="Couldn't load your bets"
                body="Mezo didn't answer. Your bets are safe on chain."
                action={<Button label="Try again" tone="soft" onPress={() => void positions.refresh()} />}
              />
            </Surface>
          ) : list.length === 0 ? (
            <Surface>
              <EmptyState
                title={tab === 'open' ? 'No open bets' : 'Nothing settled yet'}
                body={tab === 'open' ? 'Pick Up or Down on a live round. It settles on its own at the Mezo oracle price.' : 'Finished rounds show up here.'}
                action={tab === 'open' ? <Button label="Go to Markets" tone="red" onPress={() => router.navigate('/(tabs)')} /> : undefined}
              />
            </Surface>
          ) : (
            <Surface style={{ paddingVertical: 4 }}>
              {list.map((p, i) => (
                <Animated.View key={p.id.toString()} layout={LinearTransition} entering={FadeIn}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <PositionRow p={p} now={now} spotUsd={spot.data?.usd ?? null} busy={busy} onCashOut={() => cashOut(p)} />
                </Animated.View>
              ))}
            </Surface>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <View style={[styles.stat, strong && styles.statStrong]}>
      <Text style={type.label}>{label}</Text>
      {value == null ? (
        <Skeleton width={80} height={22} radius={6} style={{ marginTop: 6 }} />
      ) : (
        <Text style={styles.statValue}>
          {value}
          <Text style={styles.statUnit}> MUSD</Text>
        </Text>
      )}
    </View>
  );
}

function callText(p: Position): string {
  const m = p.market;
  const line = positionLine(p);
  // A "later today" question reads as the question and its answer.
  if (m.cadence === '1d' && line != null) return `${p.side === 'up' ? 'Yes' : 'No'} · above ${usd0(line)} at ${timeWords(m.expiry)}`;
  if (p.side === 'up' && line != null) return `Above ${usd0(line)}`;
  if (p.side === 'down' && line != null) return `At or below ${usd0(line)}`;
  return `${usd0(Number(p.lower * m.tickSize) / 1e9)} – ${usd0(Number(p.higher * m.tickSize) / 1e9)}`;
}

function PositionRow({
  p,
  now,
  spotUsd,
  busy,
  onCashOut,
}: {
  p: Position;
  now: number;
  spotUsd: number | null;
  busy: string | null;
  onCashOut: () => void;
}) {
  const m = p.market;
  const left = m.expiry - now;
  const live = p.open && m.status === 'live';
  const round = roundName(m.cadence);

  // right-hand side: where it stands, or how it ended
  let headline: string;
  let headColor: string = mz.ink;
  let sub: string;
  if (live && left <= 0) {
    headline = 'Settling';
    headColor = mz.text3;
    sub = 'any second';
  } else if (live) {
    const winning = spotUsd != null && p.winsAt(spotUsd);
    headline = spotUsd == null ? '—' : winning ? 'Winning' : 'Behind';
    headColor = winning ? mz.greenText : mz.downText;
    sub = `${clock(left)} left`;
  } else if (p.cashedOut) {
    headline = 'Cashed out';
    headColor = mz.text2;
    sub = `stake ${musd(p.premium)}`;
  } else if (m.status === 'void') {
    headline = `+${musd(p.premium)}`;
    sub = p.open ? 'refund to collect' : 'refunded';
  } else {
    const won = m.settlement != null && p.winsAt(m.settlement);
    headline = won ? `+${musd(p.quantity - p.premium)}` : `−${musd(p.premium)}`;
    headColor = won ? mz.greenText : mz.text2;
    sub = won ? (p.open ? 'ready to collect' : 'collected') : 'lost';
  }

  const when = live ? (m.cadence === '1d' ? 'Later today' : `${round} · closes ${hhmm(m.expiry)}`) : m.settlement != null ? `Closed ${hhmm(m.expiry)} at ${usd0(m.settlement)}` : `${round} · ${hhmm(m.expiry)}`;

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <SideTile side={p.side} />
        <View style={{ flex: 1 }}>
          <Text style={type.strong} numberOfLines={1}>
            {callText(p)}
          </Text>
          <Text style={type.small} numberOfLines={1}>
            {when}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.rowHead, { color: headColor }]}>{headline}</Text>
          <Text style={[type.small, { fontVariant: ['tabular-nums'] }]}>{sub}</Text>
        </View>
      </View>
      {live ? (
        <View style={styles.rowFoot}>
          <Text style={type.small}>
            Stake <Text style={styles.footStrong}>{musd(p.premium)}</Text> · pays <Text style={styles.footStrong}>{musd(p.quantity)}</Text>
          </Text>
          {p.cashOut != null && p.cashOut > 0n && left > 0 ? (
            <PressableScale
              haptic="light"
              scaleTo={0.95}
              onPress={() => {
                if (!busy) onCashOut();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Cash out for about ${musd(p.cashOut)} MUSD`}
              style={[styles.cashOut, busy === `redeem:${p.id}` && { opacity: 0.6 }]}
            >
              <Text style={styles.cashOutText}>{busy === `redeem:${p.id}` ? 'Cashing out…' : `Cash out ${musd(p.cashOut)}`}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mz.sand },
  title: { marginTop: 6 },

  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: r.row, backgroundColor: mz.card },
  statStrong: { ...lift },
  statValue: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5, color: mz.black, marginTop: 4, fontVariant: ['tabular-nums'] },
  statUnit: { fontFamily: fonts.bodyMed, fontSize: 12, color: mz.text3, letterSpacing: 0 },

  claim: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 12,
    borderRadius: r.surface,
    backgroundColor: mz.red,
    ...lift,
  },
  // Soft blush whites on the red (pure white read too stark); semibold so the small line holds up.
  claimLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#FFD3DF' },
  claimValue: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.8, color: '#FFEDF2', fontVariant: ['tabular-nums'] },
  claimUnit: { fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 0 },

  error: { marginTop: 12, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink },

  row: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowHead: { fontFamily: fonts.display, fontSize: 16, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  rowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 50 },
  footStrong: { fontFamily: fonts.bodySemi, color: mz.ink },
  cashOut: { height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: mz.sandDeep, justifyContent: 'center' },
  cashOutText: { fontFamily: fonts.bodySemi, fontSize: 13, color: mz.ink, fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: mz.hairline, marginLeft: 66 },
});
