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
import { Button, Glyph, Segmented, Skeleton } from './ui';
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

  return (
    <div className="shell page">
      <div className="earn">
        <div>
          <div className="earn-lede">
            <span className="label">Earn · MUSD pool</span>
            <h1>Be the other side of every bet.</h1>
            <p className="body">
              Your MUSD backs every bet on Renqun. The pool keeps the stakes and fees from losing bets and pays the winners. Open bets can never
              promise more than half of it.
            </p>
          </div>

          <div className="tiles">
            <div className="stat">
              <div className="label">Pool</div>
              <div className="stat-value">{v ? <>{musd(v.nav)}<span className="unit">MUSD</span></> : <Skeleton width={120} height={30} />}</div>
            </div>
            <div className="stat">
              <div className="label">Your share</div>
              <div className="stat-value">
                {!address ? '—' : v ? <>{musdNearest(v.value)}<span className="unit">MUSD</span></> : <Skeleton width={100} height={30} />}
              </div>
              {address && v && v.shares > 0n ? <div className="small">{share.toFixed(share < 1 ? 2 : 1)}% of the pool</div> : null}
            </div>
            <div className="stat">
              <div className="label">At risk now</div>
              <div className="stat-value">{v ? <>{musd(v.atRisk)}<span className="unit">MUSD</span></> : <Skeleton width={100} height={30} />}</div>
              {v ? <div className="small">limit {musd(v.cap)}</div> : null}
            </div>
          </div>

          <section className="card" style={{ marginTop: 12, padding: 22 }}>
            <div className="rule" aria-hidden />
            <div className="line" style={{ marginTop: 16 }}>
              <span className="strong">Risk right now</span>
              <span className="small">worst case across every open bet</span>
            </div>
            <div className="meter" role="img" aria-label={v ? `${musd(v.atRisk)} MUSD at risk, limit ${musd(v.cap)}` : 'Loading'}>
              <span style={{ width: `${Math.max(riskPct, riskPct > 0 ? 1.5 : 0)}%` }} />
              <i style={{ left: `${capPct}%` }} />
            </div>
            <div className="line" style={{ marginTop: 8 }}>
              <span className="small">{v ? `${musd(v.atRisk)} at risk` : ' '}</span>
              <span className="small">limit {capPct.toFixed(0)}% of the pool</span>
            </div>
            <hr className="divider" style={{ margin: '18px 0' }} />
            <div className="update">
              <span className="clock-tile">
                <Glyph name="clock" size={20} />
              </span>
              <div style={{ flex: 1 }}>
                <div className="strong">Next pool update {nextAt}</div>
                <div className="small">
                  {v && now ? `in ${inWords(v.nextRoll - now)} · ` : ''}deposits and withdrawals are priced then, once every round in the window has settled
                </div>
              </div>
            </div>
          </section>
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
      </div>
    </div>
  );
}
