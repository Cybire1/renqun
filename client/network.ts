// THE MEZO NETWORK SWITCH — the EVM twin of lib/sui/network.ts.
//
//   NEXT_PUBLIC_MEZO_NETWORK=mainnet  → Mezo mainnet (chain 31612)
//   (default: testnet, chain 31611)
//
// Mezo is a Bitcoin-first EVM chain: gas is BTC (18 decimals), the settlement currency is MUSD
// (Mezo's BTC-backed stablecoin, 18 decimals), and BTC/USD comes from a native oracle precompile
// that validators update every block. Renqun's venue there is `YosukuPredict` (contracts/).
//
// RPC NOTE (verified 2026-09-16): viem's built-in `mezo` chain defaults to https://rpc.mezo.org,
// which does not answer. Always pass an explicit transport URL from this file.

import { defineChain, type Address } from 'viem';
import { mezo as viemMezo, mezoTestnet as viemMezoTestnet } from 'viem/chains';

export type MezoNetwork = 'testnet' | 'mainnet';

export const MEZO_NETWORK: MezoNetwork =
  (process.env.NEXT_PUBLIC_MEZO_NETWORK as MezoNetwork) === 'mainnet' ? 'mainnet' : 'testnet';

/** Mezo's BTC/USD oracle precompile (Chainlink-shaped, 18 decimals). Same address on both networks. */
export const MEZO_PRICE_ORACLE: Address = '0x7b7c000000000000000000000000000000000015';

export interface MezoNetworkConfig {
  network: MezoNetwork;
  chainId: 31611 | 31612;
  rpcUrl: string;
  wsUrl: string;
  explorer: string;
  musd: Address;
  /** Deployed YosukuPredict. Empty until `forge script script/Deploy.s.sol` runs on this network. */
  predict: Address | '';
  /** Block the venue was deployed at; event scans start here. */
  deployBlock: bigint;
}

const TESTNET: MezoNetworkConfig = {
  network: 'testnet',
  chainId: 31611,
  rpcUrl: process.env.NEXT_PUBLIC_MEZO_RPC_URL || 'https://rpc.test.mezo.org',
  wsUrl: 'wss://rpc-ws.test.mezo.org',
  explorer: 'https://explorer.test.mezo.org',
  musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
  // Deployed 2026-09-16, block 15572175, source verified on explorer.test.mezo.org.
  predict: (process.env.NEXT_PUBLIC_YOSUKU_MEZO_PREDICT as Address) || '0x85c9A910143A4814346132d93F221DE3FCF6536a',
  deployBlock: BigInt(process.env.NEXT_PUBLIC_YOSUKU_MEZO_DEPLOY_BLOCK || 15_572_175),
};

const MAINNET: MezoNetworkConfig = {
  network: 'mainnet',
  chainId: 31612,
  rpcUrl: process.env.NEXT_PUBLIC_MEZO_RPC_URL || 'https://mainnet.mezo.public.validationcloud.io',
  wsUrl: 'wss://mainnet.mezo.public.validationcloud.io',
  explorer: 'https://explorer.mezo.org',
  musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',
  predict: (process.env.NEXT_PUBLIC_YOSUKU_MEZO_PREDICT as Address) || '',
  deployBlock: BigInt(process.env.NEXT_PUBLIC_YOSUKU_MEZO_DEPLOY_BLOCK || 0),
};

export const MEZO: MezoNetworkConfig = MEZO_NETWORK === 'mainnet' ? MAINNET : TESTNET;

/** viem chain with a working RPC (see RPC NOTE above). */
export const mezoChain = defineChain({
  ...(MEZO_NETWORK === 'mainnet' ? viemMezo : viemMezoTestnet),
  rpcUrls: { default: { http: [MEZO.rpcUrl], webSocket: [MEZO.wsUrl] } },
});

/** True once a YosukuPredict address is configured for the active network. */
export const MEZO_PREDICT_LIVE = MEZO.predict !== '';

export const explorerTx = (hash: string) => `${MEZO.explorer}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${MEZO.explorer}/address/${addr}`;
