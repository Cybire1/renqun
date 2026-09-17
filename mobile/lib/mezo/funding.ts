// Getting money into the phone's wallet without leaving the app, or with one hop.
//
//   • starter drip (services/mezo-drip): gas for every player; 20 test MUSD on testnet
//   • MetaMask: a prefilled MUSD transfer to this wallet (EIP-681 link)
//   • Mezo's DEX: BTC → MUSD, in client.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address } from 'viem';
import { MEZO } from './network';

export interface DripResult {
  gas: { amount: string; hash: string } | null;
  musd: { amount: string; hash: string } | null;
  /** This wallet has had its one-time test MUSD (now or before). */
  musdGiven: boolean;
}

export const dripAvailable = () => MEZO.dripUrl !== '';

/** Ask the drip to top this wallet up. Resolves with what was sent (possibly nothing). */
export async function requestDrip(address: Address): Promise<DripResult> {
  if (!MEZO.dripUrl) throw new Error('No top-up service is set for this build.');
  const res = await fetch(`${MEZO.dripUrl}/drip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<DripResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'The top-up service did not answer. Try again in a minute.');
  const result = { gas: body.gas ?? null, musd: body.musd ?? null, musdGiven: Boolean(body.musdGiven || body.musd) };
  if (result.musdGiven) await markTestMusdClaimed(address);
  return result;
}

// Remembered on the phone so the "free test MUSD" offer disappears once it has been used.
const claimedKey = (a: Address) => `yosuku_mezo_test_musd_${MEZO.network}_${a.toLowerCase()}`;

export async function testMusdClaimed(address: Address): Promise<boolean> {
  return (await AsyncStorage.getItem(claimedKey(address)).catch(() => null)) === '1';
}

async function markTestMusdClaimed(address: Address): Promise<void> {
  await AsyncStorage.setItem(claimedKey(address), '1').catch(() => {});
}

let inflight: Promise<DripResult> | null = null;
/** One drip request at a time per session, whoever asks. */
export function requestDripOnce(address: Address): Promise<DripResult> {
  inflight ??= requestDrip(address).finally(() => {
    setTimeout(() => {
      inflight = null;
    }, 15_000);
  });
  return inflight;
}

/** Opens MetaMask on a MUSD transfer to `to` on Mezo, prefilled. */
export function metamaskSendUrl(to: Address, musd?: number): string {
  const amount = musd && musd > 0 ? `&uint256=${BigInt(Math.round(musd * 100)) * 10n ** 16n}` : '';
  return `https://metamask.app.link/send/${MEZO.musd}@${MEZO.chainId}/transfer?address=${to}${amount}`;
}
