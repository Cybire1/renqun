// First run on Mezo. The wallet is made on the phone, and on testnet the starter drip adds test MUSD
// and gas while this sheet is open, so "Start" leads straight to a first bet.
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { RenqunMark } from '../../components/RenqunMark';
import { Button, Glyph } from '../../components/mezo/ui';
import { haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz, type } from '../../lib/mezo/theme';
import { musd, shortAddr } from '../../lib/mezo/format';
import { IS_TESTNET } from '../../lib/mezo/network';
import { useBalances, useMezoAddress, useStarterFunds } from '../../lib/mezo/hooks';
import { markMezoOnboarded } from '../../lib/mezo/wallet';

type Step = 'done' | 'working' | 'todo' | 'failed';

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addr = useMezoAddress();
  const balances = useBalances(addr);
  const bal = balances.data;
  const starter = useStarterFunds(addr, bal?.musd ?? null, bal?.btc ?? null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (starter.state === 'done') haptic('success');
  }, [starter.state]);

  const funded = bal ? bal.musd >= 10n ** 18n : false;
  const fundStep: Step = funded ? 'done' : starter.state === 'working' ? 'working' : starter.state === 'failed' ? 'failed' : 'todo';

  const finish = async (to?: '/mezo/fund' | '/mezo/restore') => {
    setLeaving(true);
    await markMezoOnboarded();
    if (to) router.replace(to);
    else router.back();
  };

  return (
    <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24, gap: 22 }}>
      <Animated.View entering={FadeInDown.duration(320)} style={{ gap: 12 }}>
        <RenqunMark size={40} ink={mz.ink} dot={mz.red} />
        <Text style={styles.title} accessibilityRole="header">
          Call Bitcoin’s next move. Get paid in <Text style={{ color: mz.red }}>MUSD</Text>.
        </Text>
        <Text style={type.body}>Every 5 minutes, pick Up or Down.</Text>
      </Animated.View>

      <View style={styles.steps}>
        <StepRow state={addr ? 'done' : 'working'} title="Wallet ready" sub={addr ? shortAddr(addr) : 'Making it on this phone…'} />
        <StepRow
          state={fundStep}
          title={funded ? `${musd(bal!.musd)} MUSD to bet with` : IS_TESTNET ? 'Adding 20 test MUSD' : 'Add MUSD to start'}
          sub={
            funded
              ? 'Gas is covered for you'
              : fundStep === 'working'
                ? 'About 10 seconds'
                : fundStep === 'failed'
                  ? starter.error ?? 'The top-up did not go through'
                  : IS_TESTNET
                    ? 'Free on testnet'
                    : 'Swap BTC, or send from another wallet'
          }
          action={
            fundStep === 'failed' ? (
              <Button label="Retry" tone="soft" height={34} radius={999} haptic="light" onPress={() => void starter.retry()} style={{ paddingHorizontal: 14 }} />
            ) : !funded && fundStep === 'todo' ? (
              <Button label="Add" tone="soft" height={34} radius={999} haptic="light" onPress={() => void finish('/mezo/fund')} style={{ paddingHorizontal: 14 }} />
            ) : null
          }
        />
      </View>

      <View style={{ gap: 10 }}>
        <Button tone="red" label={funded ? 'Start betting' : 'Start'} busy={leaving} onPress={() => void finish()} />
        <Button tone="soft" label="I have a backup key" haptic="light" onPress={() => void finish('/mezo/restore')} />
      </View>
    </ScrollView>
  );
}

function StepRow({ state, title, sub, action }: { state: Step; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <Animated.View entering={FadeIn} style={styles.step}>
      <View style={[styles.mark, state === 'done' && { backgroundColor: mz.upSoft }]}>
        {state === 'done' ? (
          <Glyph name="check" size={16} color={mz.greenText} weight={2.6} />
        ) : state === 'working' ? (
          <ActivityIndicator size="small" color={mz.text3} />
        ) : (
          <View style={styles.hollow} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.strong}>{title}</Text>
        <Text style={type.small} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: mz.card },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.6, color: mz.black },
  steps: { gap: 14, padding: 16, borderRadius: 18, backgroundColor: mz.well },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: mz.sandDeep },
  hollow: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: mz.text3 },
});
