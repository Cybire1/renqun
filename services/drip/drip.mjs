// Renqun starter drip: tops up a player's wallet so the first bet needs nothing else.
//
//   testnet: a little BTC for gas, plus DRIP_MUSD test MUSD once per wallet
//   mainnet: gas only. Put device attestation (App Attest / Play Integrity) in front of it and set
//            DRIP_API_KEY before real money is involved; otherwise anyone can farm the gas budget.
//
// Gas on Mezo is priced at a few hundred wei (testnet) to ~1.5 Mwei (mainnet), so 0.00002 BTC covers
// hundreds of bets. The app calls POST /drip {address} on first launch and whenever gas runs low.
//
// env:
//   DRIP_PRIVATE_KEY          funded wallet (required). Use its own key, not the keeper's: two
//                             processes sending from one account race each other's nonces.
//   MEZO_NETWORK              testnet | mainnet (default testnet)
//   MEZO_RPC_URL              default: the network's public RPC
//   PORT                      default 8787
//   DRIP_GAS_WEI              BTC sent per top-up (default 0.00002 BTC)
//   DRIP_GAS_BELOW            top up only when the wallet holds less than this (default 0.000005 BTC)
//   DRIP_MUSD                 test MUSD per new wallet, testnet only (default 20)
//   DRIP_DAILY_WALLETS        new wallets served per day, all callers (default 50)
//   DRIP_PER_IP               new wallets per caller IP per day (default 5)
//   DRIP_API_KEY              when set, requests must send it as `x-drip-key`
//   DRIP_STATE_FILE           default ./.drip-state.json next to this file
//
// run:  DRIP_PRIVATE_KEY=0x… npm run drip   (from the repo root)

import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http as httpTransport,
  isAddress,
  nonceManager,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mezo, mezoTestnet } from 'viem/chains';

const NETWORK = process.env.MEZO_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const RPC =
  process.env.MEZO_RPC_URL ||
  (NETWORK === 'mainnet' ? 'https://mainnet.mezo.public.validationcloud.io' : 'https://rpc.test.mezo.org');
const MUSD =
  NETWORK === 'mainnet' ? '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186' : '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const PORT = Number(process.env.PORT || 8787);
const GAS_WEI = BigInt(process.env.DRIP_GAS_WEI || 20_000_000_000_000n);
const GAS_BELOW = BigInt(process.env.DRIP_GAS_BELOW || 5_000_000_000_000n);
const MUSD_WEI = NETWORK === 'mainnet' ? 0n : BigInt(Math.round(Number(process.env.DRIP_MUSD ?? 20) * 100)) * 10n ** 16n;
const DAILY_WALLETS = Number(process.env.DRIP_DAILY_WALLETS || 50);
const PER_IP = Number(process.env.DRIP_PER_IP || 5);
const API_KEY = process.env.DRIP_API_KEY || '';
const STATE_FILE = process.env.DRIP_STATE_FILE || new URL('./.drip-state.json', import.meta.url).pathname;
const GAS_TOPUPS_PER_DAY = 3;

if (!process.env.DRIP_PRIVATE_KEY) throw new Error('DRIP_PRIVATE_KEY is required');
if (NETWORK === 'mainnet' && !API_KEY) throw new Error('mainnet drip needs DRIP_API_KEY behind device attestation');

const chain = defineChain({ ...(NETWORK === 'mainnet' ? mezo : mezoTestnet), rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(process.env.DRIP_PRIVATE_KEY, { nonceManager });
const transport = httpTransport(RPC, { retryCount: 3, retryDelay: 400, timeout: 20_000 });
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, account, transport });
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);

const log = (...a) => console.log(new Date().toISOString(), ...a);
const today = () => new Date().toISOString().slice(0, 10);

// ─── state: who got what, today and ever ───

let state = { day: today(), wallets: {}, ips: {}, served: 0 };
try {
  state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
} catch {
  /* first run */
}
function rollDay() {
  if (state.day === today()) return;
  state.day = today();
  state.ips = {};
  state.served = 0;
  for (const w of Object.values(state.wallets)) w.gasToday = 0;
}
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ─── sending: one job at a time so nonces stay in order ───

let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

async function waitForReceipt(hash, timeoutMs = 90_000) {
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
  throw new Error(`no receipt for ${hash}`);
}

async function send(request) {
  try {
    const hash = await wallet.sendTransaction({ ...request, gas: request.gas ?? 150_000n });
    const receipt = await waitForReceipt(hash);
    if (receipt.status !== 'success') throw new Error(`reverted ${hash}`);
    return hash;
  } catch (e) {
    nonceManager.reset({ address: account.address, chainId: chain.id });
    throw e;
  }
}

async function drip(address, ip) {
  rollDay();
  const key = address.toLowerCase();
  const w = (state.wallets[key] ??= { first: new Date().toISOString(), musd: false, gasToday: 0 });
  const isNew = !state.ips[ip]?.includes(key) && w.gasToday === 0 && !w.musd;

  if (isNew) {
    if (state.served >= DAILY_WALLETS) return { status: 429, body: { error: 'The daily starter budget is used up. Try again tomorrow.' } };
    if ((state.ips[ip]?.length ?? 0) >= PER_IP) return { status: 429, body: { error: 'Too many new wallets from this network today.' } };
  }

  const btc = await pub.getBalance({ address });

  const out = { address, network: NETWORK, gas: null, musd: null };
  if (btc < GAS_BELOW && w.gasToday < GAS_TOPUPS_PER_DAY) {
    out.gas = { amount: GAS_WEI.toString(), hash: await send({ to: address, value: GAS_WEI, gas: 60_000n }) };
    w.gasToday += 1;
  }
  // Once per wallet, whatever it holds: the app only asks on its own when the wallet is empty, and the
  // player's "Get 20" tap is an explicit request.
  if (MUSD_WEI > 0n && !w.musd) {
    const data = encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [address, MUSD_WEI] });
    out.musd = { amount: MUSD_WEI.toString(), hash: await send({ to: MUSD, data, gas: 150_000n }) };
    w.musd = true;
  }
  // Lets the app hide its "free test MUSD" button once a wallet has had its share.
  out.musdGiven = w.musd;
  if (out.gas || out.musd) {
    if (isNew) {
      state.served += 1;
      (state.ips[ip] ??= []).push(key);
    }
    save();
    log('drip', address, out.gas ? 'gas' : '', out.musd ? 'musd' : '', ip);
  }
  return { status: 200, body: out };
}

// ─── http ───

function reply(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-drip-key',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return reply(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') {
    const [btc, musd] = await Promise.all([
      pub.getBalance({ address: account.address }),
      pub.readContract({ address: MUSD, abi: erc20, functionName: 'balanceOf', args: [account.address] }),
    ]).catch(() => [null, null]);
    return reply(res, 200, { ok: true, network: NETWORK, wallet: account.address, btc: btc?.toString(), musd: musd?.toString(), servedToday: state.served });
  }
  if (req.method !== 'POST' || req.url !== '/drip') return reply(res, 404, { error: 'Not found' });
  if (API_KEY && req.headers['x-drip-key'] !== API_KEY) return reply(res, 401, { error: 'Missing or wrong key' });

  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 2_000) req.destroy();
  });
  req.on('end', async () => {
    let address;
    try {
      address = JSON.parse(raw || '{}').address;
    } catch {
      return reply(res, 400, { error: 'Send JSON: {"address": "0x…"}' });
    }
    if (typeof address !== 'string' || !isAddress(address)) return reply(res, 400, { error: 'That is not a wallet address.' });
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown').trim();
    try {
      const { status, body } = await serial(() => drip(getAddress(address), ip));
      reply(res, status, body);
    } catch (e) {
      log('drip failed', address, e.shortMessage || e.message);
      reply(res, 502, { error: 'Mezo did not accept the top-up. Try again in a minute.' });
    }
  });
});

server.listen(PORT, () => log(`renqun drip · ${NETWORK} · wallet ${account.address} · :${PORT}`));
