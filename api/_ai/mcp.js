import {
  API_VERSION,
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
import { COLLECTIONS, COLLECTION_NAMES } from './schema.js';
import { SOURCE_APP } from './serialize.js';

const SERVER_INFO = { name: 'btc-trade-tracker', title: 'Trade Tracker', version: '1.0.0' };

// Newest first. An unknown version from the client is answered with the newest
// we speak, which the spec allows the client to then reject.
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const PERIOD_ENUM = ['all', 'today', 'week', 'month', '30d', '90d', 'ytd'];

const periodProperties = {
  period: {
    type: 'string',
    enum: PERIOD_ENUM,
    description: 'Named time window. Defaults to "all".'
  },
  from: { type: 'string', description: 'ISO date lower bound (YYYY-MM-DD). Overrides `period` when set.' },
  to: { type: 'string', description: 'ISO date upper bound (YYYY-MM-DD).' }
};

/**
 * Every tool here reads. Nothing in this server mutates Firestore, which is why
 * they all carry readOnlyHint — a client is free to run them without asking.
 */
const TOOLS = [
  {
    name: 'describe_data',
    title: 'Describe available data',
    description:
      'What this app stores and how to query it: every collection, its record counts, its fields and which endpoint answers which kind of question. Call this first when unsure where an answer lives.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (ctx) => ({ manifest: getManifest(ctx), ...(await listCollections(ctx)) })
  },
  {
    name: 'get_performance',
    title: 'Get trading performance',
    description:
      'Account balance, total funded, realized P&L, win rate, expectancy, profit factor, fees, drawdown, current streak and best/worst trade for a period. Use this for any "how am I doing" question rather than adding up trades yourself.',
    inputSchema: { type: 'object', properties: { ...periodProperties }, additionalProperties: false },
    handler: (ctx, args) => getPerformance(ctx, args)
  },
  {
    name: 'list_trades',
    title: 'List closed trades',
    description:
      'Closed trades with entry, exit, stop, leverage, realized P&L, R:R and execution score, plus aggregate stats for the filtered set. Open positions are excluded — use get_open_positions for those.',
    inputSchema: {
      type: 'object',
      properties: {
        ...periodProperties,
        result: { type: 'string', enum: ['win', 'loss'], description: 'Only trades with this outcome.' },
        ticker: { type: 'string', description: 'Symbol, e.g. "BTC".' },
        direction: { type: 'string', enum: ['long', 'short'] },
        strategyId: { type: 'string', description: 'Only trades taken on this strategy.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Defaults to 50.' },
        offset: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    },
    handler: (ctx, args) => getTrades(ctx, args)
  },
  {
    name: 'get_trade',
    title: 'Get one trade',
    description:
      'A single trade in full, along with the strategy it was taken on and any journal review written the same day for the same ticker.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The trade id.' } },
      required: ['id'],
      additionalProperties: false
    },
    handler: (ctx, args) => getTradeDetail(ctx, args.id)
  },
  {
    name: 'get_open_positions',
    title: 'Get open positions',
    description: 'Positions still open: entry, stop, target, leverage and direction. These have no P&L yet.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: (ctx) => getOpenPositions(ctx)
  },
  {
    name: 'get_strategies',
    title: 'Get strategies with performance',
    description:
      'Every documented strategy — its rules, what worked, lessons learned — with a performance rollup of the trades taken on it. Answers "which of my setups is actually working".',
    inputSchema: { type: 'object', properties: { ...periodProperties }, additionalProperties: false },
    handler: (ctx, args) => getStrategyPerformance(ctx, args)
  },
  {
    name: 'get_chart_patterns',
    title: 'Get chart patterns with performance',
    description:
      'The pattern library — checklist, timeframe, bias, conditions to avoid — with a performance rollup per pattern.',
    inputSchema: { type: 'object', properties: { ...periodProperties }, additionalProperties: false },
    handler: (ctx, args) => getPatternPerformance(ctx, args)
  },
  {
    name: 'get_weekly_reports',
    title: 'Get weekly reviews',
    description: 'AI-generated weekly performance reviews, newest first, keyed by the Monday of each week.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Defaults to 50.' },
        offset: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    },
    handler: (ctx, args) => getWeeklyReports(ctx, args)
  },
  {
    name: 'search_records',
    title: 'Search written records',
    description:
      'Full-text search across journal reviews, mindset logs, notebook notes, strategies, patterns, weekly reports and trade comments. Use this for "where did I write about X". Do NOT use it for exact figures — balances, P&L and win rates come from get_performance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for.' },
        collections: {
          type: 'array',
          items: { type: 'string', enum: COLLECTION_NAMES },
          description: 'Restrict the search. Defaults to every collection.'
        },
        dateFrom: { type: 'string', description: 'ISO date lower bound.' },
        dateTo: { type: 'string', description: 'ISO date upper bound.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Defaults to 20.' }
      },
      required: ['query'],
      additionalProperties: false
    },
    handler: (ctx, args) => search(ctx, args)
  },
  {
    name: 'list_records',
    title: 'List records from any collection',
    description:
      'Raw paginated access to any collection in the app. The purpose-built tools give better-shaped answers; reach for this when nothing else covers the question.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: COLLECTION_NAMES, description: 'Which collection to read.' },
        from: { type: 'string', description: 'ISO date lower bound.' },
        to: { type: 'string', description: 'ISO date upper bound.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Defaults to 50.' },
        offset: { type: 'integer', minimum: 0 }
      },
      required: ['collection'],
      additionalProperties: false
    },
    handler: (ctx, args) => getCollection(ctx, args.collection, args)
  },
  {
    name: 'get_record',
    title: 'Get one record by id',
    description: 'A single record from any collection, by its stable id.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: COLLECTION_NAMES },
        id: { type: 'string' }
      },
      required: ['collection', 'id'],
      additionalProperties: false
    },
    handler: (ctx, args) => getRecord(ctx, args.collection, args.id)
  }
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

const RESOURCES = COLLECTION_NAMES.map((name) => ({
  uri: `tradetracker://${name}`,
  name,
  title: COLLECTIONS[name].recordType,
  description: COLLECTIONS[name].describes,
  mimeType: 'application/json'
}));

/* ------------------------------------------------------------------ */
/* JSON-RPC plumbing                                                   */
/* ------------------------------------------------------------------ */

const result = (id, payload) => ({ jsonrpc: '2.0', id, result: payload });
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

const asToolResult = (payload) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  isError: false
});

async function dispatch(message, req) {
  const { id, method, params = {} } = message;

  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return result(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `Read-only access to the ${SOURCE_APP} trading journal. Exact figures — balance, P&L, win rate, expectancy — come from get_performance and list_trades; written material comes from search_records. Call describe_data if unsure where something lives. All money is USD, all timestamps are ISO 8601 UTC.`
      });
    }

    case 'ping':
      return result(id, {});

    case 'tools/list':
      return result(
        id,
        {
          tools: TOOLS.map(({ name, title, description, inputSchema }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
          }))
        }
      );

    case 'tools/call': {
      const tool = TOOLS_BY_NAME.get(params.name);
      if (!tool) {
        return failure(id, -32602, `Unknown tool "${params.name}".`);
      }

      try {
        const ctx = createContext(req);
        const payload = await tool.handler(ctx, params.arguments || {});
        return result(id, asToolResult(payload));
      } catch (error) {
        // A tool that fails reports back through the result, not as a protocol
        // error, so the model can read the reason and try something else.
        return result(id, {
          content: [{ type: 'text', text: `${tool.name} failed: ${error.message}` }],
          isError: true
        });
      }
    }

    case 'resources/list':
      return result(id, { resources: RESOURCES });

    case 'resources/read': {
      const name = String(params.uri || '').replace('tradetracker://', '');
      if (!COLLECTIONS[name]) {
        return failure(id, -32602, `Unknown resource "${params.uri}".`);
      }

      try {
        const payload = await getCollection(createContext(req), name, { limit: 500 });
        return result(id, {
          contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) }]
        });
      } catch (error) {
        return failure(id, -32603, error.message);
      }
    }

    case 'prompts/list':
      return result(id, { prompts: [] });

    default:
      return failure(id, -32601, `Method "${method}" is not supported.`);
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length > 0) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : null;
}

/**
 * Stateless streamable HTTP: one POST in, one JSON response out, no session and
 * no SSE stream. Every tool here is a short read, so there is nothing to stream
 * progressively and nothing to keep between calls.
 */
export async function handleMcp(req, res) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    // No server-initiated messages and no session to terminate.
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json(failure(null, -32000, 'This MCP server is stateless. Use POST for JSON-RPC requests.'));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json(failure(null, -32000, 'Method not allowed.'));
  }

  let message;
  try {
    message = await readBody(req);
  } catch {
    return res.status(400).json(failure(null, -32700, 'Request body is not valid JSON.'));
  }

  if (!message) {
    return res.status(400).json(failure(null, -32600, 'Empty request body.'));
  }

  // Batches were removed in the 2025-06-18 revision but older clients still
  // send them, so both shapes are accepted.
  const batch = Array.isArray(message) ? message : [message];
  const responses = [];

  for (const entry of batch) {
    if (entry?.jsonrpc !== '2.0' || typeof entry.method !== 'string') {
      responses.push(failure(entry?.id ?? null, -32600, 'Not a valid JSON-RPC 2.0 request.'));
      continue;
    }
    // A notification has no id and must not be answered.
    if (entry.id === undefined || entry.id === null) continue;
    responses.push(await dispatch(entry, req));
  }

  if (responses.length === 0) {
    return res.status(202).end();
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(Array.isArray(message) ? responses : responses[0]);
}

export const MCP_TOOL_NAMES = TOOLS.map((tool) => tool.name);
export { API_VERSION };
