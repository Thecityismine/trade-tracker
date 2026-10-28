/**
 * Deep links into Chart Lab (the swing-trading chart app). Chart Lab reads
 * the trade itself from /api/trade-feed by id; `asset` and `t` only let it
 * open the right chart while that loads. Parameter names are part of the
 * contract in TRADE_FEED.md.
 */
export const CHART_LAB_URL = (import.meta.env.VITE_CHART_LAB_URL || 'https://skyline-chart-lab.vercel.app').replace(/\/$/, '');

const toDate = (v) => v?.toDate?.() || (v ? new Date(v) : null);

export function chartLabUrl(trade) {
  const params = new URLSearchParams({ trade: trade.id, asset: (trade.ticker || 'BTC').toUpperCase() });
  // Best time the browser knows without parsing screenshots: when it was
  // opened in the app, else when it was logged.
  const when = toDate(trade.status === 'open' ? trade.tradeDate : trade.entryDate || trade.tradeDate);
  if (when && !Number.isNaN(when.getTime())) params.set('t', String(Math.floor(when.getTime() / 1000)));
  return `${CHART_LAB_URL}/?${params}`;
}
