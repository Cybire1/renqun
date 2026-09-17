// The bet ticket on Mezo, a sheet sized to its content. Opened from UP / DOWN on Markets (with a
// market and side) or from the bet button in the dock (the soonest round with time left).
//
// Flow: pick a side, set the amount, read the contract's own quote as "if you win", allow MUSD
// once, swipe to bet.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { PressableScale, haptic } from '../../lib/motion';
import { fonts } from '../../lib/theme';
import { mz, r, type } from '../../lib/mezo/theme';
import { hhmm, money, musd, pct, timeWords, usd0 } from '../../lib/mezo/format';
import {
  WAD,
  ENTRY_BAND,
  bettable,
  fetchMarket,
  inEntryBand,
  friendlyError,
  isPriceMove,
  maxCostFor,
  maxStakeFor,
  mintedFrom,
  quoteStake,
  rememberPosition,
  roundName,
  sideRange,
  toWad,
  tradable,
  txApproveMusd,
  txMint,
  type Market,
  type Side,
} from '../../lib/mezo/client';
import { refreshMezo, useBalances, useCapacity, useMarkets, useMezoAddress, useNow, useOdds, usePoll } from '../../lib/mezo/hooks';
import { dripAvailable } from '../../lib/mezo/funding';
import { TxRevertedError, broadcastTx, sendTx } from '../../lib/mezo/wallet';
import { explorerTx } from '../../lib/mezo/network';
import { Button, Countdown, Divider, Glyph, Pill, Tri } from '../../components/mezo/ui';
import { SwipeToBet } from '../../components/mezo/SwipeToBet';

const CHIPS: { label: string; add: number | 'max' }[] = [
  { label: '+1', add: 1 },
  { label: '+5', add: 5 },
  { label: '+20', add: 20 },
  { label: 'Max', add: 'max' },
];

interface Placed {
  side: Side;
  quantity: bigint;
  cost: bigint;
  strike: number;
  expiry: number;
  hash: string;
  /** False from broadcast until the block lands. */
  confirmed: boolean;
}

export default function BetSheet() {
  // `line` / `lineUsd`: a yes/no question at that price (from Just ask) instead of the round's Up line.
  const params = useLocalSearchParams<{ market?: string; side?: string; line?: string; lineUsd?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addr = useMezoAddress();
  const now = useNow(1000);
  const markets = useMarkets();
  const balances = useBalances(addr);
  const walletMusd = balances.data?.musd ?? null;

  const [side, setSide] = useState<Side>(params.side === 'down' ? 'down' : 'up');
  const [marketId, setMarketId] = useState<bigint | null>(params.market ? BigInt(params.market) : null);
  const [amount, setAmountRaw] = useState('10');
  const amountEdited = useRef(false);
  const setAmount = (v: string) => {
    amountEdited.current = true;
    setAmountRaw(v);
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  // Open on an amount the wallet can pay: 10 MUSD, or the whole MUSD it holds if that is less.
  useEffect(() => {
    if (amountEdited.current || walletMusd == null || walletMusd >= 10n * WAD || walletMusd < WAD) return;
    setAmountRaw(String(walletMusd / WAD));
  }, [walletMusd]);

  // The dock's bet button opens the soonest round that still leaves time to decide.
  const soonest = useMemo(() => {
    const open = tradable(markets.data ?? [], '5m', now);
    // Two minutes out, both sides still have real odds; the final minute tends to be one-sided.
    return open.find((m) => m.expiry - now > 120_000) ?? open[0] ?? null;
  }, [markets.data, now]);
  // Opened from the dock: keep following the best round as fresh data arrives, until the player
  // picks something themselves (cached data can briefly offer a round that is nearly over).
  const [userPicked, setUserPicked] = useState(params.market != null);
  useEffect(() => {
    if (!userPicked && soonest && soonest.id !== marketId) setMarketId(soonest.id);
  }, [userPicked, soonest, marketId]);

  const marketPoll = usePoll<Market>(marketId != null ? () => fetchMarket(marketId) : null, 10_000, `market:${marketId}`);
  const market = marketPoll.data && marketPoll.data.id === marketId ? marketPoll.data : null;
  // New bets stop 30 s before the close (BETTING_CUTOFF_MS); the round still settles as usual.
  const closed = market ? !bettable(market, now) : false;
  const ask = params.line != null;
  const lineTick = ask ? BigInt(params.line!) : (market?.strikeTick ?? 0n);
  const lineUsd = ask ? Number(params.lineUsd) : (market?.strike ?? 0);
  const sideName = (s: Side) => (ask ? (s === 'up' ? 'Yes' : 'No') : s === 'up' ? 'Up' : 'Down');
  const liveOdds = useOdds(closed ? null : market, ask ? lineTick : undefined);
  const odds = closed ? null : liveOdds;
  const nextRound = useMemo(
    () => (market && !ask ? tradable(markets.data ?? [], market.cadence, now).find((m) => m.id !== market.id) ?? null : null),
    [markets.data, market, now, ask],
  );

  const stake = toWad(parseFloat(amount.replace(',', '.')));
  const [lower, upper] = market ? sideRange(side, lineTick) : [0n, 0n];
  const quoteKey = `${market?.id}:${lineTick}:${side}:${stake}`;
  const quote = usePoll(
    market && stake > 0n && !closed ? async () => ({ key: quoteKey, q: await quoteStake(market, lower, upper, stake) }) : null,
    5_000,
    `quote:${quoteKey}`,
    { keepData: true },
  );
  // A closed round has no price; never leave its last quote on screen.
  const q = closed ? null : (quote.data?.q ?? null);
  const fresh = quote.data?.key === quoteKey;

  const bal = balances.data;
  const capacity = useCapacity();
  const chance = odds ? (side === 'up' ? odds.up : odds.down) : null;
  // The pool can only take so much on one round; show that as the Max instead of letting the swipe fail.
  const poolMax = capacity.data && chance != null ? maxStakeFor(capacity.data.free, chance) : null;
  const tooMuch = bal ? stake > bal.musd : false;
  const overPool = poolMax != null && stake > poolMax;
  // Gas is topped up automatically when a drip is configured; otherwise the wallet needs its own BTC.
  const noGas = bal ? bal.btc === 0n && !dripAvailable() : false;
  const tooSmall = q ? q.quantity === 0n || q.premium < WAD : stake > 0n && stake < WAD;
  // A side priced outside the venue's band cannot be bought; say so before the swipe, not after.
  const lopsided = chance != null && (chance > ENTRY_BAND.max || chance < ENTRY_BAND.min);
  // The most a swipe can spend: the slippage bound, never more than the wallet holds.
  const capCost = (cost: bigint, quantity: bigint) => {
    const max = maxCostFor(cost, quantity);
    return bal && max > bal.musd ? bal.musd : max;
  };

  const addChip = (c: (typeof CHIPS)[number]) => {
    haptic('light');
    setUserPicked(true);
    setError(null);
    if (c.add === 'max') {
      if (!bal) return;
      const max = poolMax != null && poolMax < bal.musd ? poolMax : bal.musd;
      setAmount((Number(max / 10n ** 16n) / 100).toFixed(2));
      return;
    }
    const cur = parseFloat(amount.replace(',', '.')) || 0;
    setAmount(String(Math.round((cur + c.add) * 100) / 100));
  };

  // One swipe does everything: a first bet also allows MUSD (two transactions, one gesture), and the
  // ticket turns into the confirmation the moment the bet is broadcast.
  const place = async () => {
    if (!market || !addr) return;
    Keyboard.dismiss();
    setError(null);
    try {
      let firstBet = false;
      // A fast round can move past the price bound between the quote and the block. That is not the
      // player's problem: quote again and resend, up to twice, before saying so.
      for (let attempt = 0; ; attempt++) {
        const live = await quoteStake(market, lower, upper, stake);
        if (live.quantity === 0n) throw new Error('PremiumTooSmall');
        if (!(await inEntryBand(Number(live.premium) / Number(live.quantity)))) throw new Error('PriceOutOfBand');
        const maxCost = capCost(live.cost, live.quantity);
        if (attempt === 0) {
          firstBet = (bal?.allowance ?? 0n) < maxCost;
          setBusy(firstBet ? 'Setting up your first bet…' : 'Placing…');
          // A first bet sends the approval and the bet back to back: same block, no extra wait.
          if (firstBet) await broadcastTx(txApproveMusd());
        }
        const base = { side, quantity: live.quantity, cost: live.cost, strike: lineUsd, expiry: market.expiry };
        let receipt: Awaited<ReturnType<typeof sendTx>>;
        try {
          receipt = await sendTx(txMint(market.id, lower, upper, live.quantity, maxCost), {
            afterPending: firstBet && attempt === 0,
            onSent: (hash) => {
              if (attempt === 0) haptic('success');
              setPlaced({ ...base, hash, confirmed: false });
            },
          });
        } catch (e) {
          if (attempt < 2 && (e instanceof TxRevertedError || isPriceMove(e))) continue;
          throw e;
        }
        const minted = mintedFrom(receipt.logs);
        if (minted) await rememberPosition(addr, minted.id);
        setPlaced({ ...base, cost: minted?.cost ?? base.cost, hash: receipt.transactionHash, confirmed: true });
        refreshMezo();
        return;
      }
    } catch (e) {
      haptic('warning');
      setPlaced(null);
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const pad = { paddingBottom: Math.max(insets.bottom, 16) + 8 };

  if (placed) {
    return <PlacedView placed={placed} now={now} ask={ask} style={pad} onDone={() => router.back()} onPortfolio={() => router.dismissTo('/(tabs)/positions')} />;
  }

  let blocker: string | null = null;
  if (!market) blocker = markets.loading || marketPoll.loading ? 'Loading the round…' : 'No round is open right now';
  else if (closed) blocker = 'Betting closed for this round';
  else if (lopsided) {
    const name = sideName(side);
    blocker = chance! > ENTRY_BAND.max ? `${name} is all but certain now` : `${name} has almost no chance now`;
  }
  else if (stake === 0n) blocker = 'Enter an amount';
  else if (tooMuch) blocker = 'Not enough MUSD';
  else if (overPool) blocker = `Max ${money(Number(poolMax) / 1e18)} on this round`;
  else if (tooSmall) blocker = 'Minimum 1 MUSD';
  else if (noGas) blocker = 'Needs BTC for gas';

  const up = side === 'up';
  const multiple = q && q.cost > 0n ? Number(q.quantity) / Number(q.cost) : null;

  return (
    <View style={[styles.sheet, pad]}>
      {/* side */}
      <View style={styles.sides} accessibilityRole="radiogroup">
        {(['up', 'down'] as const).map((k) => {
          const on = side === k;
          const chance = odds ? pct(k === 'up' ? odds.up : odds.down) : '—';
          const fg = on ? (k === 'up' ? mz.greenText : mz.downText) : mz.text3;
          return (
            <PressableScale
              key={k}
              haptic="light"
              scaleTo={0.97}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${sideName(k)}, ${chance} chance`}
              onPress={() => {
                setSide(k);
                setUserPicked(true);
                setError(null);
              }}
              style={[styles.side, on ? (k === 'up' ? styles.sideUpOn : styles.sideDownOn) : styles.sideOff]}
            >
              {ask ? null : <Tri dir={k} size={10} color={fg} />}
              <Text style={[styles.sideText, { color: fg }]}>{sideName(k)}</Text>
              <Text style={[styles.sideChance, { color: fg }]}>{chance}</Text>
            </PressableScale>
          );
        })}
      </View>

      {/* what you're betting on */}
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={ask ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {market
              ? ask
                ? `Bitcoin above ${usd0(lineUsd)} at ${timeWords(market.expiry, now)}?`
                : `BTC ${up ? 'above' : 'at or below'} ${usd0(market.strike)}`
              : 'BTC · next round'}
          </Text>
          <Text style={type.small}>
            {market ? (ask ? "Yes pays if it is, No if it isn't." : `${roundName(market.cadence)} round · closes ${hhmm(market.expiry)}`) : ' '}
          </Text>
        </View>
        {market ? <Countdown msLeft={market.expiry - now} /> : null}
      </View>

      {/* amount */}
      <View style={styles.amountBlock}>
        <View style={styles.amountRow}>
          <TextInput
            value={amount}
            onChangeText={(t) => {
              setAmount(t.replace(/[^0-9.,]/g, ''));
              setError(null);
            }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={9}
            style={[styles.amount, tooMuch && { color: mz.text3 }]}
            accessibilityLabel="Bet amount in MUSD"
          />
          <Text style={styles.unit}>MUSD</Text>
        </View>
        <Text style={[type.small, (tooMuch || overPool) && { color: mz.ink, fontFamily: fonts.bodySemi }]}>
          Balance {bal ? musd(bal.musd) : '—'}
          {poolMax != null && bal && poolMax < bal.musd ? ` · max ${money(Number(poolMax) / 1e18)}` : ''}
        </Text>
        <View style={styles.chips}>
          {CHIPS.map((c) => (
            <PressableScale
              key={c.label}
              haptic="none"
              scaleTo={0.94}
              onPress={() => addChip(c)}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel={c.add === 'max' ? 'Bet your whole balance' : `Add ${c.add} MUSD`}
            >
              <Text style={styles.chipText}>{c.label}</Text>
            </PressableScale>
          ))}
        </View>
      </View>

      {/* payoff */}
      <View style={[styles.payoff, { opacity: q && !fresh ? 0.6 : 1 }]}>
        <View style={styles.payoffTop}>
          <View>
            <Text style={type.label}>If you win</Text>
            <Text style={styles.win}>
              {q ? money(Number(q.quantity) / 1e18) : '—'}
              <Text style={styles.winUnit}> MUSD</Text>
            </Text>
          </View>
          {multiple ? (
            <Pill text={`${multiple.toFixed(2)}×`} fg={up ? mz.greenText : mz.downText} bg={up ? mz.upSoft : mz.downSoft} />
          ) : null}
        </View>
        <Divider style={{ marginVertical: 12 }} />
        <View style={styles.line}>
          <Text style={type.label}>You pay · incl. 1% fee</Text>
          <Text style={type.digitsBold}>{q ? money(Number(q.cost) / 1e18) : '—'}</Text>
        </View>
        {tooMuch ? null : (
          <View style={styles.line}>
            <Text style={type.label}>Max if the price moves</Text>
            <Text style={type.digits}>{q ? money(Number(capCost(q.cost, q.quantity)) / 1e18) : '—'}</Text>
          </View>
        )}
      </View>

      {/* action */}
      <View style={styles.action}>
        {(closed || lopsided) && nextRound ? (
          <Button
            tone="soft"
            label={`Bet on the ${hhmm(nextRound.expiry)} round`}
            onPress={() => {
              setMarketId(nextRound.id);
              setUserPicked(true);
              setError(null);
            }}
          />
        ) : blocker ? (
          <>
            <Button tone="muted" disabled label={blocker} onPress={() => {}} />
            {tooMuch || noGas ? (
              <Button tone="red" label="Add MUSD" haptic="light" onPress={() => router.push('/mezo/fund')} />
            ) : null}
          </>
        ) : (
          <SwipeToBet
            tone={up ? 'green' : 'ink'}
            label={`Swipe to bet ${sideName(side)} · ${q ? money(Number(q.cost) / 1e18) : amount}`}
            busy={busy !== null}
            busyLabel={busy ?? 'Placing…'}
            disabled={!q || !fresh || busy !== null}
            onConfirm={place}
          />
        )}
        {error ? (
          <Animated.Text entering={FadeIn} style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

function PlacedView({
  placed,
  now,
  ask,
  style,
  onDone,
  onPortfolio,
}: {
  placed: Placed;
  now: number;
  ask: boolean;
  style: object;
  onDone: () => void;
  onPortfolio: () => void;
}) {
  const up = placed.side === 'up';
  return (
    <View style={[styles.sheet, style]}>
      <View style={styles.placed}>
        <Animated.View entering={ZoomIn.springify().damping(13)} style={[styles.check, { backgroundColor: up ? mz.upSoft : mz.downSoft }]}>
          {placed.confirmed ? (
            <Glyph name="check" size={38} color={up ? mz.greenText : mz.downText} weight={2.6} />
          ) : (
            <ActivityIndicator color={up ? mz.greenText : mz.downText} />
          )}
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(80)} style={styles.placedTitle} accessibilityRole="header" accessibilityLiveRegion="polite">
          {placed.confirmed ? "You're in" : 'Placing your bet'}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(140)} style={styles.placedBody}>
          {ask ? (up ? 'Yes' : 'No') : up ? 'Up' : 'Down'} pays <Text style={{ fontFamily: fonts.bodySemi, color: mz.ink }}>{musd(placed.quantity)} MUSD</Text> if Bitcoin is{' '}
          {up ? 'above' : 'at or below'} {usd0(placed.strike)} at {ask ? timeWords(placed.expiry, now) : hhmm(placed.expiry)}.
        </Animated.Text>
        <Animated.View entering={FadeInDown.delay(200)} style={styles.placedMeta}>
          <Countdown msLeft={placed.expiry - now} />
          <Text style={type.small}>{placed.confirmed ? `Paid ${musd(placed.cost)} MUSD with the fee` : 'Confirming on Mezo…'}</Text>
        </Animated.View>
        <PressableScale haptic="light" onPress={() => Linking.openURL(explorerTx(placed.hash))} accessibilityRole="link" style={styles.explorer}>
          <Text style={styles.link}>View on the Mezo explorer</Text>
          <Glyph name="external" size={14} color={mz.ink} />
        </PressableScale>
      </View>
      <View style={{ gap: 10 }}>
        <Button tone="red" label="See it in Portfolio" onPress={onPortfolio} />
        <Button tone="soft" label="Done" haptic="light" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: mz.card, paddingHorizontal: 20, paddingTop: 24 },

  sides: { flexDirection: 'row', gap: 8 },
  // Same tinted pattern as the Up / Down buttons on Markets, at control size.
  side: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sideUpOn: { backgroundColor: mz.upSoft, borderColor: mz.upLine },
  sideDownOn: { backgroundColor: mz.downSoft, borderColor: mz.downLine },
  sideOff: { backgroundColor: 'transparent', borderColor: mz.line },
  sideText: { fontFamily: fonts.bodySemi, fontSize: 15 },
  sideChance: { fontFamily: fonts.bodyMed, fontSize: 14, fontVariant: ['tabular-nums'] },

  head: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5, color: mz.black, marginBottom: 2 },

  amountBlock: { marginTop: 20, alignItems: 'center', gap: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  amount: { minWidth: 60, fontFamily: fonts.display, fontSize: 60, letterSpacing: -2, color: mz.black, textAlign: 'center', paddingVertical: 0, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.bodySemi, fontSize: 16, color: mz.text3 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { minWidth: 66, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: mz.sandDeep, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 15, color: mz.ink },

  payoff: { marginTop: 20, padding: 16, borderRadius: r.row + 2, backgroundColor: mz.well },
  payoffTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  win: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.8, color: mz.black, fontVariant: ['tabular-nums'], marginTop: 2 },
  winUnit: { fontFamily: fonts.bodySemi, fontSize: 15, color: mz.text3, letterSpacing: 0 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },

  action: { marginTop: 18, gap: 10 },
  error: { textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink },

  placed: { alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 28, paddingHorizontal: 8 },
  check: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  placedTitle: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.8, color: mz.black },
  placedBody: { textAlign: 'center', fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: mz.text2, maxWidth: 320 },
  placedMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explorer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: mz.ink, textDecorationLine: 'underline', textDecorationColor: mz.red },
});
