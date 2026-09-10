import { readCollection, readDocument } from './firestore.js';
import { COLLECTIONS, COLLECTION_NAMES, appBaseUrl, mapRecord, searchableText } from './schema.js';
import { accountSummary, groupPerformance, resolvePeriod, tradeStats, withinPeriod } from './metrics.js';
import { SOURCE_APP } from './serialize.js';

export const API_VERSION = 'v1';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * One request often needs the same collection more than once — the performance
 * endpoint reads trades, then strategy rollups read them again. Memoizing per
 * request keeps that to a single Firestore round trip without introducing a
 * stale cache across requests.
 */
export function createContext(req) {
  const cache = new Map();

  return {
    req,
    baseUrl: appBaseUrl(req),
    async load(name) {
      if (!COLLECTIONS[name]) {
        throw new HttpError(404, `Unknown collection "${name}". Known: ${COLLECTION_NAMES.join(', ')}.`);
      }
      if (!cache.has(name)) {
        cache.set(
          name,
          readCollection(name).then((docs) => docs.map((doc) => mapRecord(name, doc, req)))
        );
      }
      return cache.get(name);
    }
  };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clampLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
};

const sortKey = (record) => record.occurredAt || record.createdAt || record.updatedAt || null;

const newestFirst = (a, b) => {
  const left = sortKey(a) ? new Date(sortKey(a)).getTime() : 0;
  const right = sortKey(b) ? new Date(sortKey(b)).getTime() : 0;
  return right - left;
};

/** Applies the paging/window options every list endpoint accepts. */
function paginate(records, params) {
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, Number.parseInt(params.offset, 10) || 0);
  const page = records.slice(offset, offset + limit);

  return {
    count: page.length,
    totalMatching: records.length,
    limit,
    offset,
    hasMore: offset + page.length < records.length,
    records: page
  };
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

export function getManifest(ctx) {
  return {
    sourceApp: SOURCE_APP,
    description:
      'Bitcoin trading journal. Holds every logged trade, account funding, documented strategies, chart patterns, written trade reviews, mindset logs, notebook entries, alarms and AI-generated weekly reports.',
    apiVersion: API_VERSION,
    access: 'read-only',
    auth: 'Authorization: Bearer <AI_GATEWAY_KEY>',
    appUrl: ctx.baseUrl || null,
    mcpEndpoint: ctx.baseUrl ? `${ctx.baseUrl}/api/ai/mcp` : '/api/ai/mcp',
    conventions: {
      timestamps: 'ISO 8601 UTC strings',
      currency: 'All monetary fields are USD and suffixed Usd',
      identifiers: 'Every record carries a stable Firestore id in `id`',
      links:
        'The app is a hash-routed SPA with no per-record route, so `url` points at the page listing the record, not the record itself',
      emptyFields: 'Fields with no value are omitted rather than returned as null'
    },
    guidance: {
      exactFacts:
        'Use /performance, /trades, /strategies and /patterns for numbers. These come straight from the database.',
      unstructured:
        'Use /search for written material — journal reviews, mindset reflections, notebook notes and weekly reports.',
      openVsClosed:
        'Closed trades carry realized P&L. Open positions have no exit price, result or P&L and are excluded from every performance figure.'
    },
    endpoints: [
      { method: 'GET', path: '/api/ai/v1', purpose: 'This manifest' },
      { method: 'GET', path: '/api/ai/v1/collections', purpose: 'Every collection with its record counts and description' },
      { method: 'GET', path: '/api/ai/v1/collections/{name}', purpose: 'Raw records from any collection, paginated' },
      { method: 'GET', path: '/api/ai/v1/collections/{name}/{id}', purpose: 'A single record by id' },
      { method: 'GET', path: '/api/ai/v1/performance', purpose: 'Account balance, win rate, expectancy, profit factor, drawdown', params: 'period, from, to' },
      { method: 'GET', path: '/api/ai/v1/trades', purpose: 'Closed trades', params: 'period, from, to, result, ticker, direction, strategyId, limit, offset' },
      { method: 'GET', path: '/api/ai/v1/trades/{id}', purpose: 'One trade with its linked strategy and journal review' },
      { method: 'GET', path: '/api/ai/v1/positions/open', purpose: 'Currently open positions' },
      { method: 'GET', path: '/api/ai/v1/strategies', purpose: 'Strategies with per-strategy performance rollups' },
      { method: 'GET', path: '/api/ai/v1/patterns', purpose: 'Chart patterns with per-pattern performance rollups' },
      { method: 'GET', path: '/api/ai/v1/journal', purpose: 'Written post-trade reviews' },
      { method: 'GET', path: '/api/ai/v1/mindset', purpose: 'Mindset and psychology logs' },
      { method: 'GET', path: '/api/ai/v1/notebook', purpose: 'Notes, playbooks and recurring mistakes' },
      { method: 'GET', path: '/api/ai/v1/deposits', purpose: 'Funding history' },
      { method: 'GET', path: '/api/ai/v1/alarms', purpose: 'Session reminders' },
      { method: 'GET', path: '/api/ai/v1/reports/weekly', purpose: 'AI weekly reviews; add /{weekKey} for one week' },
      { method: 'POST', path: '/api/ai/v1/search', purpose: 'Full-text search across every collection', body: '{ query, collections?, recordTypes?, dateFrom?, dateTo?, limit? }' }
    ]
  };
}

export async function listCollections(ctx) {
  const collections = await Promise.all(
    COLLECTION_NAMES.map(async (name) => {
      const records = await ctx.load(name);
      const spec = COLLECTIONS[name];
      return {
        name,
        recordType: spec.recordType,
        describes: spec.describes,
        recordCount: records.length,
        searchableFields: spec.searchFields,
        endpoint: `/api/ai/${API_VERSION}/collections/${name}`
      };
    })
  );

  return { sourceApp: SOURCE_APP, collections };
}

/* ------------------------------------------------------------------ */
/* Generic collection access                                           */
/* ------------------------------------------------------------------ */

export async function getCollection(ctx, name, params = {}) {
  const records = await ctx.load(name);
  const period = resolvePeriod(params);

  const filtered = records
    .filter((record) => (period.start || period.end ? withinPeriod(sortKey(record), period) : true))
    .sort(newestFirst);

  return {
    collection: name,
    recordType: COLLECTIONS[name].recordType,
    describes: COLLECTIONS[name].describes,
    period: period.label,
    ...paginate(filtered, params)
  };
}

export async function getRecord(ctx, name, id) {
  if (!COLLECTIONS[name]) {
    throw new HttpError(404, `Unknown collection "${name}". Known: ${COLLECTION_NAMES.join(', ')}.`);
  }

  const doc = await readDocument(name, id);
  if (!doc) {
    throw new HttpError(404, `No ${COLLECTIONS[name].recordType} with id "${id}".`);
  }

  return mapRecord(name, doc, ctx.req);
}

/* ------------------------------------------------------------------ */
/* Trading views                                                       */
/* ------------------------------------------------------------------ */

/**
 * The browser splits open from closed in TradesContext; the API has to do the
 * same, and for the same reason: an open position has no P&L and would land in
 * the stats as a break-even trade.
 */
async function splitTrades(ctx) {
  const all = await ctx.load('trades');
  return {
    closed: all.filter((t) => t.status !== 'open'),
    open: all.filter((t) => t.status === 'open')
  };
}

export async function getPerformance(ctx, params = {}) {
  const { closed, open } = await splitTrades(ctx);
  const deposits = await ctx.load('deposits');
  const period = resolvePeriod(params);

  return accountSummary({ trades: closed, openTrades: open, deposits, period });
}

export async function getTrades(ctx, params = {}) {
  const { closed } = await splitTrades(ctx);
  const period = resolvePeriod(params);

  const matches = closed
    .filter((trade) => withinPeriod(trade.occurredAt, period))
    .filter((trade) => (params.result ? trade.result === String(params.result).toLowerCase() : true))
    .filter((trade) => (params.ticker ? trade.ticker?.toUpperCase() === String(params.ticker).toUpperCase() : true))
    .filter((trade) => (params.direction ? trade.direction === String(params.direction).toLowerCase() : true))
    .filter((trade) => (params.strategyId ? trade.related?.strategyId === params.strategyId : true))
    .sort(newestFirst);

  return {
    period: period.label,
    filters: {
      result: params.result || null,
      ticker: params.ticker || null,
      direction: params.direction || null,
      strategyId: params.strategyId || null
    },
    stats: tradeStats(matches),
    ...paginate(matches, params)
  };
}

/** A trade plus everything else in the app that refers to it. */
export async function getTradeDetail(ctx, id) {
  const trade = await getRecord(ctx, 'trades', id);

  const strategyId = trade.related?.strategyId;
  const strategy = strategyId ? await getRecord(ctx, 'strategies', strategyId).catch(() => null) : null;

  // Journal entries have no tradeId, so the honest link is same-day + same
  // ticker. Anything looser would invent a connection that is not in the data.
  const journal = (await ctx.load('tradeJournalEntries')).filter((entry) => {
    if (!entry.occurredAt || !trade.occurredAt) return false;
    const sameDay = entry.occurredAt.slice(0, 10) === trade.occurredAt.slice(0, 10);
    const sameTicker = !entry.ticker || !trade.ticker || entry.ticker.toUpperCase() === trade.ticker.toUpperCase();
    return sameDay && sameTicker;
  });

  return {
    trade,
    strategy,
    journalEntries: journal,
    note: journal.length
      ? 'Journal entries are matched by date and ticker, not by a stored trade id.'
      : 'No journal review was written for this trade.'
  };
}

export async function getOpenPositions(ctx) {
  const { open } = await splitTrades(ctx);
  return {
    count: open.length,
    note: 'Open positions carry no exit price, result or realized P&L and are excluded from all performance figures.',
    records: open.sort(newestFirst)
  };
}

export async function getStrategyPerformance(ctx, params = {}) {
  const strategies = await ctx.load('strategies');
  const { closed } = await splitTrades(ctx);
  const period = resolvePeriod(params);
  const inPeriod = closed.filter((trade) => withinPeriod(trade.occurredAt, period));

  const byId = new Map(
    groupPerformance(inPeriod, (t) => t.related?.strategyId, (key, group) => group[0]?.related?.strategyName || key).map(
      (row) => [row.key, row]
    )
  );

  const unattributed = inPeriod.filter((t) => !t.related?.strategyId);

  return {
    period: period.label,
    strategies: strategies
      .map((strategy) => ({
        ...strategy,
        performance: byId.get(strategy.id) || { ...tradeStats([]), label: strategy.name }
      }))
      .sort((a, b) => (b.performance.netPnlUsd || 0) - (a.performance.netPnlUsd || 0)),
    unattributedTrades: {
      note: 'Closed trades in this period with no strategyId. They are excluded from every per-strategy rollup above.',
      ...tradeStats(unattributed)
    }
  };
}

export async function getPatternPerformance(ctx, params = {}) {
  const patterns = await ctx.load('chartPatterns');
  const { closed } = await splitTrades(ctx);
  const period = resolvePeriod(params);
  const inPeriod = closed.filter((trade) => withinPeriod(trade.occurredAt, period));

  // Trades store the pattern as free text, so matching is by normalized name.
  const normalize = (value) => (value || '').trim().toLowerCase();
  const rollups = new Map(
    groupPerformance(inPeriod, (t) => normalize(t.chartPattern), (key) => key).map((row) => [row.key, row])
  );

  return {
    period: period.label,
    note: 'Trades reference a pattern by name, not by id, so rollups are matched on the normalized pattern name.',
    patterns: patterns
      .map((pattern) => ({
        ...pattern,
        performance: rollups.get(normalize(pattern.name)) || { ...tradeStats([]), label: pattern.name }
      }))
      .sort((a, b) => (b.performance.netPnlUsd || 0) - (a.performance.netPnlUsd || 0))
  };
}

export async function getWeeklyReports(ctx, params = {}) {
  const reports = (await ctx.load('weeklyReports')).sort((a, b) => (b.weekKey || '').localeCompare(a.weekKey || ''));
  return { count: reports.length, ...paginate(reports, params) };
}

/* ------------------------------------------------------------------ */
/* Universal search                                                    */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'my', 'me', 'i', 'is', 'was', 'what', 'how']);

function snippet(haystack, term, radius = 120) {
  const at = haystack.indexOf(term);
  if (at === -1) return null;

  const start = Math.max(0, at - radius);
  const end = Math.min(haystack.length, at + term.length + radius);
  return `${start > 0 ? '…' : ''}${haystack.slice(start, end).trim()}${end < haystack.length ? '…' : ''}`;
}

/**
 * Substring matching over the text fields each collection declares. This is
 * deliberately not vector search: the corpus is small, and exact-term recall
 * beats semantic similarity when the question is "where did I write about
 * revenge trading".
 */
export async function search(ctx, params = {}) {
  const query = String(params.query || params.q || '').trim();
  if (!query) {
    throw new HttpError(400, 'A "query" string is required.');
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9$%.-]/g, ''))
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));

  if (terms.length === 0) {
    throw new HttpError(400, `The query "${query}" contains no searchable terms.`);
  }

  const requested = Array.isArray(params.collections) && params.collections.length > 0 ? params.collections : COLLECTION_NAMES;
  const scope = requested.filter((name) => COLLECTIONS[name]);
  const unknown = requested.filter((name) => !COLLECTIONS[name]);
  const types = Array.isArray(params.recordTypes) && params.recordTypes.length > 0 ? new Set(params.recordTypes) : null;
  const period = resolvePeriod({ from: params.dateFrom, to: params.dateTo });

  const hits = [];

  for (const name of scope) {
    if (types && !types.has(COLLECTIONS[name].recordType)) continue;

    const records = await ctx.load(name);
    records.forEach((record) => {
      if ((params.dateFrom || params.dateTo) && !withinPeriod(sortKey(record), period)) return;

      const haystack = searchableText(name, record);
      const matched = terms.filter((term) => haystack.includes(term));
      if (matched.length === 0) return;

      // Rank by how many distinct query terms landed, then by recency.
      hits.push({
        score: matched.length / terms.length,
        matchedTerms: matched,
        snippet: snippet(haystack, matched[0]),
        record
      });
    });
  }

  hits.sort((a, b) => b.score - a.score || newestFirst(a.record, b.record));

  const limited = hits.slice(0, clampLimit(params.limit ?? 20));

  return {
    query,
    searchedTerms: terms,
    searchedCollections: scope,
    unknownCollections: unknown.length > 0 ? unknown : undefined,
    totalMatching: hits.length,
    count: limited.length,
    results: limited.map((hit) => ({
      score: Number(hit.score.toFixed(2)),
      matchedTerms: hit.matchedTerms,
      snippet: hit.snippet,
      ...hit.record
    }))
  };
}
