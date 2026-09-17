// Renqun's bottom bar: a white dock with the four places, and the bet button beside it.
//
// The open tab widens into a sand pill with its name; the others are quiet outline icons, and
// the chosen one takes a heavier line and one solid detail. Red is kept for the one next action, the bet button, and the thin ring
// around it is the current 5-minute round running down, so the bar also tells you how long is
// left to get in.
import { useEffect } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { lift, mz } from '../../lib/mezo/theme';
import { clock } from '../../lib/mezo/format';
import { tradable } from '../../lib/mezo/client';
import { useMarkets, useNow } from '../../lib/mezo/hooks';

type Glyph = 'markets' | 'portfolio' | 'wallet' | 'settings';

const TABS: Record<string, { label: string; glyph: Glyph }> = {
  index: { label: 'Markets', glyph: 'markets' },
  positions: { label: 'Portfolio', glyph: 'portfolio' },
  wallet: { label: 'Wallet', glyph: 'wallet' },
  more: { label: 'Settings', glyph: 'settings' },
};

const H = 60; // dock height; the bet button matches it
const CORE = 42; // the red button inside the ring
const RING_R = 27;
const RING_W = 2.5;
const RING_C = 2 * Math.PI * RING_R;
const ROUND_MS = 5 * 60_000;
const IDLE = '#7A716A'; // warm grey, 4.8:1 on white

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const spring = LinearTransition.springify().damping(20).stiffness(220);

export function MezoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeKey = state.routes[state.index]?.key;
  const routes = state.routes.filter((r) => TABS[r.name]);

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={styles.dock} accessibilityRole="tablist">
        {routes.map((route) => {
          const focused = route.key === activeKey;
          const tab = TABS[route.name];
          const onPress = () => {
            haptic('light');
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Animated.View key={route.key} layout={spring} style={[styles.tab, focused && styles.tabOn]}>
              <Pressable
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.label}
                hitSlop={4}
                style={styles.tabHit}
              >
                <TabGlyph name={tab.glyph} on={focused} />
                {focused ? (
                  <Animated.Text entering={FadeIn.duration(180).delay(80)} exiting={FadeOut.duration(90)} numberOfLines={1} style={styles.label}>
                    {tab.label}
                  </Animated.Text>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <BetButton />
    </View>
  );
}

/** The next action: opens the ticket on the round the ring is counting down. */
function BetButton() {
  const router = useRouter();
  const now = useNow(1000);
  const markets = useMarkets();
  // Same pick as the ticket: the soonest round that still leaves time to decide.
  const open = tradable(markets.data ?? [], '5m', now);
  const round = open.find((m) => m.expiry - now > 120_000) ?? open[0] ?? null;
  const left = round ? round.expiry - now : 0;
  const target = round ? Math.min(1, Math.max(0, left / ROUND_MS)) : 0;

  const progress = useSharedValue(target);
  useEffect(() => {
    // A new round refills the ring quickly; otherwise it runs down second by second.
    const refill = target > progress.value + 0.05;
    progress.value = withTiming(target, { duration: refill ? 500 : 1000, easing: refill ? Easing.out(Easing.cubic) : Easing.linear });
  }, [target, progress]);
  const ring = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - progress.value) }));

  return (
    <PressableScale
      haptic="medium"
      scaleTo={0.93}
      onPress={() => router.push('/mezo/bet')}
      accessibilityRole="button"
      accessibilityLabel={round ? `Place a bet. This round closes in ${clock(left)}` : 'Place a bet'}
      style={styles.bet}
    >
      <Svg width={H} height={H} style={styles.ring}>
        <Circle cx={H / 2} cy={H / 2} r={RING_R} stroke={mz.sandDeep} strokeWidth={RING_W} fill="none" />
        <AnimatedCircle
          cx={H / 2}
          cy={H / 2}
          r={RING_R}
          stroke={mz.red}
          strokeWidth={RING_W}
          strokeLinecap="round"
          strokeDasharray={`${RING_C} ${RING_C}`}
          animatedProps={ring}
          fill="none"
          // start at twelve o'clock
          transform={`rotate(-90 ${H / 2} ${H / 2})`}
        />
      </Svg>
      <View style={styles.core}>
        {/* the top figure of the Renqun mark: one person, heading up */}
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d="M5.5 17.5 12 9.5l6.5 8" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Circle cx={12} cy={4.6} r={2.2} fill="#FFFFFF" />
        </Svg>
      </View>
    </PressableScale>
  );
}

/** Outline when idle; when chosen, a heavier line and one solid detail. 24-unit grid. */
function TabGlyph({ name, on }: { name: Glyph; on: boolean }) {
  const c = on ? mz.ink : IDLE;
  const line = { stroke: c, strokeWidth: on ? 2.1 : 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      {name === 'markets' && (
        <>
          <Path d="M3.5 17 8.5 11.5 12.5 14.5 19.5 7.5" {...line} />
          <Circle cx={19.5} cy={7.5} r={on ? 2.4 : 1.6} fill={c} />
        </>
      )}
      {name === 'portfolio' && (
        <>
          <Circle cx={12} cy={12} r={8.25} {...line} />
          {on ? <Path d="M12 12V3.75A8.25 8.25 0 0 1 20.25 12Z" fill={c} /> : <Path d="M12 3.75V12h8.25" {...line} />}
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect x={3.5} y={6} width={17} height={13.5} rx={3.5} {...line} />
          <Path d="M20.5 10.25h-3.75a2.5 2.5 0 0 0 0 5h3.75" {...line} fill={on ? c : 'none'} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Path d="M4 8h16M4 16h16" {...line} />
          <Circle cx={9} cy={8} r={2.4} {...line} fill={on ? c : '#FFFFFF'} />
          <Circle cx={15} cy={16} r={2.4} {...line} fill={on ? c : '#FFFFFF'} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dock: {
    flex: 1,
    maxWidth: 440,
    height: H,
    borderRadius: H / 2,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: mz.card,
    ...lift,
    shadowOpacity: 0.12,
  },
  tab: { height: 44, borderRadius: 22 },
  tabOn: { backgroundColor: mz.sandDeep },
  tabHit: { height: 44, minWidth: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13.5, letterSpacing: -0.1, color: mz.ink },

  bet: {
    width: H,
    height: H,
    borderRadius: H / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mz.card,
    ...lift,
    shadowOpacity: 0.12,
  },
  ring: { position: 'absolute', top: 0, left: 0 },
  core: {
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mz.red,
  },
});
