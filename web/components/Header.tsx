'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clock, explorerAddress, fetchSpot, liveRounds, musd, shortAddr, usd0, type SpotPoint } from '@renqun/client';
import { useBalances, useMarkets, useMedia, useNow, usePoll } from '@/lib/hooks';
import { useWallet } from '@/lib/wallet';
import { RenqunMark } from './RenqunMark';
import { Button, Glyph, Tri } from './ui';
import { useFunds } from './Providers';

const ROUND_MS = 5 * 60_000;

const NAV = [
  { href: '/markets', label: 'Markets' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/earn', label: 'Earn' },
];

export function Header() {
  const path = usePathname();
  const { address, wallet, openDialog } = useWallet();
  const { openFunds } = useFunds();
  const balances = useBalances(address);

  const [lifted, setLifted] = useState(false);
  // Below 860px the island keeps one row and the pages move to a bottom tab bar, within thumb
  // reach. `useMedia` is null until mounted, so the wide layout is what renders on the server.
  const compact = useMedia('(max-width: 860px)') ?? false;
  const now = useNow(1000);
  const markets = useMarkets();
  const spot = usePoll<SpotPoint>(fetchSpot, 5_000, 'spot-bar');
  const round = useMemo(
    () => (now && markets.data ? liveRounds(markets.data, '5m', now)[0] ?? null : null),
    [markets.data, now],
  );
  const msLeft = round && now ? Math.max(0, round.expiry - now) : null;
  const remaining = msLeft == null ? 0 : Math.min(1, msLeft / ROUND_MS);
  const above = spot.data && round ? spot.data.usd > round.strike : null;

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`topbar${lifted ? ' lifted' : ''}`}>
      <div className="shell topbar-inner">
        <Link href="/" className="brand" aria-label="Renqun home">
          <RenqunMark size={26} />
          <span className="brand-word">Renqun</span>
        </Link>
        {compact ? null : (
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
                <span>{n.label}</span>
              </Link>
            ))}
          </nav>
        )}
        {/* The bar carries the round that is running: Bitcoin against the line, and the time left.
            The rule along the bar's bottom edge drains with it, so the chrome is the clock. */}
        <Link href="/markets" className="bar-live" aria-label={`Bitcoin ${spot.data ? usd0(spot.data.usd) : ''}, round closes in ${msLeft != null ? clock(msLeft) : 'unknown'}`}>
          <span className="bl-price mono">{spot.data ? usd0(spot.data.usd) : '—'}</span>
          {above != null && round && spot.data ? (
            <span className={`bl-delta ${above ? 'up' : 'down'}`}>
              <Tri dir={above ? 'up' : 'down'} size={8} />
              {usd0(Math.abs(spot.data.usd - round.strike))}
            </span>
          ) : null}
          <i className="bl-div" aria-hidden />
          <span className="bl-k">closes</span>
          <span className={`bl-clock mono${msLeft != null && msLeft < 30_000 ? ' final' : ''}`}>
            {msLeft != null ? clock(msLeft) : '--:--'}
          </span>
        </Link>

        {/* The wallet is one hairline cluster with internal dividers, so the only filled control
            on the bar is the next action. */}
        <div className="top-right">
          <div className="cluster">
            {address ? (
              <>
                <button type="button" className="balance" onClick={openFunds} aria-label={`Balance ${balances.data ? musd(balances.data.musd) : 'loading'} MUSD. Add MUSD.`}>
                  <b>{balances.data ? musd(balances.data.musd) : '—'}</b>
                  <span>MUSD</span>
                  <em>
                    <Glyph name="plus" size={13} color="#fff" weight={2.6} />
                  </em>
                </button>
                <AccountMenu address={address} icon={wallet?.icon ?? ''} walletName={wallet?.name ?? 'Wallet'} />
              </>
            ) : null}
          </div>
          {address ? null : (
            <Button tone="red" className="sm" onClick={openDialog}>
              {compact ? 'Connect' : 'Connect wallet'}
            </Button>
          )}
        </div>
        <span className="bar-track" aria-hidden>
          <span className="bar-progress" style={{ transform: `scaleX(${remaining})` }} />
        </span>
      </div>
      {compact ? (
        <nav className="tabbar" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
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
