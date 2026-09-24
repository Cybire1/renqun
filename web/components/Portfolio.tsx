'use client';
// Portfolio: a ledger. A band of four figures says how the day is going — what is at stake, what it
// pays if it all lands, today's record, and what is waiting to be collected — then every bet is a
// row with its own status stripe, aligned figures and, while it runs, the time it has left.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  clock,
  fetchSpot,
  friendlyError,
  hhmm,
  isPriceMove,
  musd,
  positionLine,
  roundName,
  timeWords,
  quoteCashOut,
  txClaim,
  txRedeem,
  usd0,
  type Position,
} from '@renqun/client';
import { useBalances, useNow, usePoll, usePositions } from '@/lib/hooks';
import { TxRevertedError, declined, useWallet } from '@/lib/wallet';
import { Button, EmptyState, Segmented, Skeleton, Tri } from './ui';
import { RecordCard } from './RecordCard';
import { ShareButton } from './ShareButton';

type Tab = 'open' | 'settled';

/** How long a round of this cadence runs, for the drain bar on its row. */
const ROUND_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000, '1d': 6 * 60 * 60_000 } as const;

export function Portfolio() {
  const { address, send, openDialog } = useWallet();
  const now = useNow(1000);
  const positions = usePositions(address);
  const balances = useBalances(address);
  const spot = usePoll(fetchSpot, 4_000, 'spot-now');
  const [picked, setPicked] = useState<Tab | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => positions.data ?? [], [positions.data]);
  const open = useMemo(() => all.filter((p) => p.open && p.market.status === 'live'), [all]);
  const settled = useMemo(() => all.filter((p) => !(p.open && p.market.status === 'live')), [all]);
  const ready = useMemo(() => all.filter((p) => p.claimable != null && p.claimable > 0n), [all]);
  const readyTotal = ready.reduce((sum, p) => sum + (p.claimable ?? 0n), 0n);
  const inPlay = open.reduce((sum, p) => sum + p.premium, 0n);
  const couldPay = open.reduce((sum, p) => sum + p.quantity, 0n);
  const spotUsd = spot.data?.usd ?? null;
  const winning = open.filter((p) => spotUsd != null && p.winsAt(spotUsd)).length;

  // Today's record, from the rounds that have actually resolved.
  const today = useMemo(() => {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const done = settled.filter((p) => p.market.expiry >= dayStart && p.market.status === 'settled');
    const won = done.filter((p) => p.market.settlement != null && p.winsAt(p.market.settlement)).length;
    return { total: done.length, won, lost: done.length - won };
  }, [settled]);

  const multiple = inPlay > 0n ? Number(couldPay) / Number(inPlay) : 0;
  const tab: Tab = picked ?? (open.length === 0 && settled.length > 0 ? 'settled' : 'open');
  const list = tab === 'open' ? open : settled;
  const loading = positions.loading && !positions.data;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (!declined(e)) setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const claimAll = () => run('claim', () => send(txClaim(ready.map((p) => p.id))));
  // Re-price at the click: the number on the row can be seconds old on a fast round.
  const cashOut = (p: Position) =>
    run(`redeem:${p.id}`, async () => {
      for (let attempt = 0; ; attempt++) {
        const { minProceeds } = await quoteCashOut(p.id, p.quantity);
        try {
          return await send(txRedeem(p.id, minProceeds));
        } catch (e) {
          if (attempt < 2 && (e instanceof TxRevertedError || isPriceMove(e))) continue;
          throw e;
        }
      }
    });

  if (!address) {
    return (
      <div className="shell page">
        <div className="pf-head">
          <h1 className="title">Portfolio</h1>
        </div>
        <section className="card">
          <EmptyState
            title="Connect a wallet to see your bets"
            body="Open bets, what they could pay, and winnings to collect."
            action={
              <Button tone="red" onClick={openDialog}>
                Connect wallet
              </Button>
            }
          />
        </section>
      </div>
    );
  }

  return (
    <>
      <div className="shell">
        <div className="pf-head">
          <div>
            <span className="eyebrow pf-live">
              <i aria-hidden />
              {open.length === 0 ? 'Nothing running' : `${open.length} bet${open.length > 1 ? 's' : ''} running`}
            </span>
            <h1 className="title pf-title">Portfolio</h1>
          </div>
          <div className="pf-actions">
            <span className="pf-balance mono">
              {balances.data ? musd(balances.data.musd) : '—'}
              <em>MUSD</em>
            </span>
            <Link className="btn red" href="/markets">
              Open markets
            </Link>
          </div>
        </div>
      </div>

      {/* The four figures, each drawn as well as stated. */}
      <section className="pf-band" aria-label="How today is going">
        <div className="shell pf-band-inner">
          <div className="pf-fig wide">
            <span className="pf-k">At stake now</span>
            <span className="pf-v">
              {loading ? <Skeleton width={120} height={40} /> : musd(inPlay)}
              <em>MUSD</em>
            </span>
            {open.length ? (
              <span className="pf-bars" aria-hidden>
                {open.map((p) => (
                  <i
                    key={p.id.toString()}
                    className={spotUsd != null && p.winsAt(spotUsd) ? 'win' : 'behind'}
                    style={{ flexGrow: Number(p.premium) || 1 }}
                  />
                ))}
              </span>
            ) : null}
            <span className="pf-note">
              {open.length ? `across ${open.length} open bet${open.length > 1 ? 's' : ''} · ${winning} winning` : 'no open bets'}
            </span>
          </div>

          <div className="pf-fig">
            <span className="pf-k">If they all land</span>
            <span className={`pf-v${couldPay > 0n ? ' green' : ''}`}>
              {loading ? <Skeleton width={90} height={30} /> : open.length ? musd(couldPay) : '—'}
            </span>
            <span className="pf-note">{multiple > 0 ? `${multiple.toFixed(2)}× what is staked` : 'nothing running'}</span>
          </div>

          <div className="pf-fig">
            <span className="pf-k">Settled today</span>
            <span className="pf-v">{today.total}</span>
            {today.total ? (
              <span className="pf-bars" aria-hidden>
                <i className="win" style={{ flexGrow: today.won || 0.001 }} />
                <i className="behind" style={{ flexGrow: today.lost || 0.001 }} />
              </span>
            ) : null}
            <span className="pf-note">{today.total ? `${today.won} won · ${today.lost} lost` : 'none today'}</span>
          </div>

          <div className="pf-fig">
            <span className="pf-k">To collect</span>
            <span className="pf-v">{musd(readyTotal)}</span>
            {readyTotal > 0n ? (
              <Button tone="ink" className="sm" busy={busy === 'claim'} disabled={busy !== null} onClick={() => void claimAll()}>
                Collect all
              </Button>
            ) : (
              <span className="pf-note">nothing waiting</span>
            )}
          </div>
        </div>
      </section>

      <div className="shell page">
        {error ? <p className="error-line">{error}</p> : null}

        <RecordCard address={address} />

        <div className="pf-tabs">
          <Segmented
            label="Bets"
            items={[
              { key: 'open', label: 'Open', count: open.length },
              { key: 'settled', label: 'Settled', count: settled.length },
            ]}
            value={tab}
            onChange={setPicked}
          />
          <span className="pf-spot mono">{spotUsd != null ? `Bitcoin ${usd0(spotUsd)}` : ''}</span>
        </div>

        <section className="ledger" aria-live="polite">
          {loading ? (
            <div className="ledger-row">
              <Skeleton width="60%" height={20} />
            </div>
          ) : positions.error && !positions.data ? (
            <EmptyState title="Couldn't load your bets" body="Mezo isn't answering. This retries on its own." />
          ) : list.length === 0 ? (
            <EmptyState
              title={tab === 'open' ? 'No open bets' : 'No results yet'}
              body={tab === 'open' ? 'Pick Up or Down on a round and it shows here.' : 'Settled rounds show here with what they paid.'}
            />
          ) : (
            <>
              <div className="ledger-head" aria-hidden>
                <span />
                <span>Your call</span>
                <span>{tab === 'open' ? 'Closes' : 'Closed'}</span>
                <span>Stake</span>
                <span>Pays</span>
                <span>Now</span>
                <span />
              </div>
              {list.map((p) => (
                <Row key={p.id.toString()} p={p} now={now} spotUsd={spotUsd} busy={busy} onCashOut={() => void cashOut(p)} />
              ))}
            </>
          )}
        </section>

        <p className="pf-foot">
          Cashing out pays the live price, minus the 1% fee. Every bet is on the chain and readable on the explorer.
        </p>
      </div>
    </>
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

function Row({ p, now, spotUsd, busy, onCashOut }: { p: Position; now: number; spotUsd: number | null; busy: string | null; onCashOut: () => void }) {
  const m = p.market;
  const left = m.expiry - now;
  const live = p.open && m.status === 'live';
  const ahead = live && spotUsd != null && p.winsAt(spotUsd);

  let state: string;
  let tone: 'win' | 'behind' | 'flat';
  if (live && left <= 0) {
    state = 'Settling';
    tone = 'flat';
  } else if (live) {
    state = spotUsd == null ? '—' : ahead ? 'Winning' : 'Behind';
    tone = ahead ? 'win' : 'behind';
  } else if (p.cashedOut) {
    state = 'Cashed out';
    tone = 'flat';
  } else if (m.status === 'void') {
    state = p.open ? 'Refund ready' : 'Refunded';
    tone = 'flat';
  } else {
    const won = m.settlement != null && p.winsAt(m.settlement);
    // Stake and payout are shown truncated to the cent, so the gain is their difference as shown:
    // 2.18 paid on 1.99 reads +0.19, not the +0.18 the exact 0.185 truncates to.
    const cent = 10n ** 16n;
    const gain = (p.quantity / cent - p.premium / cent) * cent;
    state = won ? `+${musd(gain)}` : `−${musd(p.premium)}`;
    tone = won ? 'win' : 'behind';
  }

  const wonIt = !live && !p.cashedOut && m.status === 'settled' && m.settlement != null && p.winsAt(m.settlement);
  const total = ROUND_MS[m.cadence] ?? ROUND_MS['5m'];
  const remaining = Math.max(0, Math.min(1, left / total));

  return (
    <div className={`ledger-row ${tone}`}>
      <span className="ledger-stripe" aria-hidden />

      <span className="ledger-call">
        <span className={`side-tile ${p.side === 'range' ? 'range' : p.side}`}>
          {p.side !== 'range' ? <Tri dir={p.side} size={12} color={p.side === 'up' ? 'var(--green-text)' : 'var(--down-text)'} /> : <i className="range-glyph" />}
        </span>
        <span className="ledger-call-text">
          <b>
            <Link href={`/rounds/${m.id}`}>{callText(p)}</Link>
          </b>
          <small>{m.cadence === '1d' ? 'Later today' : roundName(m.cadence)}</small>
        </span>
      </span>

      <span className="ledger-when">
        {live ? (
          <>
            <b className="mono">{clock(Math.max(0, left))}</b>
            <span className="ledger-drain" aria-hidden>
              <i style={{ transform: `scaleX(${remaining})` }} />
            </span>
          </>
        ) : (
          <>
            <b className="mono">{hhmm(m.expiry)}</b>
            <small>{m.settlement != null ? usd0(m.settlement) : '—'}</small>
          </>
        )}
      </span>

      <span className="ledger-num mono">{musd(p.premium)}</span>
      <span className="ledger-num mono strong">{musd(p.quantity)}</span>
      <span className={`ledger-state ${tone}`}>{state}</span>

      <span className="ledger-action">
        {wonIt ? <ShareButton positionId={p.id} text={`My call on Renqun: ${callText(p)}. It paid ${musd(p.quantity)} MUSD.`} /> : null}
        {live && p.cashOut != null && p.cashOut > 0n && left > 0 ? (
          <Button tone="soft" className="sm block" busy={busy === `redeem:${p.id}`} disabled={busy !== null} onClick={onCashOut}>
            {busy === `redeem:${p.id}` ? 'Cashing out…' : `Cash out ${musd(p.cashOut)}`}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
