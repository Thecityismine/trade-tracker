/**
 * Chart timeframe the trade was taken on, and the exchange it was filled on.
 * Both optional. Timeframe keys match Chart Lab's (minutes lowercase, hours
 * and days uppercase) so the deep link can pass them straight through;
 * Chart Lab falls back to its nearest chart for ones it doesn't draw.
 */
export const TIMEFRAMES = ['1m', '3m', '5m', '10m', '12m', '15m', '30m', '1H', '2H', '4H', '6H', '8H', '12H', '1D'];

export const EXCHANGES = [
  { value: 'hyperliquid', label: 'Hyperliquid' },
  { value: 'bitunix', label: 'Bitunix' },
  { value: 'asterdex', label: 'AsterDEX' },
  { value: 'zoomex', label: 'Zoomex' },
  { value: 'bingx', label: 'BingX' },
];

export const exchangeLabel = (value) => EXCHANGES.find((e) => e.value === value)?.label || value || null;
