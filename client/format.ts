// Number and time formatting for Renqun screens. Money is MUSD (18 decimals) shown to the cent.

const two = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 1234.5 → "1,234.50" */
export const money = (n: number) => two.format(Number.isFinite(n) ? n : 0);

/** MUSD wei → "1,234.50" (rounded down, so a balance never reads higher than it is). */
export function musd(wei: bigint | null | undefined): string {
  if (wei == null) return '—';
  const cents = wei / 10n ** 16n;
  return two.format(Number(cents) / 100);
}

/** MUSD wei → nearest cent. For derived values (a pool share worth 10 MUSD less 1 wei reads 10.00). */
export function musdNearest(wei: bigint | null | undefined): string {
  if (wei == null) return '—';
  const cents = (wei + 5n * 10n ** 15n) / 10n ** 16n;
  return two.format(Number(cents) / 100);
}

/** 76210 → "$76,210" */
export const usd0 = (n: number) => (Number.isFinite(n) ? `$${whole.format(Math.round(n))}` : '—');

/** 76210 → "76,210" */
export const num0 = (n: number) => (Number.isFinite(n) ? whole.format(Math.round(n)) : '—');

/** BTC wei → "0.0050" */
export function btc(wei: bigint | null | undefined, dp = 4): string {
  if (wei == null) return '—';
  return (Number(wei) / 1e18).toFixed(dp);
}

/** 0.6487 → "65%"; the ends read "99%+" and "<1%" rather than a certainty the market does not offer. */
export const pct = (p: number) => (p >= 0.995 ? '99%+' : p <= 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

/** Payout multiple for a chance and fee: 0.65, 1% → "1.52×" */
export const pays = (chance: number, feeRate = 0.01) => (chance > 0 ? `${(1 / (chance * (1 + feeRate))).toFixed(2)}×` : '—');

/** ms left → "03:42", "53:42", "1:02:03" */
export function clock(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** ms left → "3h 53m", "12m", "40s" */
export function inWords(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** ms epoch → local "14:10" */
export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ms epoch → "7:00 PM", or "1:00 AM tomorrow" / "1:00 AM Fri" when it is not today. Reads after "at". */
export function timeWords(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOf = (x: number) => new Date(x).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(ms) - startOf(now)) / 86_400_000);
  if (days === 0) return t;
  if (days === 1) return `${t} tomorrow`;
  return `${t} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
