import { timingSafeEqual } from 'node:crypto';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

// Per-instance, so this is a brake rather than a guarantee: Vercel may run
// several instances concurrently and each keeps its own counter. It exists to
// stop a runaway agent loop, not a determined attacker — the bearer key does
// that job.
const hits = new Map();

function constantTimeEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim() || 'unknown';
}

function rateLimited(req) {
  const key = clientKey(req);
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Every AI request is logged with what it asked for but never with what came
 * back, so the audit trail cannot itself become a copy of the account history.
 */
export function audit(req, { route, outcome, detail = null }) {
  console.log(
    JSON.stringify({
      channel: 'ai-gateway',
      at: new Date().toISOString(),
      route,
      method: req.method,
      outcome,
      detail,
      ip: clientKey(req),
      agent: req.headers['user-agent'] || null
    })
  );
}

/**
 * Guards an AI endpoint: bearer key, rate limit, CORS preflight, audit line.
 * Returns true when the caller has been answered and the handler should stop.
 */
export function rejectUnauthorized(req, res, route) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  const expected = process.env.AI_GATEWAY_KEY;
  if (!expected) {
    audit(req, { route, outcome: 'misconfigured' });
    res.status(500).json({ error: 'AI_GATEWAY_KEY is not configured on the server.' });
    return true;
  }

  const header = req.headers.authorization || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!presented || !constantTimeEquals(presented, expected)) {
    audit(req, { route, outcome: 'denied' });
    res.status(401).json({ error: 'Unauthorized. Send Authorization: Bearer <AI_GATEWAY_KEY>.' });
    return true;
  }

  if (rateLimited(req)) {
    audit(req, { route, outcome: 'rate_limited' });
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    return true;
  }

  return false;
}

/**
 * Read-only is the default and, for now, the only mode. Write tools land behind
 * a second key so read access can be handed out without handing out mutation.
 */
export function hasWriteScope() {
  return false;
}
