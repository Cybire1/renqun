// Starter drip on Vercel (testnet only): the same job as services/drip, without a state file.
// A wallet gets gas when it is nearly out (three top-ups a day) and 20 test MUSD once, ever. What it
// has already had is read from the chain through the explorer, so any number of function instances
// agree; the daily budget is the drip wallet's own MUSD sends today.
//
// env: DRIP_PRIVATE_KEY (the drip wallet; not the keeper's). The app and the site call
// POST /api/drip {address}; GET /api/drip reports the wallet's balances.
import { NextResponse } from 'next/server';
import { createWalletClient, encodeFunctionData, getAddress, http, isAddress, parseAbi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { IS_TESTNET, MEZO, mezoChain, mezoClient } from '@renqun/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GAS_WEI = 20_000_000_000_000n; // 0.00002 BTC per top-up
const GAS_BELOW = 5_000_000_000_000n; // top up under 0.000005 BTC
const MUSD_WEI = 20n * 10n ** 18n;
const GAS_TOPUPS_PER_DAY = 3;
const DAILY_WALLETS = 50;

const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};

const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: CORS });

function dripAccount() {
  const key = process.env.DRIP_PRIVATE_KEY;
  return key ? privateKeyToAccount(key as Hex) : null;
}

interface ExplorerTx {
  from: string;
  to: string;
  value: string;
  timeStamp: string;
}

async function explorer(params: Record<string, string>): Promise<ExplorerTx[]> {
  const res = await fetch(`${MEZO.explorerApi}?${new URLSearchParams(params)}`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
  const body = (await res.json()) as { result?: ExplorerTx[] | string; message?: string };
  if (Array.isArray(body.result)) return body.result;
  if (typeof body.message === 'string' && /no (transactions|token transfers|records)/i.test(body.message)) return [];
  throw new Error(`explorer: ${body.message ?? 'bad response'}`);
}

const startOfTodayUtc = () => Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  const account = dripAccount();
  if (!IS_TESTNET || !account) return reply(404, { ok: false, error: 'No drip on this network.' });
  const pub = mezoClient();
  const [btc, musd] = await Promise.all([
    pub.getBalance({ address: account.address }),
    pub.readContract({ address: MEZO.musd, abi: erc20, functionName: 'balanceOf', args: [account.address] }),
  ]);
  return reply(200, { ok: true, network: MEZO.network, wallet: account.address, btc: btc.toString(), musd: musd.toString() });
}

export async function POST(req: Request) {
  const account = dripAccount();
  if (!IS_TESTNET || !account) return reply(404, { error: 'No drip on this network.' });

  let address: Address;
  try {
    const body = (await req.json()) as { address?: unknown };
    if (typeof body.address !== 'string' || !isAddress(body.address)) return reply(400, { error: 'That is not a wallet address.' });
    address = getAddress(body.address);
  } catch {
    return reply(400, { error: 'Send JSON: {"address": "0x…"}' });
  }

  try {
    const pub = mezoClient();
    const drip = account.address.toLowerCase();
    const today = startOfTodayUtc();
    const [btc, musd, musdIn, txs] = await Promise.all([
      pub.getBalance({ address }),
      pub.readContract({ address: MEZO.musd, abi: erc20, functionName: 'balanceOf', args: [address] }),
      explorer({ module: 'account', action: 'tokentx', address, contractaddress: MEZO.musd, sort: 'desc', page: '1', offset: '1000' }),
      explorer({ module: 'account', action: 'txlist', address, sort: 'desc', page: '1', offset: '200' }),
    ]);
    const hadMusd = musdIn.some((t) => t.from.toLowerCase() === drip);
    const gasToday = txs.filter((t) => t.from.toLowerCase() === drip && BigInt(t.value) > 0n && Number(t.timeStamp) >= today).length;

    const wantsGas = btc < GAS_BELOW && gasToday < GAS_TOPUPS_PER_DAY;
    const wantsMusd = !hadMusd;
    if (wantsMusd) {
      const sentToday = (
        await explorer({ module: 'account', action: 'tokentx', address: account.address, contractaddress: MEZO.musd, sort: 'desc', page: '1', offset: '200' })
      ).filter((t) => t.from.toLowerCase() === drip && Number(t.timeStamp) >= today).length;
      if (sentToday >= DAILY_WALLETS) return reply(429, { error: 'The daily starter budget is used up. Try again tomorrow.' });
    }

    const wallet = createWalletClient({ account, chain: mezoChain, transport: http(MEZO.rpcUrl, { retryCount: 2, timeout: 15_000 }) });
    // Other instances (and the local drip) send from this wallet too: take the pending nonce now and
    // retry once from a fresh one if another send got there first.
    const out: { gas: { amount: string; hash: string } | null; musd: { amount: string; hash: string } | null } = { gas: null, musd: null };
    const sendMissing = async () => {
      let nonce = await pub.getTransactionCount({ address: account.address, blockTag: 'pending' });
      if (wantsGas && !out.gas) {
        const hash = await wallet.sendTransaction({ to: address, value: GAS_WEI, gas: 60_000n, nonce: nonce++ });
        out.gas = { amount: GAS_WEI.toString(), hash };
      }
      if (wantsMusd && !out.musd) {
        const data = encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [address, MUSD_WEI] });
        const hash = await wallet.sendTransaction({ to: MEZO.musd, data, gas: 150_000n, nonce: nonce++ });
        out.musd = { amount: MUSD_WEI.toString(), hash };
      }
    };
    try {
      await sendMissing();
    } catch (e) {
      if (!/nonce|underpriced|already known/i.test(String((e as Error).message))) throw e;
      await sendMissing();
    }
    // Sends are broadcast, not yet mined; the app and site poll the balance.
    return reply(200, { address, network: MEZO.network, ...out, musdGiven: hadMusd || out.musd != null, balances: { btc: btc.toString(), musd: musd.toString() } });
  } catch (e) {
    console.error('drip failed', address, (e as Error).message);
    return reply(502, { error: 'Mezo did not accept the top-up. Try again in a minute.' });
  }
}
