// Mezo per-device wallet. Each install
// generates its own key, keeps it in the Keychain/Keystore (this device only, readable only while
// unlocked) and never sends it anywhere. The only recovery is the backup key the user can reveal
// in Settings.
//
// Mezo has no zkLogin, so there is no social sign-in here. Gas is a few cents of BTC; bets are MUSD.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  createWalletClient,
  nonceManager,
  type Address,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { MEZO, mezoChain } from './network';
import { mezoClient, mezoTransport, type TxRequest } from './client';
import { dripAvailable, requestDripOnce } from './funding';

const K_KEY = `yosuku_mezo_key_${MEZO.network}`;
const K_ONBOARDED = `yosuku_mezo_onboarded_${MEZO.network}`;

async function getItem(k: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(k);
}

async function setItem(k: string, v: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function delItem(k: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(k);
}

let _account: PrivateKeyAccount | null = null;
let _wallet: WalletClient | null = null;
const listeners = new Set<(a: Address) => void>();

export async function mezoAccount(): Promise<PrivateKeyAccount> {
  if (_account) return _account;
  let pk = (await getItem(K_KEY)) as Hex | null;
  if (!pk) {
    pk = generatePrivateKey();
    await setItem(K_KEY, pk);
  }
  // Local nonce counting lets a first bet send its approval and the bet back to back.
  _account = privateKeyToAccount(pk, { nonceManager });
  return _account;
}

/** Synchronous read once primed; null before. */
export function cachedMezoAddress(): Address | null {
  return _account?.address ?? null;
}

export async function mezoAddress(): Promise<Address> {
  return (await mezoAccount()).address;
}

export async function primeMezoWallet(): Promise<void> {
  await mezoAccount();
}

export function onMezoAccountChange(fn: (a: Address) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function walletClient(): Promise<WalletClient> {
  if (_wallet) return _wallet;
  _wallet = createWalletClient({
    account: await mezoAccount(),
    chain: mezoChain,
    transport: mezoTransport(false),
  });
  return _wallet;
}

/**
 * Players should only ever think about MUSD. If this wallet cannot cover a transaction's gas, ask the
 * starter drip for a top-up and wait for it to land before sending.
 */
async function ensureGas(owner: Address, gasLimit: bigint): Promise<void> {
  const pub = mezoClient();
  const [balance, price] = await Promise.all([pub.getBalance({ address: owner }), pub.getGasPrice()]);
  const need = gasLimit * price;
  if (balance >= need) return;
  if (!dripAvailable()) throw new Error('insufficient funds for gas');
  await requestDripOnce(owner);
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if ((await pub.getBalance({ address: owner }).catch(() => 0n)) >= need) return;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error('insufficient funds for gas');
}

/**
 * Simulate, sign and send one contract call, then wait for it to land. Simulation first means a
 * revert surfaces as the venue's own error name (see friendlyError) before anything is signed.
 * `onSent` fires as soon as the transaction is broadcast, so screens can show it as placed while
 * the block lands.
 */
/** The transaction was mined but reverted. Simulation passed, so the state moved in between. */
export class TxRevertedError extends Error {
  constructor(readonly hash: Hex) {
    super('The transaction was reverted on Mezo.');
  }
}

export async function sendTx(
  tx: TxRequest,
  opts: { onSent?: (hash: Hex) => void; afterPending?: boolean } = {},
): Promise<TransactionReceipt> {
  const hash = await broadcastTx(tx, opts);
  opts.onSent?.(hash);
  const receipt = await waitForReceipt(hash);
  if (receipt.status !== 'success') throw new TxRevertedError(hash);
  return receipt;
}

/**
 * Sign and broadcast without waiting for the block. `afterPending` is for a call that depends on a
 * transaction this wallet just sent (a bet right after its approval): simulating it against the
 * current block would fail, so it goes out at its measured gas floor, one nonce behind the first.
 */
export async function broadcastTx(tx: TxRequest, opts: { afterPending?: boolean } = {}): Promise<Hex> {
  const account = await mezoAccount();
  const pub = mezoClient();
  const { gasFloor: _floor, ...call } = tx;
  const params = { ...call, account } as unknown as Parameters<typeof pub.simulateContract>[0];
  let gas = tx.gasFloor;
  let request: Parameters<WalletClient['writeContract']>[0];
  if (opts.afterPending) {
    request = params as unknown as Parameters<WalletClient['writeContract']>[0];
  } else {
    request = (await pub.simulateContract(params)).request as Parameters<WalletClient['writeContract']>[0];
    // Node estimates are unreliable on Mezo (see TxRequest.gasFloor), so take the larger of a padded
    // estimate and the call's measured floor.
    const estimate = await pub.estimateContractGas(params as Parameters<typeof pub.estimateContractGas>[0]).catch(() => 0n);
    const padded = (estimate * 3n) / 2n + 30_000n;
    if (padded > gas) gas = padded;
  }
  await ensureGas(account.address, gas);
  const wallet = await walletClient();
  try {
    return await wallet.writeContract({ ...request, account, chain: mezoChain, gas });
  } catch (e) {
    nonceManager.reset({ address: account.address, chainId: mezoChain.id });
    throw e;
  }
}

/**
 * Poll for a receipt, treating "not found" as "not yet". Mezo's public RPC is load-balanced and its
 * nodes disagree for a few seconds after a block: one returns the receipt, the next returns null.
 * viem's waitForTransactionReceipt reads that as a replaced transaction and gives up on a tx that
 * landed fine (seen on testnet 2026-09-16), so this keeps asking instead.
 */
export async function waitForReceipt(hash: Hex, timeoutMs = 90_000): Promise<TransactionReceipt> {
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

// ── onboarding + backup ──

export async function isMezoOnboarded(): Promise<boolean> {
  return (await getItem(K_ONBOARDED)) === '1';
}

export async function markMezoOnboarded(): Promise<void> {
  await setItem(K_ONBOARDED, '1');
}

/** The backup key (0x…). Show only behind an explicit reveal: it controls the funds. */
export async function exportMezoKey(): Promise<Hex> {
  const pk = (await getItem(K_KEY)) as Hex | null;
  if (!pk) throw new Error('No wallet on this device yet.');
  return pk;
}

/** Restore from a backup key. Throws on a malformed key. */
export async function importMezoKey(input: string): Promise<Address> {
  const raw = input.trim();
  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error('A backup key is 64 hex characters.');
  const account = privateKeyToAccount(pk, { nonceManager });
  await setItem(K_KEY, pk);
  _account = account;
  _wallet = null;
  listeners.forEach((fn) => fn(account.address));
  return account.address;
}

/** Wipe this device's Mezo wallet. A fresh one is made on next use. */
export async function resetMezoWallet(): Promise<void> {
  await Promise.all([delItem(K_KEY), delItem(K_ONBOARDED)]);
  _account = null;
  _wallet = null;
  const next = await mezoAccount();
  listeners.forEach((fn) => fn(next.address));
}
