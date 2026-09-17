// Mezo network config — the app's twin of client/network.ts.
//
//   EXPO_PUBLIC_MEZO_NETWORK=mainnet   → Mezo mainnet (chain 31612); default testnet (31611)
//
// Mezo is a Bitcoin-first EVM chain: gas is BTC (18 decimals), bets settle in MUSD (Mezo's
// BTC-backed dollar, 18 decimals) and BTC/USD comes from a native oracle precompile that
// validators print every block. The venue is YosukuPredict (yosuku-web/contracts-evm).
//
// RPC note (verified 2026-09-16): viem's built-in `mezo` chain points at https://rpc.mezo.org, which
// does not answer. Every client here passes an explicit URL.
import { defineChain, type Address } from 'viem';
import { mezo as viemMezo, mezoTestnet as viemMezoTestnet } from 'viem/chains';

export type MezoNetwork = 'testnet' | 'mainnet';

export const MEZO_NETWORK: MezoNetwork = process.env.EXPO_PUBLIC_MEZO_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

/** BTC/USD oracle precompile (Chainlink-shaped, 18 decimals). Same address on both networks. */
export const MEZO_PRICE_ORACLE: Address = '0x7b7c000000000000000000000000000000000015';

export interface MezoNetworkConfig {
  network: MezoNetwork;
  chainId: 31611 | 31612;
  rpcUrl: string;
  /** Tried in order when the primary fails. */
  rpcFallbacks: string[];
  explorer: string;
  faucet: string | null;
  musd: Address;
  /** YosukuPredict. Empty until it is deployed on this network. */
  predict: Address | '';
  /** Block the venue was deployed at; event scans start here. */
  deployBlock: bigint;
  /** Average block time, used to turn "N minutes ago" into a block number for chart history. */
  blockSeconds: number;
  /** Blockscout API; answers a full-history log query in one call. */
  explorerApi: string;
  /** Mezo's DEX (Tigris), for buying MUSD with BTC inside the app. */
  dexRouter: Address;
  dexFactory: Address;
  /** Starter drip (services/mezo-drip): gas for every player, plus test MUSD on testnet. */
  dripUrl: string;
}

/** BTC is also an ERC-20 on Mezo, at this address. */
export const MEZO_BTC_TOKEN: Address = '0x7b7C000000000000000000000000000000000000';

const TESTNET: MezoNetworkConfig = {
  network: 'testnet',
  chainId: 31611,
  rpcUrl: process.env.EXPO_PUBLIC_MEZO_RPC_URL || 'https://rpc.test.mezo.org',
  // Seen 2026-09-17: the iOS simulator could reach every Mezo host except rpc.test.mezo.org
  // ("Network request failed") while dRPC answered, so a second endpoint is not optional.
  rpcFallbacks: ['https://mezo-testnet.drpc.org'],
  explorer: 'https://explorer.test.mezo.org',
  faucet: 'https://faucet.test.mezo.org',
  musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
  // Deployed 2026-09-16 at block 15,572,175; source verified on explorer.test.mezo.org.
  predict: (process.env.EXPO_PUBLIC_YOSUKU_MEZO_PREDICT as Address) || '0x85c9A910143A4814346132d93F221DE3FCF6536a',
  deployBlock: BigInt(process.env.EXPO_PUBLIC_YOSUKU_MEZO_DEPLOY_BLOCK || 15_572_175),
  blockSeconds: 4,
  explorerApi: 'https://api.explorer.test.mezo.org/api',
  dexRouter: '0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9',
  dexFactory: '0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A',
  // The hosted drip (web/app/api/drip). Point EXPO_PUBLIC_MEZO_DRIP_URL at http://localhost:8787 to use
  // services/drip on this machine instead.
  dripUrl: process.env.EXPO_PUBLIC_MEZO_DRIP_URL || 'https://renqun.app/api',
};

const MAINNET: MezoNetworkConfig = {
  network: 'mainnet',
  chainId: 31612,
  rpcUrl: process.env.EXPO_PUBLIC_MEZO_RPC_URL || 'https://mainnet.mezo.public.validationcloud.io',
  rpcFallbacks: ['https://mezo-mainnet.boar.network', 'https://mezo.drpc.org'],
  explorer: 'https://explorer.mezo.org',
  faucet: null,
  musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',
  predict: (process.env.EXPO_PUBLIC_YOSUKU_MEZO_PREDICT as Address) || '',
  deployBlock: BigInt(process.env.EXPO_PUBLIC_YOSUKU_MEZO_DEPLOY_BLOCK || 0),
  blockSeconds: 4,
  explorerApi: 'https://api.explorer.mezo.org/api',
  dexRouter: '0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706',
  dexFactory: '0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248',
  dripUrl: process.env.EXPO_PUBLIC_MEZO_DRIP_URL || '',
};

export const MEZO: MezoNetworkConfig = MEZO_NETWORK === 'mainnet' ? MAINNET : TESTNET;

export const mezoChain = defineChain({
  ...(MEZO_NETWORK === 'mainnet' ? viemMezo : viemMezoTestnet),
  rpcUrls: { default: { http: [MEZO.rpcUrl, ...MEZO.rpcFallbacks] } },
});

export const MEZO_PREDICT_LIVE = MEZO.predict !== '';

/** Where people borrow MUSD against BTC. */
export const MEZO_APP_URL = MEZO_NETWORK === 'mainnet' ? 'https://mezo.org/borrow' : 'https://testnet.mezo.org';

export const IS_TESTNET = MEZO.network === 'testnet';

export const explorerTx = (hash: string) => `${MEZO.explorer}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${MEZO.explorer}/address/${addr}`;
