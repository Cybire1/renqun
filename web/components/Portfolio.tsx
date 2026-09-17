'use client';
// Portfolio: what is in play and what it could pay, winnings to collect in one go, and every bet as a
// row (live ones with where they stand right now and a cash-out).
import { useMemo, useState } from 'react';
import {
  clock,
  fetchSpot,
  friendlyError,
  hhmm,
  isPriceMove,
  musd,
  quoteCashOut,
  txClaim,
  txRedeem,
  usd0,
  type Position,
} from '@renqun/client';
import { useNow, usePoll, usePositions } from '@/lib/hooks';
import { TxRevertedError, declined, useWallet } from '@/lib/wallet';
import { Button, EmptyState, Segmented, Skeleton, Tri } from './ui';

type Tab = 'open' | 'settled';

export function Portfolio() {
  const { address, send, openDialog } = useWallet();
  const now = useNow(1000);
  const positions = usePositions(address);
  const spot = usePoll(fetchSpot, 4_000, 'spot-now');
  const [picked, setPicked] = useState<Tab | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => positions.data ?? [], [positions.data]);
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

  return (
    <div className="shell page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1 className="title">Portfolio</h1>
      </div>

      {!address ? (
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
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="label">In play</div>
              <div className="stat-value">{loading ? <Skeleton width={110} height={30} /> : <>{musd(inPlay)}<span className="unit">MUSD</span></>}</div>
            </div>
            <div className="stat">
              <div className="label">Could pay</div>
              <div className="stat-value">{loading ? <Skeleton width={110} height={30} /> : <>{musd(couldPay)}<span className="unit">MUSD</span></>}</div>
            </div>
          </div>

          {readyTotal > 0n ? (
            <div className="collect">
              <div>
                <div className="what">
                  {wins ? `You won ${wins === 1 ? 'a round' : `${wins} rounds`}` : 'Refund ready'}
                  {wins && refunds ? ` · ${refunds} refund${refunds > 1 ? 's' : ''}` : ''}
                </div>
                <div className="howmuch">
                  {musd(readyTotal)}
                  <small>MUSD</small>
                </div>
              </div>
              <Button tone="white" busy={busy === 'claim'} disabled={busy !== null} onClick={() => void claimAll()}>
                Collect
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="error-line" style={{ marginTop: 12 }}>
              {error}
            </p>
          ) : null}

          <div style={{ margin: '24px 0 12px' }}>
            <Segmented
              label="Bets"
              items={[
                { key: 'open', label: 'Open', count: open.length },
                { key: 'settled', label: 'Settled', count: settled.length },
              ]}
              value={tab}
              onChange={setPicked}
            />
          </div>

          <section className="card" aria-live="polite">
            {loading ? (
              <div className="position">
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
              list.map((p) => (
                <Row key={p.id.toString()} p={p} now={now} spotUsd={spot.data?.usd ?? null} busy={busy} onCashOut={() => void cashOut(p)} />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

function callText(p: Position): string {
  const m = p.market;
  if (p.side === 'up') return `Above ${usd0(m.strike)}`;
  if (p.side === 'down') return `At or below ${usd0(m.strike)}`;
  return `${usd0(Number(p.lower * m.tickSize) / 1e9)} – ${usd0(Number(p.higher * m.tickSize) / 1e9)}`;
}

function Row({ p, now, spotUsd, busy, onCashOut }: { p: Position; now: number; spotUsd: number | null; busy: string | null; onCashOut: () => void }) {
  const m = p.market;
  const left = m.expiry - now;
  const live = p.open && m.status === 'live';
  const round = m.cadence === '1h' ? 'Hourly' : '5-minute';

  let headline: string;
  let color = 'var(--ink)';
  let sub: string;
  if (live && left <= 0) {
    headline = 'Settling';
    color = 'var(--text3)';
    sub = 'any second';
  } else if (live) {
    const winning = spotUsd != null && p.winsAt(spotUsd);
    headline = spotUsd == null ? '—' : winning ? 'Winning' : 'Behind';
    color = winning ? 'var(--green-text)' : 'var(--down-text)';
    sub = `${clock(left)} left`;
  } else if (p.cashedOut) {
    headline = 'Cashed out';
    color = 'var(--text2)';
    sub = `stake ${musd(p.premium)}`;
  } else if (m.status === 'void') {
    headline = `+${musd(p.premium)}`;
    sub = p.open ? 'refund to collect' : 'refunded';
  } else {
    const won = m.settlement != null && p.winsAt(m.settlement);
    headline = won ? `+${musd(p.quantity - p.premium)}` : `−${musd(p.premium)}`;
    color = won ? 'var(--green-text)' : 'var(--text2)';
    sub = won ? (p.open ? 'ready to collect' : 'collected') : 'lost';
  }

  const when = live
    ? `${round} · closes ${hhmm(m.expiry)}`
    : m.settlement != null
      ? `Closed ${hhmm(m.expiry)} at ${usd0(m.settlement)}`
      : `${round} · ${hhmm(m.expiry)}`;
  const tileSide = p.side === 'range' ? 'range' : p.side;

  return (
    <div className="position">
      <div className="position-main">
        <span className={`side-tile ${tileSide}`}>
          {p.side !== 'range' ? <Tri dir={p.side} size={12} color={p.side === 'up' ? 'var(--green-text)' : 'var(--down-text)'} /> : null}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="strong">{callText(p)}</div>
          <div className="small">{when}</div>
        </div>
        <div className="position-right">
          <div className="position-head" style={{ color }}>
            {headline}
          </div>
          <div className="small num">{sub}</div>
        </div>
      </div>
      {live ? (
        <div className="position-foot">
          <span className="small">
            Stake <b className="strong">{musd(p.premium)}</b> · pays <b className="strong">{musd(p.quantity)}</b>
          </span>
          {p.cashOut != null && p.cashOut > 0n && left > 0 ? (
            <Button tone="soft" className="sm" busy={busy === `redeem:${p.id}`} disabled={busy !== null} onClick={onCashOut}>
              {busy === `redeem:${p.id}` ? 'Cashing out…' : `Cash out ${musd(p.cashOut)}`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
