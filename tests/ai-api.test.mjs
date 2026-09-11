import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// Firestore Timestamp stand-in: the real one exposes toDate().
const ts = (iso) => ({ toDate: () => new Date(iso) });

const FIXTURES = {
  trades: [
    {
      id: 't1', ticker: 'BTC', direction: 'long', entryPrice: 61000, exitPrice: 62500,
      stopLoss: 60500, targetPrice: 63000, leverage: 25, gainLoss: 400, fee: 12,
      pnlPercent: 2.46, result: 'win', rr: 3, executionScore: 8, status: 'closed',
      strategyId: 's1', strategyName: 'Breakout retest', chartPattern: 'Bull flag',
      comment: 'Clean retest, held the level.', entryReason: 'Break of range high',
      plannedRR: 2.5, followedPlan: 'yes', planLockedAt: ts('2026-09-01T13:50:00Z'),
      tradeDate: ts('2026-09-01T14:00:00Z'), createdAt: ts('2026-09-01T14:05:00Z'),
      closedAt: ts('2026-09-01T16:00:00Z')
    },
    {
      id: 't2', ticker: 'BTC', direction: 'short', entryPrice: 63000, exitPrice: 63400,
      stopLoss: 63500, leverage: 25, gainLoss: -250, fee: 10, pnlPercent: -1.6,
      result: 'loss', rr: 1.5, executionScore: 4, status: 'closed',
      strategyId: 's1', strategyName: 'Breakout retest', chartPattern: 'Bull flag',
      comment: 'Revenge trade after the morning stop-out. Should not have taken it.',
      tradeDate: ts('2026-09-03T10:00:00Z'), createdAt: ts('2026-09-03T10:02:00Z')
    },
    {
      id: 't3', ticker: 'BTC', direction: 'long', entryPrice: 60000, exitPrice: 61200,
      gainLoss: 300, fee: 8, result: 'win', executionScore: 7, status: 'closed',
      leverage: 20, strategyId: 's2', strategyName: 'Range low bounce',
      tradeDate: ts('2026-08-12T09:00:00Z'), createdAt: ts('2026-08-12T09:00:00Z')
    },
    {
      // No `status` at all — trades logged before open-position tracking existed.
      id: 't4', ticker: 'BTC', direction: 'long', entryPrice: 58000, exitPrice: 57500,
      gainLoss: -180, fee: 6, result: 'loss', tradeDate: ts('2026-07-20T11:00:00Z')
    },
    {
      id: 't5', ticker: 'BTC', direction: 'long', entryPrice: 64000, stopLoss: 63200,
      targetPrice: 66000, leverage: 25, status: 'open', exitPrice: null, gainLoss: null,
      result: null, tradeDate: ts('2026-09-09T08:00:00Z')
    }
  ],
  deposits: [
    { id: 'd1', amount: 5000, type: 'deposit', date: ts('2026-06-01T12:00:00Z'), note: 'Initial funding' },
    { id: 'd2', amount: 1000, type: 'withdrawal', date: ts('2026-08-20T12:00:00Z'), note: 'Profit take' }
  ],
  strategies: [
    { id: 's1', name: 'Breakout retest', description: 'Enter on the retest of a broken range high.', whatWorked: 'Patience on the retest.', lessonsLearned: 'Skip it in chop.', tags: ['breakout'], pinned: true, createdAt: ts('2026-05-01T00:00:00Z') },
    { id: 's2', name: 'Range low bounce', description: 'Long the low of an established range.', tags: ['mean-reversion'], createdAt: ts('2026-05-02T00:00:00Z') },
    { id: 's3', name: 'Untraded idea', description: 'Never actually taken.', createdAt: ts('2026-05-03T00:00:00Z') }
  ],
  strategyEntries: [
    { id: 'se1', strategyId: 's1', title: 'Retest rules', content: 'Wait for the wick to reclaim.', createdAt: ts('2026-05-10T00:00:00Z') }
  ],
  tradeJournalEntries: [
    {
      id: 'j1', title: 'Revenge trade on the short', ticker: 'BTC', result: 'loss',
      setupType: 'Breakout retest', tradeDate: ts('2026-09-03T00:00:00Z'),
      whyGoodIdea: 'It was not a good idea.', whatWentWrong: 'I was angry after the morning stop-out and sized up.',
      feedbackForFuture: 'Walk away after two losses.', nextAction: 'Add a daily loss limit.',
      executionScore: 3, confidenceScore: 2, mindsetRating: 2, mistakeTag: 'revenge',
      ruleBroken: 'Max two trades per day', tags: ['tilt'], createdAt: ts('2026-09-03T18:00:00Z')
    }
  ],
  mindsetEntries: [
    { id: 'm1', title: 'Tilt check', type: 'reflection', session: 'london', mood: 3, confidence: 4, discipline: 2, tags: ['tilt'], reflection: 'Noticed I chase after a loss. Revenge trading is my recurring failure mode.', actionItem: 'Hard stop after two losers.', checklist: { slept: true }, createdAt: ts('2026-09-03T20:00:00Z') }
  ],
  notebookEntries: [
    { id: 'n1', title: 'Recurring mistakes', category: 'mistake', content: 'Revenge trading, oversizing, moving stops.', mistakeType: 'discipline', tags: ['review'], pinned: true, createdAt: ts('2026-08-01T00:00:00Z') }
  ],
  chartPatterns: [
    { id: 'p1', name: 'Bull flag', summary: 'Continuation after impulse.', description: 'Tight consolidation.', tradeType: 'long', timeframe: '15m', setupQuality: 'A', checklistItems: ['Impulse leg', 'Tight range'], avoidIf: ['Low volume'], patternBias: 'bullish', dateAdded: ts('2026-04-01T00:00:00Z') },
    { id: 'p2', name: 'Head and shoulders', description: 'Reversal.', tradeType: 'short', timeframe: '1h', dateAdded: ts('2026-04-02T00:00:00Z') }
  ],
  alarms: [
    { id: 'a1', time: '08:30', label: 'London open', sound: 'chime', days: ['mon', 'tue'], enabled: true }
  ],
  weeklyReports: [
    { id: '2026-08-31', weekKey: '2026-08-31', weekLabel: 'Sep 1 – Sep 7', model: 'claude-opus-5', report: 'Two trades, one revenge entry. Discipline was the binding constraint this week.', usage: { input: 100 }, tradeIds: ['t1', 't2'], chartNotes: [], chartError: null, generatedAt: ts('2026-09-08T09:00:00Z') }
  ]
};

mock.module(url('api/_ai/firestore.js'), {
  exports: {
    adminDb: () => { throw new Error('not used in tests'); },
    readCollection: async (name) => structuredClone_(FIXTURES[name] ?? []),
    readDocument: async (name, id) => structuredClone_((FIXTURES[name] ?? []).find((d) => d.id === id) ?? null)
  }
});

// structuredClone chokes on the toDate closures, so shallow-copy instead.
function structuredClone_(value) {
  if (value === null) return null;
  return Array.isArray(value) ? value.map((v) => ({ ...v })) : { ...value };
}

const { handleRest } = await import(url('api/_ai/rest.js'));
const { handleMcp } = await import(url('api/_ai/mcp.js'));

const req = (overrides = {}) => ({ method: 'GET', headers: { host: 'tracker.example.com' }, ...overrides });

const get = (pathname, params = {}) => handleRest(req(), pathname.split('/').filter(Boolean), params);

test('manifest lists endpoints and conventions', async () => {
  const m = await get('v1');
  assert.equal(m.sourceApp, 'btc-trade-tracker');
  assert.equal(m.access, 'read-only');
  assert.ok(m.endpoints.length > 10);
  assert.equal(m.mcpEndpoint, 'https://tracker.example.com/api/ai/mcp');
});

test('collections report real counts', async () => {
  const { collections } = await get('v1/collections');
  assert.equal(collections.length, 10);
  assert.equal(collections.find((c) => c.name === 'trades').recordCount, 5);
  assert.equal(collections.find((c) => c.name === 'strategies').recordCount, 3);
});

test('performance excludes open positions and matches hand-computed figures', async () => {
  const p = await get('v1/performance');

  // Closed: t1 +400, t2 -250, t3 +300, t4 -180  => net +270
  assert.equal(p.performance.tradeCount, 4);
  assert.equal(p.performance.wins, 2);
  assert.equal(p.performance.losses, 2);
  assert.equal(p.performance.netPnlUsd, 270);
  assert.equal(p.performance.winRatePercent, 50);
  assert.equal(p.performance.grossWinUsd, 700);
  assert.equal(p.performance.grossLossUsd, 430);
  assert.equal(p.performance.profitFactor, 1.63);
  assert.equal(p.performance.avgWinUsd, 350);
  assert.equal(p.performance.avgLossUsd, 215);
  assert.equal(p.performance.expectancyUsd, 67.5);
  assert.equal(p.performance.feesUsd, 36);

  // Funding: +5000 deposit, -1000 withdrawal => 4000 funded, balance 4270
  assert.equal(p.account.totalFundedUsd, 4000);
  assert.equal(p.account.currentBalanceUsd, 4270);
  assert.equal(p.account.openPositionCount, 1);
});

test('a trade with no status field counts as closed', async () => {
  const { records } = await get('v1/trades');
  assert.ok(records.some((t) => t.id === 't4'), 't4 has no status and must be treated as closed');
  assert.equal(records.every((t) => t.status === 'closed'), true);
});

test('period filtering narrows the window', async () => {
  const all = await get('v1/trades', { period: 'all' });
  const sept = await get('v1/trades', { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(all.totalMatching, 4);
  assert.equal(sept.totalMatching, 2);
  assert.equal(sept.stats.netPnlUsd, 150);
});

test('trade filters compose', async () => {
  const wins = await get('v1/trades', { result: 'win' });
  assert.equal(wins.totalMatching, 2);

  const shorts = await get('v1/trades', { direction: 'short' });
  assert.equal(shorts.totalMatching, 1);

  const byStrategy = await get('v1/trades', { strategyId: 's1' });
  assert.equal(byStrategy.totalMatching, 2);
  assert.equal(byStrategy.stats.netPnlUsd, 150);
});

test('open positions are returned separately with no P&L', async () => {
  const open = await get('v1/positions/open');
  assert.equal(open.count, 1);
  assert.equal(open.records[0].id, 't5');
  assert.equal(open.records[0].status, 'open');
  assert.equal(open.records[0].realizedPnlUsd, undefined, 'open positions must not carry a P&L field');
});

test('records carry a stable envelope', async () => {
  const trade = await get('v1/trades/t1');
  assert.equal(trade.trade.id, 't1');
  assert.equal(trade.trade.recordType, 'trade');
  assert.equal(trade.trade.sourceApp, 'btc-trade-tracker');
  assert.equal(trade.trade.url, 'https://tracker.example.com/#journal');
  assert.equal(trade.trade.occurredAt, '2026-09-01T14:00:00.000Z');
  assert.equal(trade.trade.currency, 'USD');
  assert.ok(trade.trade.summary.includes('BTC'));
  assert.equal(trade.strategy.name, 'Breakout retest');
});

test('trade detail links the same-day journal review', async () => {
  const detail = await get('v1/trades/t2');
  assert.equal(detail.journalEntries.length, 1);
  assert.equal(detail.journalEntries[0].mistakeTag, 'revenge');
});

test('strategy rollups attribute trades and flag the unattributed', async () => {
  const { strategies, unattributedTrades } = await get('v1/strategies');
  const breakout = strategies.find((s) => s.name === 'Breakout retest');
  assert.equal(breakout.performance.tradeCount, 2);
  assert.equal(breakout.performance.netPnlUsd, 150);

  const untraded = strategies.find((s) => s.name === 'Untraded idea');
  assert.equal(untraded.performance.tradeCount, 0);
  assert.equal(untraded.performance.profitFactor, null);

  // t4 has no strategyId.
  assert.equal(unattributedTrades.tradeCount, 1);
  assert.equal(unattributedTrades.netPnlUsd, -180);
});

test('pattern rollups match on normalized name', async () => {
  const { patterns } = await get('v1/patterns');
  const flag = patterns.find((p) => p.name === 'Bull flag');
  assert.equal(flag.performance.tradeCount, 2);
  const hs = patterns.find((p) => p.name === 'Head and shoulders');
  assert.equal(hs.performance.tradeCount, 0);
});

test('aliases reach the underlying collections', async () => {
  assert.equal((await get('v1/journal')).collection, 'tradeJournalEntries');
  assert.equal((await get('v1/mindset')).collection, 'mindsetEntries');
  assert.equal((await get('v1/notebook')).collection, 'notebookEntries');
  assert.equal((await get('v1/deposits')).collection, 'deposits');
  assert.equal((await get('v1/alarms')).collection, 'alarms');
});

test('weekly reports come back newest first', async () => {
  const reports = await get('v1/reports/weekly');
  assert.equal(reports.count, 1);
  const one = await get('v1/reports/weekly/2026-08-31');
  assert.equal(one.weekKey, '2026-08-31');
  assert.ok(one.report.includes('Discipline'));
});

test('search finds written material across collections', async () => {
  const hits = await search_('revenge trading');
  const types = new Set(hits.results.map((r) => r.recordType));
  assert.ok(types.has('journal_entry'), 'should hit the journal review');
  assert.ok(types.has('mindset_entry'), 'should hit the mindset log');
  assert.ok(types.has('note'), 'should hit the notebook');
  assert.ok(hits.results[0].snippet, 'every hit carries a snippet');
});

test('search can be scoped to collections', async () => {
  const hits = await search_('revenge', ['tradeJournalEntries']);
  assert.equal(hits.searchedCollections.length, 1);
  assert.ok(hits.results.every((r) => r.collection === 'tradeJournalEntries'));
});

test('search rejects an empty query', async () => {
  await assert.rejects(() => search_(''), /query/i);
});

async function search_(query, collections) {
  return handleRest(
    req({ method: 'POST', body: { query, ...(collections ? { collections } : {}) } }),
    ['v1', 'search'],
    {}
  );
}

test('gross, fees and net are reported as three distinct figures', async () => {
  const p = await get('v1/performance');

  // Each trade's gainLoss is already net of its fee, so gross is net + fees.
  // Closed: +400 -250 +300 -180 = +270 net; fees 12+10+8+6 = 36.
  assert.equal(p.performance.netPnlUsd, 270);
  assert.equal(p.performance.feesUsd, 36);
  assert.equal(p.performance.grossPnlUsd, 306);
  assert.equal(p.performance.feesAsPercentOfGross, 11.76);
});

test('fee share is null rather than a bogus number when gross is not positive', async () => {
  // July holds only t4: -180 net, 6 in fees, so gross is -174. A percentage of
  // a negative gross has no meaning and must not be reported as one.
  const losing = await get('v1/performance', { from: '2026-07-01', to: '2026-07-31' });
  assert.equal(losing.performance.netPnlUsd, -180);
  assert.equal(losing.performance.feesUsd, 6);
  assert.equal(losing.performance.grossPnlUsd, -174);
  assert.equal(losing.performance.feesAsPercentOfGross, null);
});

test('a trade planned before the outcome is distinguishable from one logged after', async () => {
  const planned = await get('v1/trades/t1');
  assert.equal(planned.trade.hadPlanBeforeOutcome, true);
  assert.equal(planned.trade.followedPlan, 'yes');
  assert.equal(planned.trade.plannedRiskRewardRatio, 2.5);
  assert.equal(planned.trade.planLockedAt, '2026-09-01T13:50:00.000Z');

  // t2 was logged after the fact: no locked plan, so its execution score was
  // recorded with the result already known.
  const backfilled = await get('v1/trades/t2');
  assert.equal(backfilled.trade.hadPlanBeforeOutcome, false);
  assert.equal(backfilled.trade.followedPlan, undefined);
  assert.equal(backfilled.trade.planLockedAt, undefined);
});

test('search reaches plan deviation notes', async () => {
  const hits = await search_('revenge');
  assert.ok(hits.searchedCollections.includes('trades'));
});

test('unknown routes and collections 404 with a useful message', async () => {
  await assert.rejects(() => get('v1/nope'), (e) => e.status === 404 && /Unknown endpoint/.test(e.message));
  await assert.rejects(() => get('v1/collections/nope'), (e) => e.status === 404 && /Known:/.test(e.message));
  await assert.rejects(() => get('v2/trades'), (e) => e.status === 404 && /Unknown API version/.test(e.message));
  await assert.rejects(() => get('v1/trades/does-not-exist'), (e) => e.status === 404);
});

test('writes are refused', async () => {
  await assert.rejects(
    () => handleRest(req({ method: 'PUT' }), ['v1', 'trades'], {}),
    (e) => e.status === 405 && /read-only/.test(e.message)
  );
  await assert.rejects(
    () => handleRest(req({ method: 'POST', body: {} }), ['v1', 'trades'], {}),
    (e) => e.status === 405
  );
});

/* ---------------------------- MCP protocol ---------------------------- */

function mockRes() {
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; }
  };
  return res;
}

async function rpc(message) {
  const res = mockRes();
  await handleMcp(req({ method: 'POST', body: message }), res);
  return res;
}

test('MCP initialize negotiates the protocol version', async () => {
  const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.result.protocolVersion, '2025-03-26');
  assert.equal(res.body.result.serverInfo.name, 'btc-trade-tracker');
  assert.ok(res.body.result.instructions.includes('get_performance'));

  const unknown = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(unknown.body.result.protocolVersion, '2025-06-18');
});

test('MCP tools/list advertises read-only tools with schemas', async () => {
  const res = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const tools = res.body.result.tools;
  assert.equal(tools.length, 11);
  assert.ok(tools.every((t) => t.inputSchema.type === 'object'));
  assert.ok(tools.every((t) => t.annotations.readOnlyHint === true));
  assert.ok(tools.every((t) => t.description.length > 30));
  assert.ok(tools.some((t) => t.name === 'get_performance'));
});

test('MCP tools/call returns real data', async () => {
  const res = await rpc({
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'get_performance', arguments: { period: 'all' } }
  });
  assert.equal(res.body.result.isError, false);
  const payload = JSON.parse(res.body.result.content[0].text);
  assert.equal(payload.account.currentBalanceUsd, 4270);
});

test('MCP tool arguments are honoured', async () => {
  const res = await rpc({
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'search_records', arguments: { query: 'revenge', limit: 2 } }
  });
  const payload = JSON.parse(res.body.result.content[0].text);
  assert.ok(payload.results.length <= 2);
  assert.equal(payload.query, 'revenge');
});

test('a failing MCP tool reports through the result, not a protocol error', async () => {
  const res = await rpc({
    jsonrpc: '2.0', id: 6, method: 'tools/call',
    params: { name: 'get_trade', arguments: { id: 'nope' } }
  });
  assert.equal(res.body.result.isError, true);
  assert.ok(res.body.result.content[0].text.includes('get_trade failed'));
  assert.equal(res.body.error, undefined);
});

test('MCP rejects an unknown tool and unknown method', async () => {
  const bad = await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'delete_everything' } });
  assert.equal(bad.body.error.code, -32602);

  const nope = await rpc({ jsonrpc: '2.0', id: 8, method: 'resources/subscribe' });
  assert.equal(nope.body.error.code, -32601);
});

test('MCP notifications get 202 and no body', async () => {
  const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body, null);
});

test('MCP resources list and read', async () => {
  const list = await rpc({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
  assert.equal(list.body.result.resources.length, 10);

  const read = await rpc({ jsonrpc: '2.0', id: 10, method: 'resources/read', params: { uri: 'tradetracker://trades' } });
  const payload = JSON.parse(read.body.result.contents[0].text);
  assert.equal(payload.collection, 'trades');
  assert.equal(payload.records.length, 5);
});

test('MCP handles batches and rejects malformed frames', async () => {
  const res = await rpc([
    { jsonrpc: '2.0', id: 11, method: 'ping' },
    { jsonrpc: '2.0', id: 12, method: 'tools/list' },
    { id: 13, method: 'ping' }
  ]);
  assert.equal(res.body.length, 3);
  assert.equal(res.body[2].error.code, -32600);
});

test('MCP refuses GET', async () => {
  const res = mockRes();
  await handleMcp(req({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
});
