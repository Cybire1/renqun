// Shared number formatting for the chart. Mezo-specific formats live in lib/mezo/format.ts.
export const usd = (n: number, dp = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
