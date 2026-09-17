'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IS_TESTNET, explorerAddress, musd, shortAddr } from '@renqun/client';
import { useBalances } from '@/lib/hooks';
import { useWallet } from '@/lib/wallet';
import { RenqunMark } from './RenqunMark';
import { Button, Glyph } from './ui';
import { useFunds } from './Providers';

const NAV = [
  { href: '/', label: 'Markets' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/earn', label: 'Earn' },
];

export function Header() {
  const path = usePathname();
  const { address, wallet, openDialog } = useWallet();
  const { openFunds } = useFunds();
  const balances = useBalances(address);

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="brand" aria-label="Renqun home">
          <RenqunMark size={28} />
          Renqun
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="top-right">
          <span className="net">
            <i aria-hidden />
            {IS_TESTNET ? 'Mezo testnet' : 'Mezo'}
          </span>
          {address ? (
            <>
              <button type="button" className="balance" onClick={openFunds} aria-label={`Balance ${balances.data ? musd(balances.data.musd) : 'loading'} MUSD. Add MUSD.`}>
                <b>{balances.data ? musd(balances.data.musd) : '—'}</b>
                <span>MUSD</span>
                <em>
                  <Glyph name="plus" size={13} color="#000" weight={2.6} />
                </em>
              </button>
              <AccountMenu address={address} icon={wallet?.icon ?? ''} walletName={wallet?.name ?? 'Wallet'} />
            </>
          ) : (
            <Button tone="red" className="sm" onClick={openDialog}>
              Connect wallet
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function AccountMenu({ address, icon, walletName }: { address: string; icon: string; walletName: string }) {
  const { disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {icon ? <img src={icon} alt="" /> : <span className="dot" />}
        <span className="account-addr">{shortAddr(address)}</span>
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label={walletName}>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await navigator.clipboard.writeText(address).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <a role="menuitem" href={explorerAddress(address)} target="_blank" rel="noreferrer">
            View on the Mezo explorer
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
