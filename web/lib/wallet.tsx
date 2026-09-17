'use client';
// Browser wallets for Renqun. Installed wallets announce themselves (EIP-6963); the player picks
// one, the site asks for Mezo and adds the network if the wallet has never seen it, and venue calls
// go out with the same gas floors and receipt polling the app uses (Mezo's nodes disagree for a few
// seconds after a block, and their gas estimates can fall below the calldata floor).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createWalletClient,
  custom,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { IS_TESTNET, MEZO, dripAvailable, mezoChain, mezoClient, requestDripOnce, type TxRequest } from '@renqun/client';
import { refreshAll } from './hooks';

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Discovered {
  info: WalletInfo;
  provider: EIP1193Provider;
}

/** The transaction was mined but reverted: simulation passed, so the state moved in between. */
export class TxRevertedError extends Error {
  constructor(readonly hash: Hex) {
    super('The transaction was reverted on Mezo.');
  }
}

interface SendOpts {
  onSent?: (hash: Hex) => void;
  /** The call depends on a transaction this wallet just sent (a bet right after its approval). */
  afterPending?: boolean;
}

interface WalletCtx {
  wallets: Discovered[];
  address: Address | null;
  wallet: WalletInfo | null;
  connecting: string | null;
  error: string | null;
  connect: (uuid: string) => Promise<void>;
  disconnect: () => void;
  send: (tx: TxRequest, opts?: SendOpts) => Promise<TransactionReceipt>;
  /** Connect dialog, opened from anywhere. */
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const Ctx = createContext<WalletCtx | null>(null);
const K_LAST = 'renqun_wallet';

const errorCode = (e: unknown) => (e as { code?: number })?.code;

function useDiscoveredWallets(): Discovered[] {
  const [wallets, setWallets] = useState<Discovered[]>([]);
  useEffect(() => {
    const seen = new Map<string, Discovered>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Discovered>).detail;
      if (!detail?.info?.uuid || seen.has(detail.info.rdns || detail.info.uuid)) return;
      seen.set(detail.info.rdns || detail.info.uuid, detail);
      setWallets([...seen.values()]);
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    // Older wallets only inject window.ethereum.
    const legacy = setTimeout(() => {
      const injected = (window as { ethereum?: EIP1193Provider }).ethereum;
      if (seen.size === 0 && injected) {
        seen.set('injected', { info: { uuid: 'injected', name: 'Browser wallet', icon: '', rdns: 'injected' }, provider: injected });
        setWallets([...seen.values()]);
      }
    }, 400);
    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      clearTimeout(legacy);
    };
  }, []);
  return wallets;
}

async function ensureMezo(provider: EIP1193Provider): Promise<void> {
  const current = Number(await provider.request({ method: 'eth_chainId' }));
  if (current === MEZO.chainId) return;
  const chainId = numberToHex(MEZO.chainId);
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (e) {
    // 4902: the wallet does not know Mezo yet.
    if (errorCode(e) !== 4902 && !/unrecognized|not been added|unknown chain/i.test(String((e as Error)?.message))) throw e;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: IS_TESTNET ? 'Mezo Testnet' : 'Mezo',
          nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
          rpcUrls: [MEZO.rpcUrl, ...MEZO.rpcFallbacks],
          blockExplorerUrls: [MEZO.explorer],
        },
      ],
    });
  }
}

/**
 * Poll for a receipt, treating "not found" as "not yet". Mezo's public RPC is load-balanced and
 * its nodes disagree for a few seconds after a block.
 */
async function waitForReceipt(hash: Hex, timeoutMs = 90_000): Promise<TransactionReceipt> {
  const pub = mezoClient();
  const started = Date.now();
  let delay = 1_500;
  while (Date.now() - started < timeoutMs) {
    try {
      return await pub.getTransactionReceipt({ hash });
    } catch {
      /* not visible on this node yet */
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.round(delay * 1.3), 4_000);
  }
  throw new Error('Mezo has not confirmed this yet. It may still go through: check Portfolio in a minute.');
}

/** On testnet, a wallet without gas asks the starter drip once and waits for it to land. */
async function ensureGas(owner: Address, gasLimit: bigint): Promise<void> {
  const pub = mezoClient();
  const [balance, price] = await Promise.all([pub.getBalance({ address: owner }), pub.getGasPrice()]);
  const need = gasLimit * price;
  if (balance >= need) return;
  if (!IS_TESTNET || !dripAvailable()) throw new Error('insufficient funds for gas');
  await requestDripOnce(owner);
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if ((await pub.getBalance({ address: owner }).catch(() => 0n)) >= need) return;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error('insufficient funds for gas');
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useDiscoveredWallets();
  const [active, setActive] = useState<Discovered | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const restored = useRef(false);

  // Reconnect silently to the wallet used last time, if it still has this site approved.
  useEffect(() => {
    if (restored.current || wallets.length === 0) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(K_LAST);
    } catch {
      /* private mode */
    }
    const match = last ? wallets.find((w) => (w.info.rdns || w.info.uuid) === last) : null;
    if (!match) return;
    restored.current = true;
    match.provider
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        const a = (accounts as Address[])[0];
        if (a) {
          setActive(match);
          setAddress(a);
        }
      })
      .catch(() => {});
  }, [wallets]);

  // Follow account switches inside the wallet.
  useEffect(() => {
    const p = active?.provider;
    if (!p?.on) return;
    const onAccounts = (accounts: unknown) => {
      const a = (accounts as Address[])[0] ?? null;
      setAddress(a);
      if (!a) setActive(null);
      refreshAll();
    };
    p.on('accountsChanged', onAccounts as never);
    return () => p.removeListener?.('accountsChanged', onAccounts as never);
  }, [active]);

  const connect = useCallback(
    async (uuid: string) => {
      const w = wallets.find((x) => x.info.uuid === uuid);
      if (!w) return;
      setConnecting(uuid);
      setError(null);
      try {
        const accounts = (await w.provider.request({ method: 'eth_requestAccounts' })) as Address[];
        if (!accounts[0]) throw new Error('The wallet did not share an account.');
        await ensureMezo(w.provider).catch(() => {
          /* asked again before the first transaction */
        });
        setActive(w);
        setAddress(accounts[0]);
        try {
          localStorage.setItem(K_LAST, w.info.rdns || w.info.uuid);
        } catch {
          /* private mode */
        }
        setDialogOpen(false);
      } catch (e) {
        setError(errorCode(e) === 4001 ? 'You declined the connection in your wallet.' : (e as Error).message || 'The wallet did not connect.');
      } finally {
        setConnecting(null);
      }
    },
    [wallets],
  );

  const disconnect = useCallback(() => {
    setActive(null);
    setAddress(null);
    try {
      localStorage.removeItem(K_LAST);
    } catch {
      /* private mode */
    }
  }, []);

  const send = useCallback(
    async (tx: TxRequest, opts: SendOpts = {}) => {
      if (!active || !address) throw new Error('Connect a wallet first.');
      const pub = mezoClient();
      const { gasFloor, ...call } = tx;
      const params = { ...call, account: address } as unknown as Parameters<typeof pub.simulateContract>[0];
      let gas = gasFloor;
      if (!opts.afterPending) {
        // Simulating first surfaces the venue's own error name before the wallet opens.
        await pub.simulateContract(params);
        const estimate = await pub.estimateContractGas(params as Parameters<typeof pub.estimateContractGas>[0]).catch(() => 0n);
        const padded = (estimate * 3n) / 2n + 30_000n;
        if (padded > gas) gas = padded;
      }
      await ensureGas(address, gas);
      await ensureMezo(active.provider);
      const wallet = createWalletClient({ account: address, chain: mezoChain, transport: custom(active.provider) });
      const hash = await wallet.writeContract({ ...(call as object), account: address, chain: mezoChain, gas } as unknown as Parameters<typeof wallet.writeContract>[0]);
      opts.onSent?.(hash);
      const receipt = await waitForReceipt(hash);
      if (receipt.status !== 'success') throw new TxRevertedError(hash);
      refreshAll();
      return receipt;
    },
    [active, address],
  );

  const value = useMemo<WalletCtx>(
    () => ({
      wallets,
      address,
      wallet: active?.info ?? null,
      connecting,
      error,
      connect,
      disconnect,
      send,
      dialogOpen,
      openDialog: () => {
        setError(null);
        setDialogOpen(true);
      },
      closeDialog: () => setDialogOpen(false),
    }),
    [wallets, address, active, connecting, error, connect, disconnect, send, dialogOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet outside WalletProvider');
  return ctx;
}

/** Wallet rejections read as a choice, not an error. */
export function declined(e: unknown): boolean {
  return errorCode(e) === 4001 || /user (rejected|denied)/i.test(String((e as Error)?.message));
}
