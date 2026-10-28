import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFeed, feedTrade, screenshotTime, FEED_VERSION } from '../api/_feed/tradeFeed.js';

const ts = (iso) => ({ toDate: () => new Date(iso) });
const shot = (name) =>
  `https://firebasestorage.googleapis.com/v0/b/x/o/charts%2F1793107619618_${name}_164a0.png?alt=media&token=t`;

// Shaped like the Oct 27 trade: opened in the app, closed later, both charts.
const opened = {
  id: 'oct27', ticker: 'BTC', direction: 'short', status: 'closed',
  entryPrice: 80383, exitPrice: 81004, stopLoss: 80866, targetPrice: 78937, leverage: 40,
  gainLoss: -17.18, fee: 2, result: 'loss',
  entryDate: ts('2026-10-27T13:27:02Z'), tradeDate: ts('2026-10-27T21:41:51Z'),
  planLockedAt: ts('2026-10-27T13:27:03Z'),
  chartImageUrl: shot('BTCUSDC.P_2026-10-27_08-58-51'),
  exitChartImageUrl: shot('BTCUSDC.P_2026-10-27_17-33-38'),
  strategyId: 's1', strategyName: 'NY 8pm Session',
};

test('screenshot filenames convert from New York time, across DST', () => {
  assert.equal(screenshotTime(shot('BTCUSDC.P_2026-10-27_08-58-51')), '2026-10-27T12:58:51.000Z'); // EDT
  assert.equal(screenshotTime(shot('BTCUSDC.P_2026-01-15_09-00-00')), '2026-01-15T14:00:00.000Z'); // EST
  assert.equal(screenshotTime('https://x/o/charts%2F123_paste.png'), null);
  assert.equal(screenshotTime(null), null);
});

test('a trade opened in the app uses both screenshots', () => {
  const t = feedTrade(opened);
  assert.deepEqual(t.entry, { price: 80383, time: '2026-10-27T12:58:51.000Z', timeSource: 'screenshot' });
  assert.deepEqual(t.exit, { price: 81004, time: '2026-10-27T21:33:38.000Z', timeSource: 'screenshot' });
  assert.equal(t.rMultiple, -1.29);
  assert.deepEqual(t.strategy, { id: 's1', name: 'NY 8pm Session' });
});

test('without screenshots, app times are used', () => {
  const t = feedTrade({ ...opened, chartImageUrl: null, exitChartImageUrl: null });
  assert.deepEqual(t.entry, { price: 80383, time: '2026-10-27T13:27:02.000Z', timeSource: 'app' });
  assert.equal(t.exit.timeSource, 'app');
  assert.equal(t.exit.time, '2026-10-27T21:41:51.000Z');
});

test('a trade logged after the fact: single screenshot is unverified, exit is the log time', () => {
  const t = feedTrade({
    id: 'old', ticker: 'btc', direction: 'long', status: 'closed',
    entryPrice: 100, exitPrice: 90, gainLoss: -10, result: 'loss',
    tradeDate: ts('2026-10-25T11:08:52Z'),
    chartImageUrl: shot('BTCUSDC.P_2026-10-25_07-04-05'),
  });
  assert.equal(t.asset, 'BTC');
  assert.equal(t.entry.timeSource, 'screenshot-unverified');
  assert.deepEqual(t.exit, { price: 90, time: '2026-10-25T11:08:52.000Z', timeSource: 'logged' });
  assert.equal(t.rMultiple, null, 'no stop, no R');
});

test('no times at all: entry unknown, loggedAt still given', () => {
  const t = feedTrade({ id: 'x', status: 'closed', entryPrice: 1, exitPrice: 2, tradeDate: ts('2026-01-02T00:00:00Z') });
  assert.deepEqual(t.entry, { price: 1, time: null, timeSource: 'unknown' });
  assert.equal(t.loggedAt, '2026-01-02T00:00:00.000Z');
});

test('open positions have no exit, result or P&L', () => {
  const t = feedTrade({
    id: 'live', ticker: 'ETH', direction: 'long', status: 'open', entryPrice: 2500, stopLoss: 2450,
    tradeDate: ts('2026-10-28T14:00:00Z'), planLockedAt: ts('2026-10-28T14:00:00Z'),
  });
  assert.equal(t.status, 'open');
  assert.equal(t.exit, null);
  assert.equal(t.pnlUsd, null);
  assert.deepEqual(t.entry, { price: 2500, time: '2026-10-28T14:00:00.000Z', timeSource: 'app' });
});

test('feed filters, sorts oldest first and caps to the newest', () => {
  const docs = [
    opened,
    { id: 'eth', ticker: 'ETH', status: 'closed', entryPrice: 1, exitPrice: 2, tradeDate: ts('2026-10-20T00:00:00Z') },
    { id: 'early', ticker: 'BTC', status: 'closed', entryPrice: 1, exitPrice: 2, tradeDate: ts('2026-10-01T00:00:00Z') },
  ];
  const all = buildFeed(docs);
  assert.equal(all.version, FEED_VERSION);
  assert.deepEqual(all.trades.map((t) => t.id), ['early', 'eth', 'oct27']);

  assert.deepEqual(buildFeed(docs, { asset: 'eth' }).trades.map((t) => t.id), ['eth']);
  assert.deepEqual(buildFeed(docs, { ids: 'oct27, early' }).trades.map((t) => t.id), ['early', 'oct27']);
  assert.deepEqual(buildFeed(docs, { since: '2026-10-15' }).trades.map((t) => t.id), ['eth', 'oct27']);
  assert.deepEqual(buildFeed(docs, { until: '2026-10-20' }).trades.map((t) => t.id), ['early', 'eth']);

  const capped = buildFeed(docs, { limit: '1' });
  assert.equal(capped.count, 1);
  assert.equal(capped.total, 3);
  assert.equal(capped.trades[0].id, 'oct27');
});

test('tracker link is built from the app URL when known', () => {
  assert.equal(feedTrade(opened, { appUrl: 'https://app.example' }).trackerUrl, 'https://app.example/#journal');
  assert.equal(feedTrade(opened).trackerUrl, null);
});
