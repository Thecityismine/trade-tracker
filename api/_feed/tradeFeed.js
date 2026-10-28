import { num, text, toIso } from '../_ai/serialize.js';

/**
 * Trade feed v1: the contract between this app and Chart Lab. Documented in
 * TRADE_FEED.md — change the two together, and bump FEED_VERSION for anything
 * that is not purely additive.
 *
 * Kept separate from the AI gateway's trade mapper on purpose: that one is
 * shaped for a model to read and can change with it. This one is shaped for a
 * chart to plot, and Chart Lab depends on it not moving.
 */
export const FEED_VERSION = 1;

/** TradingView names screenshots in the chart's local time; George's is New York. */
export const DEFAULT_SCREENSHOT_TZ = 'America/New_York';

// e.g. ".../charts%2F1793107619618_BTCUSDC.P_2026-10-27_08-58-51_164a0.png?alt=media"
const SHOT_TIME = /_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_|\.)/;

function tzOffsetMs(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

/** Wall-clock time in `timeZone` → UTC ms. Second pass settles DST edges. */
function zonedToUtc([y, mo, d, h, mi, s], timeZone) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = wall - tzOffsetMs(wall, timeZone);
  const settled = wall - tzOffsetMs(utc, timeZone);
  if (settled !== utc) utc = settled;
  return utc;
}

/**
 * When the screenshot was taken, from the TradingView filename the upload
 * kept. Null for anything not named that way (pasted images, other tools).
 */
export function screenshotTime(url, timeZone = DEFAULT_SCREENSHOT_TZ) {
  const raw = text(url);
  if (!raw) return null;
  const match = SHOT_TIME.exec(decodeURIComponent(raw));
  if (!match) return null;
  const utc = zonedToUtc(match.slice(1).map(Number), timeZone);
  return Number.isNaN(utc) ? null : new Date(utc).toISOString();
}

/**
 * The best available entry and exit times, and where each came from. Order is
 * most to least precise:
 *
 *   screenshot — the chart capture at that moment (TradingView filename)
 *   app        — when the position was opened / closed in this app
 *   logged     — when a finished trade was entered after the fact; for the
 *                exit this is an upper bound, for the entry it says nothing
 *
 * `tradeDate` keeps the time of day the form was saved: the opening save for
 * an open position, the closing save once it is closed (the opening one moves
 * to `entryDate`).
 */
function times(doc, timeZone) {
  const isOpen = doc.status === 'open';
  const openedInApp = isOpen ? toIso(doc.tradeDate) : toIso(doc.entryDate);
  const closedInApp = !isOpen && doc.entryDate ? toIso(doc.tradeDate) : null;
  const logged = isOpen ? null : toIso(doc.tradeDate);

  const entryShot = screenshotTime(doc.chartImageUrl, timeZone);
  const exitShot = screenshotTime(doc.exitChartImageUrl, timeZone);

  // Before entry and exit charts were split, the one screenshot was taken
  // whenever — often at the exit. Trusted as an entry time only when the
  // trade was opened in the app (plan locked) or also has an exit chart.
  const entryShotTrusted = Boolean(entryShot && (doc.planLockedAt || doc.exitChartImageUrl || isOpen));

  const entry =
    entryShotTrusted ? { time: entryShot, source: 'screenshot' }
    : openedInApp ? { time: openedInApp, source: 'app' }
    : entryShot ? { time: entryShot, source: 'screenshot-unverified' }
    : { time: null, source: 'unknown' };

  const exit = isOpen
    ? null
    : exitShot ? { time: exitShot, source: 'screenshot' }
    : closedInApp ? { time: closedInApp, source: 'app' }
    : { time: logged, source: 'logged' };

  return { entry, exit, loggedAt: logged };
}

/** Price R from the stop: signed move ÷ |entry − stop|. Gross of fees. */
function rMultiple(doc) {
  const entry = num(doc.entryPrice);
  const exit = num(doc.exitPrice);
  const stop = num(doc.stopLoss);
  if (entry === null || exit === null || stop === null) return null;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;
  const move = doc.direction === 'short' ? entry - exit : exit - entry;
  const r = move / risk;
  return Number.isFinite(r) ? Number(r.toFixed(2)) : null;
}

export function feedTrade(doc, { appUrl = '', timeZone = DEFAULT_SCREENSHOT_TZ } = {}) {
  const isOpen = doc.status === 'open';
  const { entry, exit, loggedAt } = times(doc, timeZone);
  const asset = (text(doc.ticker) || 'BTC').toUpperCase();

  return {
    id: doc.id,
    asset,
    direction: doc.direction === 'short' ? 'short' : 'long',
    status: isOpen ? 'open' : 'closed',
    entry: { price: num(doc.entryPrice), time: entry.time, timeSource: entry.source },
    exit: isOpen ? null : { price: num(doc.exitPrice), time: exit.time, timeSource: exit.source },
    loggedAt,
    stop: num(doc.stopLoss),
    target: num(doc.targetPrice),
    leverage: num(doc.leverage),
    result: isOpen ? null : text(doc.result),
    pnlUsd: isOpen ? null : num(doc.gainLoss),
    feesUsd: num(doc.fee),
    rMultiple: isOpen ? null : rMultiple(doc),
    strategy: text(doc.strategyId) ? { id: doc.strategyId, name: text(doc.strategyName) } : null,
    entryReason: text(doc.entryReason),
    comment: text(doc.comment),
    entryChartUrl: text(doc.chartImageUrl),
    exitChartUrl: text(doc.exitChartImageUrl),
    // Hash-routed SPA with no per-trade route; the journal lists every trade.
    trackerUrl: appUrl ? `${appUrl}/#journal` : null,
  };
}

const sortTime = (t) => Date.parse(t.entry.time || t.exit?.time || t.loggedAt || 0) || 0;

/**
 * Filters (all optional): `asset`, `status` (open | closed), `ids`
 * (comma-separated), `since` / `until` (ISO or YYYY-MM-DD, against the
 * trade's entry time, falling back to exit/logged), `limit` (default 1000,
 * max 2000). Oldest first, so a chart can walk it left to right.
 */
export function buildFeed(docs, params = {}, options = {}) {
  const asset = text(params.asset)?.toUpperCase() || null;
  const status = params.status === 'open' || params.status === 'closed' ? params.status : null;
  const ids = text(params.ids) ? new Set(params.ids.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const since = text(params.since) ? Date.parse(params.since) : null;
  // A bare date for `until` means the whole of that day.
  const until = text(params.until)
    ? Date.parse(params.until) + (/^\d{4}-\d{2}-\d{2}$/.test(params.until) ? 86_400_000 - 1 : 0)
    : null;
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 1000, 1), 2000);

  let trades = docs.map((doc) => feedTrade(doc, options));
  if (asset) trades = trades.filter((t) => t.asset === asset);
  if (status) trades = trades.filter((t) => t.status === status);
  if (ids) trades = trades.filter((t) => ids.has(t.id));
  if (Number.isFinite(since)) trades = trades.filter((t) => sortTime(t) >= since);
  if (Number.isFinite(until)) trades = trades.filter((t) => sortTime(t) <= until);

  trades.sort((a, b) => sortTime(a) - sortTime(b));
  const total = trades.length;
  // Keep the newest when capped — the recent trades are the ones being reviewed.
  if (trades.length > limit) trades = trades.slice(trades.length - limit);

  return {
    version: FEED_VERSION,
    generatedAt: new Date().toISOString(),
    screenshotTimeZone: options.timeZone || DEFAULT_SCREENSHOT_TZ,
    count: trades.length,
    total,
    trades,
  };
}
