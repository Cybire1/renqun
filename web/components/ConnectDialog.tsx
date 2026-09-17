'use client';
import { useWallet } from '@/lib/wallet';
import { Sheet } from './ui';

export function ConnectDialog() {
  const { wallets, connect, connecting, error, dialogOpen, closeDialog } = useWallet();
  return (
    <Sheet open={dialogOpen} onClose={closeDialog} title="Connect a wallet">
      <p className="body">Bets are paid in MUSD on Mezo. Your wallet signs each one; gas is a fraction of a cent in BTC.</p>
      {wallets.length ? (
        <div className="wallet-list">
          {wallets.map((w) => (
            <button key={w.info.uuid} type="button" className="wallet-row" disabled={connecting !== null} onClick={() => void connect(w.info.uuid)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.info.icon ? <img src={w.info.icon} alt="" /> : <span className="empty-mark" style={{ width: 32, height: 32, borderRadius: 9 }} />}
              {w.info.name}
              <span className="tag">{connecting === w.info.uuid ? 'Check your wallet…' : 'Installed'}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="well" style={{ padding: 16 }}>
          <p className="note">No wallet found in this browser.</p>
          <p className="small" style={{ marginTop: 4 }}>
            Install an EVM wallet such as MetaMask, Rabby or OKX Wallet, then reload this page.
          </p>
        </div>
      )}
      {error ? <p className="error-line">{error}</p> : null}
      <p className="small">The site asks your wallet to add Mezo the first time.</p>
    </Sheet>
  );
}
