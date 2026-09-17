// "Just ask": plain yes/no questions about where Bitcoin will be later today. The "later today" round
// (it closes at the next pool update) carries a few questions at round-number prices near spot; Yes
// pays above the price, No at or below it. A tap opens the bet sheet on that question.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressableScale } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz, type } from '../../lib/mezo/theme';
import { clock, pct, timeWords, usd0 } from '../../lib/mezo/format';
import { bettable, questionLines, type Market, type Side } from '../../lib/mezo/client';
import { useLineOdds } from '../../lib/mezo/hooks';
import { Surface } from './ui';

export function JustAsk({ markets, spotUsd, now }: { markets: Market[]; spotUsd: number | null; now: number }) {
  const router = useRouter();
  const round = useMemo(
    () => markets.filter((m) => m.cadence === '1d' && bettable(m, now)).sort((a, b) => a.expiry - b.expiry)[0] ?? null,
    [markets, now],
  );

  // Keep the same questions while the price wanders near a boundary; move them once it has clearly left.
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => {
    if (spotUsd != null && (anchor == null || Math.abs(spotUsd - anchor) > 375)) setAnchor(spotUsd);
  }, [spotUsd, anchor]);
  const lines = useMemo(() => (round && anchor != null ? questionLines(round, anchor, 3) : []), [round, anchor]);
  const odds = useLineOdds(round, lines.map((l) => l.tick));

  // Questions priced outside the venue's 1–99% band cannot be bought; leave them out.
  const shown = lines.filter((l) => {
    const yes = odds?.get(l.tick.toString());
    return yes == null || (yes >= 0.01 && yes <= 0.99);
  });
  if (!round || shown.length === 0) return null;

  const open = (usd: number, tick: bigint, side: Side) =>
    router.push({
      pathname: '/mezo/bet',
      params: { market: round.id.toString(), side, line: tick.toString(), lineUsd: String(usd) },
    });

  return (
    <Animated.View entering={FadeInDown.delay(220).duration(320)} style={styles.section}>
      <View>
        <Text style={type.heading} accessibilityRole="header">
          Just ask
        </Text>
        <Text style={type.small}>Will Bitcoin be above a price later today? Yes or no.</Text>
      </View>
      {shown.map((l) => {
        const yes = odds?.get(l.tick.toString()) ?? null;
        return (
          <Surface key={l.tick.toString()} style={styles.card}>
            <View style={styles.top}>
              <View style={styles.coin}>
                <Text style={styles.coinText}>₿</Text>
              </View>
              <Text style={type.label}>Bitcoin</Text>
              <Text style={styles.clock}>{clock(round.expiry - now)}</Text>
            </View>
            <Text style={styles.question}>
              Will Bitcoin be above {usd0(l.usd)} at {timeWords(round.expiry, now)}?
            </Text>
            <View style={styles.lean} accessibilityLabel={yes != null ? `${pct(yes)} chance of yes` : 'Loading odds'}>
              <View style={[styles.leanFill, { width: `${Math.round((yes ?? 0) * 100)}%` }]} />
            </View>
            <View style={styles.meta}>
              <Text style={type.small}>Closes {timeWords(round.expiry, now)}</Text>
              {yes != null ? (
                <Text style={type.small}>
                  <Text style={{ fontFamily: fonts.bodySemi, color: yes >= 0.5 ? mz.greenText : mz.downText }}>{pct(yes >= 0.5 ? yes : 1 - yes)}</Text>
                  {` lean ${yes >= 0.5 ? 'yes' : 'no'}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.answers}>
              <PressableScale
                haptic="medium"
                scaleTo={0.97}
                onPress={() => open(l.usd, l.tick, 'up')}
                accessibilityRole="button"
                accessibilityLabel={`Yes, ${yes != null ? Math.round(yes * 100) : ''} cents`}
                style={[styles.answer, { backgroundColor: mz.upSoft }]}
              >
                <Text style={[styles.answerText, { color: mz.greenText }]}>Yes</Text>
                <Text style={[styles.answerPrice, { color: mz.greenText }]}>{yes != null ? `${Math.round(yes * 100)}¢` : '—'}</Text>
              </PressableScale>
              <PressableScale
                haptic="medium"
                scaleTo={0.97}
                onPress={() => open(l.usd, l.tick, 'down')}
                accessibilityRole="button"
                accessibilityLabel={`No, ${yes != null ? Math.round((1 - yes) * 100) : ''} cents`}
                style={[styles.answer, { backgroundColor: mz.downSoft }]}
              >
                <Text style={[styles.answerText, { color: mz.downText }]}>No</Text>
                <Text style={[styles.answerPrice, { color: mz.downText }]}>{yes != null ? `${Math.round((1 - yes) * 100)}¢` : '—'}</Text>
              </PressableScale>
            </View>
          </Surface>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26, gap: 12 },
  card: { padding: 16, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coin: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F7931A', alignItems: 'center', justifyContent: 'center' },
  coinText: { fontFamily: fonts.bodySemi, fontSize: 13, color: '#FFFFFF' },
  clock: { marginLeft: 'auto', fontFamily: fonts.monoBold, fontSize: 13, color: mz.ink, fontVariant: ['tabular-nums'] },
  question: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: mz.black },
  lean: { height: 5, borderRadius: 3, backgroundColor: mz.downSoft, overflow: 'hidden' },
  leanFill: { height: '100%', borderRadius: 3, backgroundColor: mz.upThumb },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  answers: { flexDirection: 'row', gap: 8 },
  answer: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  answerText: { fontFamily: fonts.bodySemi, fontSize: 15 },
  answerPrice: { fontFamily: fonts.mono, fontSize: 14, fontVariant: ['tabular-nums'] },
});
