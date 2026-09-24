'use client';
// The bet ticket. Same rules as the app's bet sheet: a fresh quote at the tap, the venue's 1–99% entry
// band and the pool's capacity checked before anything is signed, a price-move bound in cents with up
// to two re-quotes, and a confirmation that shows what the Minted event actually charged. Besides Up
// and Down, a round takes a range: a price band the close has to land in, picked from a short ladder
// around where Bitcoin is now.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ENTRY_BAND,
  WAD,
  bettable,
  explorerTx,
  friendlyError,
  hhmm,
  inEntryBand,
  isPriceMove,
  maxCostFor,
  maxStakeFor,
  mintedFrom,
  money,
  musd,
  pct,
  pays,
  quoteStake,
  rangeBands,
  bandOn,
  RANGE_WIDTH_USD,
  rememberPosition,
  roundName,
  timeWords,
  sideRange,
  toWad,
  txApproveMusd,
  txMint,
  usd0,
  type Band,
  type Market,
  type Side,
} from '@renqun/client';
import { useBalances, useBandOdds, useCapacity, usePoll } from '@/lib/hooks';
import { TxRevertedError, declined, useWallet } from '@/lib/wallet';
import { Button, Countdown, Glyph, Tri } from './ui';
import { useFunds } from './Providers';

const CHIPS = [
  { label: '+1', add: 1 },
  { label: '+5', add: 5 },
  { label: '+20', add: 20 },
] as const;

/** What a bet is on: above the line, at or below it, or inside a band. */
export type Call = Side | 'range';
export type BandUsd = { low: number; high: number };
const bandKey = (b: Band) => `${b.lower}-${b.higher}`;

interface Placed {
  side: Call;
  band: BandUsd | null;
  quantity: bigint;
  cost: bigint;
  strike: number;
  expiry: number;
  hash: string;
  confirmed: boolean;
}

export function Ticket({
  market,
  side,
  onSide,
  odds,
  now,
  nextRound,
  onPickNext,
  line,
  plain = false,
  spotUsd = null,
  band: bandUsd = null,
  onBand,
}: {
  market: Market | null;
  side: Call;
  onSide: (s: Call) => void;
  odds: { up: number; down: number } | null;
  now: number;
  nextRound: Market | null;
  onPickNext: (m: Market) => void;
  /** A yes/no question at this price instead of the round's own Up line. */
  line?: { tick: bigint; usd: number };
  /** Inside a dialog: no card or sticky wrapper. */
  plain?: boolean;
  /** BTC now, to lay the range ladder around it. */
  spotUsd?: number | null;
  /** The band picked for a range bet (kept by the page, so the chart can shade it). */
  band?: BandUsd | null;
  onBand?: (b: BandUsd) => void;
}) {
  const { address, send, openDialog } = useWallet();
  const { openFunds } = useFunds();
  const balances = useBalances(address);
  const capacity = useCapacity();
  const bal = balances.data;

  const [amount, setAmountRaw] = useState('10');
  const edited = useRef(false);
  const setAmount = (v: string) => {
    edited.current = true;
    setAmountRaw(v);
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  // Open on an amount the wallet can pay: 10 MUSD, or the whole MUSD it holds if that is less.
  const walletMusd = bal?.musd ?? null;
  useEffect(() => {
    if (edited.current || walletMusd == null || walletMusd >= 10n * WAD || walletMusd < WAD) return;
    setAmountRaw(String(walletMusd / WAD));
  }, [walletMusd]);

  const stake = toWad(parseFloat(amount.replace(',', '.')));
  const lineTick = line?.tick ?? market?.strikeTick ?? 0n;
  const lineUsd = line?.usd ?? market?.strike ?? 0;
  const ask = line != null;
  const rangeOn = side === 'range' && !ask;
  const sideName = (s: Call) => (s === 'range' ? 'Range' : ask ? (s === 'up' ? 'Yes' : 'No') : s === 'up' ? 'Up' : 'Down');

  // The ladder moves only when Bitcoin crosses a band edge, so it keys on the band it is in.
  const width = market ? RANGE_WIDTH_USD[market.cadence] : 1;
  const spotStep = spotUsd != null ? Math.floor(spotUsd / width) : null;
  const bands = useMemo(
    () => (rangeOn && market && spotStep != null ? rangeBands(market, spotStep * width + width / 2) : []),
    [rangeOn, market, spotStep, width],
  );
  const bandOdds = useBandOdds(rangeOn ? market : null, bands);
  const picked = rangeOn && market && bandUsd ? bandOn(market, bandUsd.low, bandUsd.high) : null;
  const band = rangeOn ? (picked ?? bands[Math.floor(bands.length / 2)] ?? null) : null;
  const bandChance = band ? (bandOdds?.get(bandKey(band)) ?? null) : null;

  const [lower, upper] = rangeOn ? (band ? [band.lower, band.higher] : [0n, 0n]) : market ? sideRange(side as Side, lineTick) : [0n, 0n];
  const quote = usePoll(
    market && stake > 0n ? () => quoteStake(market, lower, upper, stake) : null,
    6_000,
    `q:${market?.id}:${lower}:${upper}:${stake}`,
    { keepData: true },
  );
  const q = stake > 0n ? quote.data : null;

  const closed = !market || !bettable(market, now);
  const chance = rangeOn ? bandChance : odds ? (side === 'up' ? odds.up : odds.down) : null;
  const poolMax = capacity.data && chance != null ? maxStakeFor(capacity.data.free, chance) : null;
  const tooMuch = bal ? stake > bal.musd : false;
  const overPool = poolMax != null && stake > poolMax;
  const tooSmall = q ? q.quantity === 0n || q.premium < WAD : stake > 0n && stake < WAD;
  const lopsided = chance != null && (chance > ENTRY_BAND.max || chance < ENTRY_BAND.min);
  const capCost = (cost: bigint, quantity: bigint) => {
    const max = maxCostFor(cost, quantity);
    return bal && max > bal.musd ? bal.musd : max;
  };
  const multiple = q && q.cost > 0n ? Number(q.quantity) / Number(q.cost) : null;
  const up = side === 'up';
  const tone = rangeOn ? 'range' : up ? 'up' : 'down';

  const addChip = (add: number | 'max') => {
    setError(null);
    if (add === 'max') {
      if (!bal) return;
      const max = poolMax != null && poolMax < bal.musd ? poolMax : bal.musd;
      setAmount((Number(max / 10n ** 16n) / 100).toFixed(2));
      return;
    }
    const cur = parseFloat(amount.replace(',', '.')) || 0;
    setAmount(String(Math.round((cur + add) * 100) / 100));
  };

  const place = async () => {
    if (!market || !address) return;
    setError(null);
    try {
      // The first bet allows MUSD once; the wallet asks for that, then for the bet.
      const first = await quoteStake(market, lower, upper, stake);
      if (first.quantity === 0n) throw new Error('PremiumTooSmall');
      if ((bal?.allowance ?? 0n) < capCost(first.cost, first.quantity)) {
        setBusy('Allow MUSD in your wallet…');
        await send(txApproveMusd());
      }
      // A fast round can move past the price bound between the quote and the block. Quote again
      // and resend, up to twice, before saying so.
      for (let attempt = 0; ; attempt++) {
        const live = attempt === 0 ? first : await quoteStake(market, lower, upper, stake);
        if (live.quantity === 0n) throw new Error('PremiumTooSmall');
        if (!(await inEntryBand(Number(live.premium) / Number(live.quantity)))) throw new Error('PriceOutOfBand');
        setBusy(attempt === 0 ? 'Confirm the bet in your wallet…' : 'The price moved. Confirm again…');
        const base = { side, band: band ? { low: band.low, high: band.high } : null, quantity: live.quantity, cost: live.cost, strike: lineUsd, expiry: market.expiry };
        let receipt;
        try {
          receipt = await send(txMint(market.id, lower, upper, live.quantity, capCost(live.cost, live.quantity)), {
            onSent: (hash) => setPlaced({ ...base, hash, confirmed: false }),
          });
        } catch (e) {
          if (attempt < 2 && (e instanceof TxRevertedError || isPriceMove(e))) continue;
          throw e;
        }
        const minted = mintedFrom(receipt.logs);
        if (minted) await rememberPosition(address, minted.id);
        setPlaced({ ...base, cost: minted?.cost ?? base.cost, hash: receipt.transactionHash, confirmed: true });
        return;
      }
    } catch (e) {
      setPlaced(null);
      if (!declined(e)) setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const shell = plain ? 'ticket plain' : 'card ticket';

  if (placed) {
    return (
      <aside className={shell} aria-live="polite">
        <div className="placed">
          <span className="placed-mark">{placed.confirmed ? <Glyph name="check" size={28} color="#03703c" weight={2.6} /> : <span className="spinner" style={{ width: 24, height: 24, color: '#03703c' }} />}</span>
          <h2>{placed.confirmed ? "You're in" : 'Placing your bet'}</h2>
          <p className="body">
            {placed.side === 'range' && placed.band ? (
              <>
                Range pays <b className="strong">{musd(placed.quantity)} MUSD</b> if Bitcoin closes above {usd0(placed.band.low)} and at or below {usd0(placed.band.high)} at {hhmm(placed.expiry)}.
              </>
            ) : (
              <>
                {sideName(placed.side)} pays <b className="strong">{musd(placed.quantity)} MUSD</b> if Bitcoin is {placed.side === 'up' ? 'above' : 'at or below'} {usd0(placed.strike)} at {ask ? timeWords(placed.expiry, now) : hhmm(placed.expiry)}.
              </>
            )}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Countdown msLeft={placed.expiry - now} />
            <span className="small">{placed.confirmed ? `Paid ${musd(placed.cost)} MUSD with the fee` : 'Confirming on Mezo…'}</span>
          </div>
          <a className="link" href={explorerTx(placed.hash)} target="_blank" rel="noreferrer">
            View on the Mezo explorer
          </a>
          <div className="actions">
            <Link className="btn red block" href="/portfolio">
              See it in Portfolio
            </Link>
            <Button tone="soft" className="block" onClick={() => setPlaced(null)}>
              Place another
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  let blocker: string | null = null;
  if (rangeOn && !band) blocker = spotUsd == null ? 'Reading the price…' : 'Pick a band';
  else if (closed) blocker = 'Betting closed for this round';
  else if (stake === 0n) blocker = 'Enter an amount';
  else if (address && tooMuch) blocker = 'Not enough MUSD';
  else if (overPool && poolMax != null) blocker = `Max ${money(Number(poolMax) / 1e18)} on this round`;
  else if (lopsided) blocker = chance != null && chance > ENTRY_BAND.max ? `${sideName(side)} is all but certain now` : `${sideName(side)} has almost no chance now`;
  else if (tooSmall) blocker = 'Minimum 1 MUSD';

  return (
    <aside className={shell} aria-label="Bet ticket">
      {ask && market ? (
        <div className="ticket-round">
          <div>
            <h2>
              Bitcoin above {usd0(lineUsd)} at {timeWords(market.expiry, now)}?
            </h2>
            <div className="small">Yes pays if it is, No if it isn&apos;t.</div>
          </div>
        </div>
      ) : null}
      <div className={`sides${ask ? '' : ' three'}`} role="group" aria-label="Your call">
        {(['up', 'down'] as const).map((s) => (
          <button key={s} type="button" className={`side ${s}`} aria-pressed={side === s} onClick={() => onSide(s)}>
            {ask ? null : <Tri dir={s} size={11} />}
            {sideName(s)}
            <small>{odds ? pct(s === 'up' ? odds.up : odds.down) : '—'}</small>
          </button>
        ))}
        {ask ? null : (
          <button type="button" className="side range" aria-pressed={rangeOn} onClick={() => onSide('range')}>
            <i className="range-glyph" aria-hidden />
            Range
          </button>
        )}
      </div>

      {rangeOn ? (
        <div className="rb-list" role="radiogroup" aria-label="Where Bitcoin closes">
          {bands.length === 0 ? (
            <span className="small">{spotUsd == null ? 'Reading the price…' : 'No bands on this round'}</span>
          ) : (
            bands.map((b) => {
              const c = bandOdds?.get(bandKey(b)) ?? null;
              const on = band != null && bandKey(b) === bandKey(band);
              const here = spotUsd != null && spotUsd > b.low && spotUsd <= b.high;
              return (
                <button key={bandKey(b)} type="button" role="radio" aria-checked={on} className={`rb${on ? ' on' : ''}`} onClick={() => onBand?.({ low: b.low, high: b.high })}>
                  <span className="rb-range mono">
                    {usd0(b.low)} – {usd0(b.high)}
                    {here ? <i className="rb-here" title="Bitcoin is in this band now" aria-label="Bitcoin is here now" /> : null}
                  </span>
                  <span className="rb-bar" aria-hidden>
                    <i style={{ width: `${Math.round((c ?? 0) * 100)}%` }} />
                  </span>
                  <span className="rb-chance mono">{c != null ? pct(c) : '—'}</span>
                  <span className="rb-pays mono">{c != null && c >= 0.01 ? pays(c) : ''}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {ask ? null : (
        <div className="ticket-round">
          <div>
            <h2>
              {!market
                ? 'Next round'
                : rangeOn
                  ? band
                    ? `BTC between ${usd0(band.low)} and ${usd0(band.high)}`
                    : 'BTC inside a band'
                  : `BTC ${up ? 'above' : 'at or below'} ${usd0(market.strike)}`}
            </h2>
            <div className="small">
              {market
                ? rangeOn
                  ? `Pays if the close is above ${band ? usd0(band.low) : 'the low'} and at or below ${band ? usd0(band.high) : 'the high'} · closes ${hhmm(market.expiry)}`
                  : `${roundName(market.cadence)} round · closes ${hhmm(market.expiry)}`
                : 'Opening in a moment'}
            </div>
          </div>
          {market ? <Countdown msLeft={market.expiry - now} /> : null}
        </div>
      )}

      <div className="amount">
        <label className="amount-row" htmlFor="stake">
          <input
            id="stake"
            className={tooMuch ? 'over' : ''}
            value={amount}
            inputMode="decimal"
            maxLength={9}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.,]/g, ''));
              setError(null);
            }}
            onFocus={(e) => e.target.select()}
          />
          <span className="amount-unit">MUSD</span>
        </label>
        <span className="small">{bal ? `Balance ${musd(bal.musd)}` : address ? ' ' : 'Connect a wallet to bet'}</span>
      </div>

      <div className="chips">
        {CHIPS.map((c) => (
          <button key={c.label} type="button" className="chip" onClick={() => addChip(c.add)}>
            {c.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => addChip('max')} disabled={!bal}>
          Max
        </button>
      </div>

      <div className="well win">
        <div className="win-top">
          <div>
            <div className="label">If you win</div>
            <div className="win-value">
              {q ? money(Number(q.quantity) / 1e18) : '—'}
              <span className="unit">MUSD</span>
            </div>
          </div>
          {multiple ? <span className={`pill ${tone}`}>{multiple.toFixed(2)}×</span> : null}
        </div>
        <hr className="divider" />
        <div className="line">
          <span className="label">You pay · incl. 1% fee</span>
          <span className="mono strong">{q ? money(Number(q.cost) / 1e18) : '—'}</span>
        </div>
        {!tooMuch ? (
          <div className="line">
            <span className="label">Max if the price moves</span>
            <span className="mono">{q ? money(Number(capCost(q.cost, q.quantity)) / 1e18) : '—'}</span>
          </div>
        ) : null}
      </div>

      {error ? <p className="error-line">{error}</p> : null}

      {!address ? (
        <Button tone="red" className="block tall" onClick={openDialog}>
          Connect wallet
        </Button>
      ) : (closed || lopsided) && nextRound ? (
        <Button tone="soft" className="block tall" onClick={() => onPickNext(nextRound)}>
          Bet on the {hhmm(nextRound.expiry)} round
        </Button>
      ) : tooMuch ? (
        <>
          <Button tone="muted" className="block tall" disabled>
            Not enough MUSD
          </Button>
          <Button tone="red" className="block tall" onClick={openFunds}>
            Add MUSD
          </Button>
        </>
      ) : (
        <Button tone="red" className="block tall" busy={busy !== null} disabled={busy !== null || blocker !== null || !q} onClick={() => void place()}>
          {busy ?? blocker ?? `Bet ${sideName(side)} · ${q ? money(Number(q.cost) / 1e18) : amount}`}
        </Button>
      )}
    </aside>
  );
}
