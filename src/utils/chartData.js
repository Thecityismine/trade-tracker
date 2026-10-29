import { postJson } from './weeklyReport';
import { feedTrade } from '../../api/_feed/tradeFeed.js';

/**
 * Chart Lab's data API, through /api/chart (contract: CHART_DATA.md).
 * Chart Lab does the maths; this side only asks and draws.
 */
export const fetchChartData = (path, params = {}) => postJson('/api/chart', { path, params });

export const DEFAULT_TF = '10m';
export const REVIEW_TFS = ['10m', '12m', '15m', '30m', '1H', '4H', '1D'];

export const TF_SECONDS = {
  '1m': 60, '3m': 180, '5m': 300, '10m': 600, '12m': 720, '15m': 900, '30m': 1800,
  '1H': 3600, '2H': 7200, '4H': 14400, '6H': 21600, '8H': 28800, '12H': 43200,
  '1D': 86400, '3D': 259200, '1W': 604800,
};

/**
 * Chart Lab draws nothing below 10m. A trade logged on 1m/3m/5m opens on 10m,
 * the nearest chart it has, as the contract says.
 */
export function chartTf(tf) {
  if (!tf) return DEFAULT_TF;
  const key = tf.replace(/h$/, 'H').replace(/d$/, 'D');
  if (['1m', '3m', '5m'].includes(key)) return '10m';
  return TF_SECONDS[key] ? key : DEFAULT_TF;
}

/** "BTCUSDC.P", "btc-usdt", "ETH/USDT", "SOLPERP" → the plain coin name. */
export function normalizeAsset(ticker) {
  let s = String(ticker || 'BTC').trim().toUpperCase();
  s = s.replace(/\.P$/, '').replace(/[-_ ]?PERP(ETUAL)?$/, '');
  s = s.split(/[/:-]/)[0];
  const quote = s.match(/^(.+?)(USDT|USDC|USD|BUSD)$/);
  if (quote && quote[1].length >= 2) s = quote[1];
  return s || 'BTC';
}

/**
 * Best entry and exit times, the same way the trade feed works them out
 * (screenshot, opened in app, logged), as Unix seconds plus how sure.
 */
export function tradeTimes(trade) {
  const f = feedTrade(trade);
  const secs = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : null);
  return {
    entry: secs(f.entry.time),
    entrySource: f.entry.timeSource,
    exit: secs(f.exit?.time),
    exitSource: f.exit?.timeSource || null,
    logged: secs(f.loggedAt),
  };
}

/** Where a review chart window should end: a little after the exit, never in the future. */
export function windowEnd(trade, tf) {
  const step = TF_SECONDS[tf] || 600;
  const { exit, entry, logged } = tradeTimes(trade);
  const anchor = exit || logged || entry || Math.floor(Date.now() / 1000);
  return Math.min(anchor + step * 40, Math.floor(Date.now() / 1000));
}

/** Assets you've traded, most recent first, as plain coin names. */
export function tradedAssets(trades) {
  const seen = new Map();
  for (const t of trades) {
    const a = normalizeAsset(t.ticker);
    if (!seen.has(a)) seen.set(a, true);
  }
  return [...seen.keys()];
}
