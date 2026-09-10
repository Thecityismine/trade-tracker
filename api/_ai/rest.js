import {
  API_VERSION,
  HttpError,
  createContext,
  getCollection,
  getManifest,
  getOpenPositions,
  getPatternPerformance,
  getPerformance,
  getRecord,
  getStrategyPerformance,
  getTradeDetail,
  getTrades,
  getWeeklyReports,
  listCollections,
  search
} from './resources.js';

/** Aliases so a caller can ask for /journal rather than /collections/tradeJournalEntries. */
const COLLECTION_ALIASES = {
  journal: 'tradeJournalEntries',
  mindset: 'mindsetEntries',
  notebook: 'notebookEntries',
  deposits: 'deposits',
  alarms: 'alarms'
};

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length > 0) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/**
 * Routes the segments after /api/ai/. Kept as one function rather than one file
 * per endpoint so the whole AI surface costs a single serverless function.
 */
export async function handleRest(req, segments, params) {
  const [version, ...rest] = segments;

  if (version !== API_VERSION) {
    throw new HttpError(404, `Unknown API version "${version}". This app serves ${API_VERSION}.`);
  }

  const ctx = createContext(req);
  const [head, second, third] = rest;

  // POST is only ever search; everything else is a read.
  if (req.method === 'POST') {
    if (head !== 'search') {
      throw new HttpError(405, `POST is only supported on /api/ai/${API_VERSION}/search. This API is read-only.`);
    }
    const body = await readJsonBody(req);
    return search(ctx, { ...params, ...body });
  }

  if (req.method !== 'GET') {
    throw new HttpError(405, 'This API is read-only. Use GET, or POST to /search.');
  }

  if (!head) {
    return getManifest(ctx);
  }

  switch (head) {
    case 'collections':
      if (!second) return listCollections(ctx);
      if (!third) return getCollection(ctx, second, params);
      return getRecord(ctx, second, third);

    case 'performance':
      return getPerformance(ctx, params);

    case 'trades':
      return second ? getTradeDetail(ctx, second) : getTrades(ctx, params);

    case 'positions':
      if (second && second !== 'open') {
        throw new HttpError(404, 'Only /positions/open exists. Closed trades live at /trades.');
      }
      return getOpenPositions(ctx);

    case 'strategies':
      return second ? getRecord(ctx, 'strategies', second) : getStrategyPerformance(ctx, params);

    case 'patterns':
      return second ? getRecord(ctx, 'chartPatterns', second) : getPatternPerformance(ctx, params);

    case 'reports':
      if (second !== 'weekly') {
        throw new HttpError(404, 'Only /reports/weekly exists.');
      }
      return third ? getRecord(ctx, 'weeklyReports', third) : getWeeklyReports(ctx, params);

    case 'search':
      return search(ctx, params);

    default: {
      const collection = COLLECTION_ALIASES[head];
      if (!collection) {
        throw new HttpError(404, `Unknown endpoint "/${head}". GET /api/ai/${API_VERSION} lists what exists.`);
      }
      return second ? getRecord(ctx, collection, second) : getCollection(ctx, collection, params);
    }
  }
}
