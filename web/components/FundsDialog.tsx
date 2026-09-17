'use client';
import { useEffect, useState } from 'react';
import {
  IS_TESTNET,
  MEZO,
  MEZO_APP_URL,
  btc,
  btcAllowanceForDex,
  dripAvailable,
  friendlyError,
  money,
  musd,
  quoteBtcToMusd,
  requestDrip,
  shortAddr,
  testMusdClaimed,
  txApproveBtcForDex,
  txSwapBtcForMusd,
} from '@renqun/client';
import { refreshAll, useBalances, usePoll } from '@/lib/hooks';
import { declined, useWallet } from '@/lib/wallet';
import { Button, Glyph, Sheet } from './ui';

const GAS_RESERVE = 20_000_000_000_000n; // keep 0.00002 BTC for gas when swapping "Max"

const toBtcWei = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e8)) * 10n ** 10n : 0n;
};

export function FundsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address, send } = useWallet();
  const balances = useBalances(address);
  const bal = balances.data;
  const [btcIn, setBtcIn] = useState('0.0005');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setClaimed(null);
    if (address) void testMusdClaimed(address).then(setClaimed);
  }, [address]);

  useEffect(() => {
    if (open) {
      setNote(null);
      setError(null);
    }
  }, [open]);

  const wei = toBtcWei(btcIn);
  const quote = usePoll(open && wei > 0n ? async () => ({ wei, out: await quoteBtcToMusd(wei) }) : null, 10_000, `swapq:${wei}`, { keepData: true });
  const out = quote.data?.wei === wei ? quote.data.out : null;
  const spendable = bal ? (bal.btc > GAS_RESERVE ? bal.btc - GAS_RESERVE : 0n) : 0n;
  const tooMuch = bal ? wei > spendable : false;
  const noBtc = bal ? spendable === 0n : false;

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setNote(null);
    setError(null);
    try {
      const msg = await fn();
      if (msg) setNote(msg);
      refreshAll();
    } catch (e) {
      if (!declined(e)) setError(e instanceof Error && !('shortMessage' in e) ? e.message : friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const getTestMusd = () =>
    run('drip', async () => {
      if (!address) return;
      const r = await requestDrip(address);
      setClaimed(r.musdGiven);
      if (r.musd) return `${money(Number(BigInt(r.musd.amount)) / 1e18)} test MUSD added.`;
      return r.musdGiven ? 'This wallet already had its test MUSD.' : 'Nothing to add right now.';
    });

  const swap = () =>
    run('swap', async () => {
      if (!address || wei === 0n) return;
      const quoted = await quoteBtcToMusd(wei);
      if ((await btcAllowanceForDex(address)) < wei) {
        setBusy('Approve BTC in your wallet…');
        await send(txApproveBtcForDex(wei));
      }
      setBusy('Confirm the swap in your wallet…');
      await send(txSwapBtcForMusd(wei, (quoted * 99n) / 100n, address));
      return `Swapped ${btcIn} BTC for about ${money(Number(quoted) / 1e18)} MUSD.`;
    });

  return (
    <Sheet open={open} onClose={onClose} title="Add MUSD">
      <p className="small" style={{ marginTop: -10 }}>
        {bal ? `You have ${musd(bal.musd)} MUSD · ${btc(bal.btc, 5)} BTC` : ' '}
      </p>

      {IS_TESTNET && dripAvailable() && claimed === false ? (
        <div className="well fund-block">
          <div className="fund-row">
            <div>
              <div className="strong">Free test MUSD</div>
              <div className="small">Testnet only · once per wallet</div>
            </div>
            <Button tone="red" className="sm" busy={busy === 'drip'} disabled={busy !== null} onClick={getTestMusd}>
              Get 20
            </Button>
          </div>
        </div>
      ) : null}

      {noBtc ? (
        <div className="well fund-block">
          <div className="fund-row">
            <div>
              <div className="strong">Swap BTC for MUSD</div>
              <div className="small">No BTC on Mezo yet</div>
            </div>
            <a className="btn soft sm" href={IS_TESTNET && MEZO.faucet ? MEZO.faucet : MEZO_APP_URL} target="_blank" rel="noreferrer">
              {IS_TESTNET ? 'Get test BTC' : 'Bridge BTC'}
            </a>
          </div>
        </div>
      ) : (
        <div className="well fund-block">
          <div className="strong">Swap BTC for MUSD</div>
          <div className="swap-row">
            <input
              id="swap-btc"
              value={btcIn}
              inputMode="decimal"
              aria-label="BTC to swap"
              onChange={(e) => setBtcIn(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
            <span className="label">BTC</span>
            <span className="num" style={{ marginLeft: 'auto', font: '700 20px var(--font-display)' }}>
              {out != null ? `≈ ${money(Number(out) / 1e18)}` : '…'} <span className="label">MUSD</span>
            </span>
          </div>
          <div className="chips" style={{ justifyContent: 'flex-start' }}>
            {['0.0002', '0.0005', '0.001'].map((c) => (
              <button key={c} type="button" className="chip" style={{ background: 'var(--card)' }} onClick={() => setBtcIn(c)}>
                {c}
              </button>
            ))}
            <button type="button" className="chip" style={{ background: 'var(--card)' }} onClick={() => setBtcIn((Number(spendable / 10n ** 10n) / 1e8).toString())}>
              Max
            </button>
          </div>
          <Button tone="red" busy={busy !== null && busy !== 'drip'} disabled={busy !== null || tooMuch || wei === 0n || out == null} onClick={swap}>
            {busy && busy !== 'drip' ? (busy === 'swap' ? 'Swapping…' : busy) : tooMuch ? 'Not enough BTC' : 'Swap'}
          </Button>
        </div>
      )}

      {address ? (
        <div className="well fund-block">
          <div className="strong">From another wallet</div>
          <div className="addr-row">
            {shortAddr(address)}
            <button
              type="button"
              className="btn white sm"
              onClick={async () => {
                await navigator.clipboard.writeText(address).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
            >
              <Glyph name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="small">Send MUSD on Mezo to this address.</div>
        </div>
      ) : null}

      {note ? <p className="note">{note}</p> : null}
      {error ? <p className="error-line">{error}</p> : null}

      <div className="fund-row">
        <a className="link" href={MEZO_APP_URL} target="_blank" rel="noreferrer">
          Borrow MUSD on Mezo
        </a>
        <span className="small">from 1,800 MUSD</span>
      </div>
    </Sheet>
  );
}
