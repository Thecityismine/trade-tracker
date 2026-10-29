import { verifyFirebaseToken } from './_auth.js';

/**
 * POST /api/chart — the Trade Review page's only way to Chart Lab's data API
 * (contract: CHART_DATA.md). Checks the Firebase login, adds
 * CHARTLAB_DATA_KEY server-side and forwards. The browser never sees the key.
 *
 * Body: { path: 'series' | 'readout' | 'assets', params: {...} }.
 */

// Allowed query params per path; anything else is dropped rather than
// forwarded, so this can't be used to reach other Chart Lab endpoints.
const PATHS = {
  assets: [],
  series: ['asset', 'tf', 'to', 'bars', 'layers'],
  readout: ['asset', 'tf', 't', 'price'],
};

// Closed candles and readouts never change, so a window that ends in the past
// can be kept a while. Per warm instance only; a cold start refetches.
const cache = new Map();
const CACHE_MAX = 200;

function ttlFor(path, params) {
  if (path === 'readout') return 24 * 3600_000;
  if (path === 'assets') return 5 * 60_000;
  const to = Number(params.to);
  const past = Number.isFinite(to) && to * 1000 < Date.now() - 60 * 60_000;
  return past ? 3600_000 : 30_000;
}

export function buildQuery(path, params = {}) {
  const allowed = PATHS[path];
  if (!allowed) return null;
  const query = new URLSearchParams();
  for (const key of allowed) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await verifyFirebaseToken(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.CHARTLAB_DATA_URL;
  const key = process.env.CHARTLAB_DATA_KEY;
  if (!base || !key) {
    return res.status(503).json({ error: 'Chart data is not configured (CHARTLAB_DATA_URL / CHARTLAB_DATA_KEY).' });
  }

  const { path, params = {} } = req.body || {};
  const query = buildQuery(path, params);
  if (query === null) return res.status(400).json({ error: `Unknown chart data path "${path}".` });

  const url = `${base.replace(/\/$/, '')}/api/data/${path}${query ? `?${query}` : ''}`;
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return res.status(200).json(hit.body);

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await upstream.json().catch(() => ({ error: `Chart Lab answered ${upstream.status} without JSON.` }));
    if (!upstream.ok) return res.status(upstream.status).json(body);
    if (body.version !== 1) {
      return res.status(502).json({ error: `Chart Lab sent data version ${body.version}; this app reads version 1.` });
    }

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(url, { body, expires: Date.now() + ttlFor(path, params) });
    return res.status(200).json(body);
  } catch (error) {
    console.error('Chart data request failed:', error);
    const timedOut = error?.name === 'TimeoutError';
    return res.status(502).json({ error: timedOut ? 'Chart Lab took too long to answer.' : 'Could not reach Chart Lab.' });
  }
}
