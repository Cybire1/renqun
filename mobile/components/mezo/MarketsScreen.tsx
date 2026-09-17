// Markets on Mezo. The round's question and the live BTC print lead; the chart is the round's
// picture, green above the UP line and ink below; UP and DOWN carry their own odds and payout.
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { LiveDot, PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz, r, type } from '../../lib/mezo/theme';
import { clock, hhmm, pays, pct, usd0 } from '../../lib/mezo/format';
import { bettable, liveRounds, type Cadence, type Market } from '../../lib/mezo/client';
import { useBalances, useMarkets, useMezoAddress, useNow, useOdds, useSpotSeries, useStarterFunds } from '../../lib/mezo/hooks';
import { isMezoOnboarded } from '../../lib/mezo/wallet';
import { MEZO_PREDICT_LIVE } from '../../lib/mezo/network';
import { Skeleton } from '../Skeleton';
import { LiveChart } from './LiveChart';
import { Countdown, EmptyState, Pill, Segmented, SideTile, Surface, Ticker, TopBar, Tri } from './ui';

const CADENCES: { key: Cadence; label: string; minutes: number }[] = [
  { key: '5m', label: '5 min', minutes: 5 },
  { key: '1h', label: '1 hour', minutes: 60 },
];

export function MezoMarketsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow(1000);
  const [cadence, setCadence] = useState<Cadence>('5m');
  const [pickedId, setPickedId] = useState<bigint | null>(null);
  const markets = useMarkets();
  const minutes = CADENCES.find((c) => c.key === cadence)!.minutes;
  const { series, spot } = useSpotSeries(minutes);

  useEffect(() => {
    let live = true;
    isMezoOnboarded().then((done) => {
      if (live && !done) router.push('/mezo/welcome');
    });
    return () => {
      live = false;
    };
  }, [router]);

  // The featured round stays on screen through its final seconds, so a bettor can watch the finish;
  // new bets move to the next round once betting closes (BETTING_CUTOFF_MS).
  const open = useMemo(() => liveRounds(markets.data ?? [], cadence, now), [markets.data, cadence, now]);
  const market = open.find((m) => m.id === pickedId) ?? open[0] ?? null;
  const upNext = open.filter((m) => m !== market);
  const canBet = market ? bettable(market, now) : false;
  const nextBettable = upNext.find((m) => bettable(m, now)) ?? null;

  // A testnet wallet with nothing in it gets its starter MUSD and gas without asking.
  const addr = useMezoAddress();
  const balances = useBalances(addr);
  const starter = useStarterFunds(addr, balances.data?.musd ?? null, balances.data?.btc ?? null);
  const recent = useMemo(
    () =>
      (markets.data ?? [])
        .filter((m) => m.cadence === cadence && m.status !== 'live' && m.status !== 'none')
        .sort((a, b) => b.expiry - a.expiry)
        .slice(0, 8),
    [markets.data, cadence],
  );
  const justClosed = recent[0] && now - recent[0].expiry < 90_000 ? recent[0] : null;

  const odds = useOdds(market);
  const distance = market && spot ? spot.usd - market.strike : null;

  const bet = (side: 'up' | 'down') => {
    if (!market) return;
    haptic('medium');
    router.push({ pathname: '/mezo/bet', params: { market: market.id.toString(), side } });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 132 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void markets.refresh()} tintColor={mz.text3} />}
      >
        <View style={styles.header}>
          <Text style={type.title} accessibilityRole="header">
            Bitcoin
          </Text>
          <Segmented
            items={CADENCES.map((c) => ({ key: c.key, label: c.label }))}
            value={cadence}
            onChange={(k) => {
              setCadence(k);
              setPickedId(null);
            }}
            height={34}
            style={{ width: 176 }}
          />
        </View>

        {justClosed ? <ClosedBanner market={justClosed} /> : null}

        {!MEZO_PREDICT_LIVE ? (
          <Surface>
            <EmptyState title="Renqun isn't live on this network yet" />
          </Surface>
        ) : market ? (
          <Animated.View key={market.id.toString()} entering={FadeIn.duration(260)}>
            <Surface style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.live}>
                  <LiveDot color={mz.red} size={7} />
                  <Text style={type.label}>{cadence === '5m' ? '5-minute round' : 'Hourly round'}</Text>
                </View>
                <Countdown msLeft={market.expiry - now} />
              </View>

              <Text style={styles.question} accessibilityRole="header">
                BTC above <Text style={{ color: mz.red }}>{usd0(market.strike)}</Text>?
              </Text>

              <View style={styles.scoreRow}>
                <Ticker value={spot?.usd ?? null} style={styles.spot} />
                {distance != null ? (
                  <Pill
                    text={distance === 0 ? 'On the line' : `${usd0(Math.abs(distance))} ${distance > 0 ? 'above' : 'below'}`}
                    fg={distance > 0 ? mz.greenText : mz.downText}
                    bg={distance > 0 ? mz.upSoft : mz.downSoft}
                    icon={distance !== 0 ? <Tri dir={distance > 0 ? 'up' : 'down'} size={9} color={distance > 0 ? mz.greenText : mz.downText} /> : undefined}
                  />
                ) : null}
              </View>

              <View style={styles.chart}>
                <LiveChart series={series} strike={market.strike} windowMs={minutes * 60_000} height={196} />
              </View>

              <RoundProgress market={market} now={now} minutes={minutes} />
            </Surface>

            {canBet ? (
              <View style={styles.sides}>
                <SideButton side="up" chance={odds?.up ?? null} onPress={() => bet('up')} strike={market.strike} />
                <SideButton side="down" chance={odds?.down ?? null} onPress={() => bet('down')} strike={market.strike} />
              </View>
            ) : (
              <PressableScale
                haptic="light"
                scaleTo={0.98}
                disabled={!nextBettable}
                onPress={() => nextBettable && setPickedId(nextBettable.id)}
                accessibilityRole="button"
                style={styles.closedBar}
              >
                <Text style={type.strong}>Betting closed for this round</Text>
                <Text style={[type.small, { color: mz.ink }]}>
                  {nextBettable ? `Next: closes ${hhmm(nextBettable.expiry)} ›` : 'Next round opening…'}
                </Text>
              </PressableScale>
            )}
            {starter.state === 'working' ? <Text style={styles.starter}>Adding starter MUSD and gas to your wallet…</Text> : null}
            {starter.state === 'done' && starter.result?.musd ? (
              <Text style={styles.starter}>20 test MUSD added. You're ready to bet.</Text>
            ) : null}

            {recent.length ? (
              <Animated.View entering={FadeInDown.delay(120).duration(320)} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={type.heading}>Last rounds</Text>
                  <Text style={type.small}>
                    <Text style={{ color: mz.greenText, fontFamily: fonts.bodySemi }}>{recent.filter((m) => winnerOf(m) === 'up').length} up</Text>
                    {'  ·  '}
                    <Text style={{ color: mz.downText, fontFamily: fonts.bodySemi }}>{recent.filter((m) => winnerOf(m) === 'down').length} down</Text>
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recent}>
                  {recent.map((m) => (
                    <RecentChip key={m.id.toString()} market={m} />
                  ))}
                </ScrollView>
              </Animated.View>
            ) : null}

            {upNext.length ? (
              <Animated.View entering={FadeInDown.delay(180).duration(320)} style={styles.section}>
                <Text style={type.heading}>Up next</Text>
                <Surface style={{ paddingVertical: 4 }}>
                  {upNext.map((m, i) => (
                    <Animated.View key={m.id.toString()} layout={LinearTransition}>
                      {i > 0 ? <View style={styles.rowDivider} /> : null}
                      <PressableScale
                        haptic="light"
                        scaleTo={0.98}
                        onPress={() => setPickedId(m.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Show the round closing at ${hhmm(m.expiry)}`}
                        style={styles.nextRow}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={type.strong}>Closes {hhmm(m.expiry)}</Text>
                          <Text style={type.small}>UP line {usd0(m.strike)}</Text>
                        </View>
                        <Text style={type.digits}>{clock(m.expiry - now)}</Text>
                        <Text style={styles.chevron}>›</Text>
                      </PressableScale>
                    </Animated.View>
                  ))}
                </Surface>
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : markets.loading ? (
          <HeroSkeleton />
        ) : markets.error ? (
          <Surface>
            <EmptyState title="Mezo isn't answering" body="Pull down to try again." />
          </Surface>
        ) : (
          <Surface>
            <EmptyState
              title="The next round opens in a moment"
              body={`New ${cadence === '5m' ? '5-minute' : 'hourly'} rounds open on their own. This screen updates by itself.`}
            />
          </Surface>
        )}
      </ScrollView>
    </View>
  );
}

// A tinted fill, a thin border in the side's colour,
// and one centred line. Both sides carry the same weight, so neither reads as the default.
function SideButton({ side, chance, strike, onPress }: { side: 'up' | 'down'; chance: number | null; strike: number; onPress: () => void }) {
  const up = side === 'up';
  const fg = up ? mz.greenText : mz.downText;
  return (
    <PressableScale
      haptic="medium"
      scaleTo={0.97}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Bet ${up ? 'Up' : 'Down'}: BTC ${up ? 'above' : 'at or below'} ${usd0(strike)}. ${chance != null ? `${pct(chance)} chance, pays ${pays(chance)}` : ''}`}
      style={[styles.side, up ? styles.sideUp : styles.sideDown]}
    >
      <Tri dir={side} size={10} color={fg} />
      <Text style={[styles.sideLabel, { color: fg }]}>{up ? 'Up' : 'Down'}</Text>
      <Text style={[styles.sideChance, { color: fg }]}>{chance != null ? pct(chance) : '—'}</Text>
      {chance != null ? <Text style={[styles.sidePays, { color: fg }]}>{pays(chance)}</Text> : null}
    </PressableScale>
  );
}

function RoundProgress({ market, now, minutes }: { market: Market; now: number; minutes: number }) {
  const start = market.expiry - minutes * 60_000;
  const f = Math.min(1, Math.max(0, (now - start) / (minutes * 60_000)));
  return (
    <View style={styles.progress}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${f * 100}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={type.small}>{hhmm(start)}</Text>
        <Text style={[type.small, { color: mz.ink }]}>Closes {hhmm(market.expiry)}</Text>
      </View>
    </View>
  );
}

function winnerOf(m: Market): 'up' | 'down' | null {
  if (m.status !== 'settled' || m.settlement == null) return null;
  return m.settlement > m.strike ? 'up' : 'down';
}

function RecentChip({ market }: { market: Market }) {
  const w = winnerOf(market);
  const fg = w === 'up' ? mz.greenText : w === 'down' ? mz.downText : mz.text3;
  return (
    <View
      style={[styles.chip, { backgroundColor: w === 'up' ? mz.upSoft : w === 'down' ? mz.downSoft : mz.sandDeep }]}
      accessibilityLabel={`${hhmm(market.expiry)}: ${w ? `${w} won` : 'refunded'}`}
    >
      {w ? <Tri dir={w} size={9} color={fg} /> : <Text style={[styles.chipText, { color: fg }]}>–</Text>}
      <Text style={[styles.chipText, { color: fg }]}>{hhmm(market.expiry)}</Text>
    </View>
  );
}

function ClosedBanner({ market }: { market: Market }) {
  const w = winnerOf(market);
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.banner}>
      {w ? <SideTile side={w} size={28} /> : null}
      <Text style={[type.strong, { flex: 1, fontSize: 14 }]}>
        {w
          ? `${hhmm(market.expiry)} closed at ${usd0(market.settlement!)}. ${w === 'up' ? 'Up' : 'Down'} won.`
          : `${hhmm(market.expiry)} round refunded.`}
      </Text>
    </Animated.View>
  );
}

function HeroSkeleton() {
  return (
    <Surface style={[styles.hero, { gap: 14 }]}>
      <Skeleton width={140} height={14} radius={7} />
      <Skeleton width="85%" height={30} radius={8} />
      <Skeleton width={120} height={22} radius={8} />
      <Skeleton height={196} radius={14} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mz.sand },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 14 },

  hero: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  question: { ...type.hero, marginTop: 14 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  spot: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  chart: { marginTop: 12, marginHorizontal: -6 },

  progress: { marginTop: 12, gap: 8 },
  track: { height: 4, borderRadius: 2, backgroundColor: mz.sandDeep, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: mz.red },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },

  sides: { flexDirection: 'row', gap: 10, marginTop: 12 },
  closedBar: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: mz.sandDeep,
  },
  starter: { ...type.small, marginTop: 10, textAlign: 'center', color: mz.greenText },
  side: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sideUp: { backgroundColor: mz.upSoft, borderColor: mz.upLine },
  sideDown: { backgroundColor: mz.downSoft, borderColor: mz.downLine },
  sideLabel: { fontFamily: fonts.bodySemi, fontSize: 15 },
  sideChance: { fontFamily: fonts.bodySemi, fontSize: 15, fontVariant: ['tabular-nums'] },
  sidePays: { fontFamily: fonts.bodyMed, fontSize: 12, opacity: 0.7, fontVariant: ['tabular-nums'] },

  section: { marginTop: 26, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  recent: { gap: 8, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999 },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, fontVariant: ['tabular-nums'] },

  nextRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: mz.hairline, marginLeft: 16 },
  chevron: { fontFamily: fonts.displaySemi, fontSize: 20, color: mz.text3, marginLeft: 2 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: r.row,
    backgroundColor: mz.card,
  },
});
