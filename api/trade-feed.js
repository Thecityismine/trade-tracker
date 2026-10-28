import { audit, rejectUnauthorized } from './_ai/auth.js';
import { readCollection } from './_ai/firestore.js';
import { appBaseUrl } from './_ai/schema.js';
import { buildFeed, DEFAULT_SCREENSHOT_TZ } from './_feed/tradeFeed.js';

/**
 * GET /api/trade-feed — read-only trades for Chart Lab to plot. Contract:
 * TRADE_FEED.md. Behind its own key (TRADE_FEED_KEY), separate from the AI
 * gateway's, so the holder can read trades and nothing else.
 */
export default async function handler(req, res) {
  const route = '/api/trade-feed';
  if (rejectUnauthorized(req, res, route, { keyEnv: 'TRADE_FEED_KEY' })) return undefined;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Read-only. Use GET.' });
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const params = Object.fromEntries(url.searchParams.entries());
  audit(req, { route, outcome: 'allowed', detail: Object.keys(params).length > 0 ? params : null });

  try {
    const docs = await readCollection('trades');
    const feed = buildFeed(docs, params, {
      appUrl: appBaseUrl(req),
      timeZone: process.env.TRADE_FEED_TZ || DEFAULT_SCREENSHOT_TZ,
    });
    return res.status(200).json(feed);
  } catch (error) {
    console.error('Trade feed failed:', error);
    const misconfigured = /service account is not configured/i.test(error.message);
    return res.status(500).json({ error: misconfigured ? error.message : 'Internal error reading trades.' });
  }
}
