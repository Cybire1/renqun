'use client';
// Earn: the MUSD pool that takes the other side of every bet. Deposits and withdrawals queue and are
// priced at the next pool update, when every round in the window has settled, then collected.
import { useState } from 'react';
import { zeroAddress } from 'viem';
import {
  friendlyError,
  hhmm,
  inWords,
  musd,
  musdNearest,
  toWad,
  txApproveMusd,
  txClaimDeposit,
  txClaimWithdraw,
  txRequestDeposit,
  txRequestWithdraw,
} from '@renqun/client';
import { useBalances, useNow, useVault } from '@/lib/hooks';
import { declined, useWallet } from '@/lib/wallet';
import { Button, Segmented, Skeleton } from './ui';
import { useFunds } from './Providers';

type Mode = 'deposit' | 'withdraw';

export function Earn() {
  const { address, send, openDialog } = useWallet();
  const { openFunds } = useFunds();
  const now = useNow(15_000);
  const balances = useBalances(address);
  // Pool numbers are public; read them for the zero address until a wallet connects.
  const vault = useVault(address ?? zeroAddress);
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const bal = balances.data;
  const v = vault.data;
  const wei = toWad(parseFloat(amount.replace(',', '.')));
  const nextAt = v ? hhmm(v.nextRoll) : '—';
  const share = v && v.nav > 0n && address ? Number((v.value * 10_000n) / v.nav) / 100 : 0;
  const riskPct = v && v.nav > 0n ? Math.min(100, Number((v.atRisk * 10_000n) / v.nav) / 100) : 0;
  const capPct = v && v.nav > 0n ? Math.min(100, Number((v.cap * 10_000n) / v.nav) / 100) : 50;

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
      if (key === 'deposit' || key === 'withdraw') setAmount('');
      if (done) setNote(done);
    } catch (e) {
      if (!declined(e)) setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const needsAllowance = mode === 'deposit' && bal ? bal.allowance < wei : false;
  const sharesFor = v && v.nav > 0n ? (wei * v.supply) / v.nav : 0n;
  let blocker: string | null = null;
  if (wei === 0n) blocker = 'Enter an amount';
  else if (mode === 'deposit' && bal && wei > bal.musd) blocker = 'Not enough MUSD';
  else if (mode === 'deposit' && wei < 10n ** 19n) blocker = 'Minimum 10 MUSD';
  else if (mode === 'withdraw' && v && wei > v.value) blocker = 'More than your share';

  const submit = () => {
    if (mode === 'deposit') {
      if (needsAllowance) return run('approve', () => send(txApproveMusd()));
      return run('deposit', () => send(txRequestDeposit(wei)), `Queued. It joins the pool at ${nextAt}.`);
    }
    const shares = v && wei >= v.value ? v.shares : sharesFor;
    return run('withdraw', () => send(txRequestWithdraw(shares)), `Queued. It pays out at ${nextAt}.`);
  };

  const pending = !!address && !!v && (v.queuedDeposit > 0n || v.queuedWithdrawShares > 0n || v.claimableDeposits.length > 0 || v.claimableWithdrawals.length > 0);

  // How far through the current pool window we are; requests made now are priced at its end.
  const windowLeft = v && now && v.windowMs > 0 ? Math.max(0, Math.min(1, (v.nextRoll - now) / v.windowMs)) : null;
  const feePct = v ? (Number(v.feeRate) / 1e7).toFixed(Number(v.feeRate) % 10_000_000 === 0 ? 0 : 1) : null;

  return (
    <>
      <div className="shell">
        <section className="earn-hero">
          <div className="earn-copy">
            <span className="eyebrow pf-live">
              <i aria-hidden />
              Earn · the MUSD pool
            </span>
            <h1 className="earn-h1">
              Be the other side
              <br />
              of every bet.
            </h1>

            {/* The pool is the page's number, drawn against what it is backing right now. */}
            <div className="earn-pool">
              <span className="earn-pool-k">In the pool</span>
              <span className="earn-pool-v">
                {v ? musd(v.nav) : <Skeleton width={280} height={64} />}
                <em>MUSD</em>
              </span>
              <span className="earn-cap" role="img" aria-label={v ? `${musd(v.atRisk)} MUSD backing open bets, limit ${musd(v.cap)}` : 'Loading'}>
                <i style={{ width: `${Math.max(riskPct, riskPct > 0 ? 1.5 : 0)}%` }} />
                <b style={{ left: `${capPct}%` }} />
              </span>
              <span className="earn-cap-legend">
                <span>
                  <i className="key risk" aria-hidden />
                  {v ? musd(v.atRisk) : '—'} backing open bets
                </span>
                <span>
                  <i className="key cap" aria-hidden />
                  never more than {capPct.toFixed(0)}%
                </span>
              </span>
            </div>
          </div>

      <aside className="card move" aria-label="Deposit or withdraw">
        <Segmented
          label="Deposit or withdraw"
          items={[
            { key: 'deposit', label: 'Deposit' },
            { key: 'withdraw', label: 'Withdraw' },
          ]}
          value={mode}
          onChange={(k) => {
            setMode(k);
            setError(null);
            setNote(null);
          }}
        />
        <div className="amount">
          <label className="amount-row" htmlFor="pool-amount">
            <input
              id="pool-amount"
              value={amount}
              placeholder="0"
              inputMode="decimal"
              maxLength={12}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^0-9.,]/g, ''));
                setError(null);
              }}
            />
            <span className="amount-unit">MUSD</span>
          </label>
          <span className="small">
            {!address ? 'Connect a wallet to add to the pool' : mode === 'deposit' ? (bal ? `Available ${musd(bal.musd)}` : ' ') : v ? `Your share ${musdNearest(v.value)}` : ' '}
          </span>
        </div>
        <div className="chips">
          {(mode === 'deposit' ? [10, 50, 100] : []).map((n) => (
            <button key={n} type="button" className="chip" onClick={() => setAmount(String(n))}>
              {n}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            disabled={!address}
            onClick={() => {
              const max = mode === 'deposit' ? bal?.musd : v?.value;
              if (max != null) setAmount((Number(max / 10n ** 16n) / 100).toFixed(2));
            }}
          >
            Max
          </button>
        </div>

        {error ? <p className="error-line">{error}</p> : null}
        {note ? <p className="note">{note}</p> : null}

        {!address ? (
          <Button tone="red" className="block tall" onClick={openDialog}>
            Connect wallet
          </Button>
        ) : mode === 'deposit' && blocker === 'Not enough MUSD' ? (
          <Button tone="red" className="block tall" onClick={openFunds}>
            Add MUSD
          </Button>
        ) : (
          <Button tone="red" className="block tall" busy={busy !== null} disabled={busy !== null || blocker !== null} onClick={() => void submit()}>
            {busy === 'approve'
              ? 'Allow MUSD in your wallet…'
              : busy === 'deposit' || busy === 'withdraw'
                ? 'Confirm in your wallet…'
                : blocker ?? (mode === 'deposit' ? (needsAllowance ? 'Allow MUSD, then deposit' : `Deposit ${amount} MUSD`) : `Withdraw ${amount} MUSD`)}
          </Button>
        )}
        <p className="small">Queued requests wait for the next update ({nextAt}); you then collect them here. Withdrawals are never paused.</p>

        {pending && v ? (
          <div className="well fund-block">
            <div className="strong">Your requests</div>
            {v.queuedDeposit > 0n ? <div className="small">{musd(v.queuedDeposit)} MUSD joins at {nextAt}</div> : null}
            {v.queuedWithdrawShares > 0n ? <div className="small">A withdrawal pays at {nextAt}</div> : null}
            {v.claimableDeposits.map((e) => (
              <Button key={`d${e}`} tone="red" busy={busy === `cd${e}`} disabled={busy !== null} onClick={() => void run(`cd${e}`, () => send(txClaimDeposit(e)))}>
                Add your new pool share
              </Button>
            ))}
            {v.claimableWithdrawals.map((e) => (
              <Button key={`w${e}`} tone="red" busy={busy === `cw${e}`} disabled={busy !== null} onClick={() => void run(`cw${e}`, () => send(txClaimWithdraw(e)))}>
                Collect your withdrawal
              </Button>
            ))}
          </div>
        ) : null}
      </aside>
        </section>
      </div>

      <section className="pf-band" aria-label="Your place in the pool">
        <div className="shell pf-band-inner earn-band">
          <div className="pf-fig">
            <span className="pf-k">Your share</span>
            <span className="pf-v">{!address ? '—' : v ? musdNearest(v.value) : <Skeleton width={90} height={30} />}</span>
            <span className="pf-note">
              {!address ? 'connect a wallet to see it' : v && v.shares > 0n ? `${share.toFixed(share < 1 ? 2 : 1)}% of the pool` : 'nothing in the pool yet'}
            </span>
          </div>

          <div className="pf-fig">
            <span className="pf-k">The pool keeps</span>
            <span className="pf-v">{feePct != null ? `${feePct}%` : <Skeleton width={60} height={30} />}</span>
            <span className="pf-note">of every bet and cash-out, and every losing stake</span>
          </div>

          <div className="pf-fig">
            <span className="pf-k">Next update</span>
            <span className="pf-v">{nextAt}</span>
            {windowLeft != null ? (
              <span className="stat-meter window" aria-hidden>
                <i style={{ width: `${windowLeft * 100}%` }} />
              </span>
            ) : null}
            <span className="pf-note">{v && now ? `in ${inWords(v.nextRoll - now)} · deposits and withdrawals price then` : ' '}</span>
          </div>
        </div>
      </section>
    </>
  );
}
