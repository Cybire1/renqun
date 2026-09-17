// Launch moment. Plays once over the native-splash handoff: the Renqun mark springs in on
// sand, the wordmark rises beneath, then the whole cover fades to reveal the app. The native
// splash (also sand, same mark) sits underneath so the handoff has no flash.
//
// There used to be an expanding ring pulsing out of the vermilion dot. It drew the eye to a
// circle rather than to the mark, and on a screen this brief the only job is to get out of the
// way, so it is gone. What is left is the mark arriving and the name under it.
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { fonts } from '../lib/theme';
import { RenqunMark } from './RenqunMark';

// Mezo sand, the same as the native splash underneath.
const SAND = '#F4F0ED';
const MARK = 138;

export function LaunchScreen({ onDone }: { onDone: () => void }) {
  const markO = useSharedValue(0);
  const markS = useSharedValue(0.9);
  const word = useSharedValue(0);
  const cover = useSharedValue(1);

  useEffect(() => {
    markO.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) });
    markS.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.5)) });
    word.value = withDelay(560, withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) }));
    // hold on the finished mark, then fade the cover away and hand off to the app
    cover.value = withDelay(
      1220,
      withTiming(0, { duration: 380, easing: Easing.inOut(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(onDone)();
      }),
    );
  }, []);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const markStyle = useAnimatedStyle(() => ({ opacity: markO.value, transform: [{ scale: markS.value }] }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 7 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.cover, coverStyle]}>
      <Animated.View style={markStyle}>
        <RenqunMark size={MARK} />
      </Animated.View>
      <Animated.Text style={[styles.word, wordStyle]}>Renqun</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: SAND, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  word: { marginTop: 26, color: '#000000', fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.7 },
});
