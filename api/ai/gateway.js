import { audit, rejectUnauthorized } from '../_ai/auth.js';
import { handleMcp } from '../_ai/mcp.js';
import { handleRest } from '../_ai/rest.js';
import { HttpError } from '../_ai/resources.js';

/**
 * The whole AI surface behind one serverless function: /api/ai/mcp speaks
 * JSON-RPC to an MCP client, everything else under /api/ai/v1/ is REST. Routing
 * here rather than across a dozen files keeps the function count low and the
 * auth check in exactly one place.
 */
export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);

  // Vercel's zero-config api/ routing does not expand [...catchAll] for
  // non-framework projects, so vercel.json rewrites /api/ai/* to this function
  // and hands the original path over in `aipath`. The pathname fallback keeps
  // direct hits on /api/ai/gateway/... working if the rewrite is ever removed.
  const rewritten = url.searchParams.get('aipath');
  const segments = (
    rewritten
      ? rewritten.split('/')
      : url.pathname.replace(/^\/api\/ai\/?/, '').replace(/^gateway\/?/, '').split('/')
  ).filter(Boolean);

  const route = `/api/ai/${segments.join('/')}`;

  if (rejectUnauthorized(req, res, route)) {
    return undefined;
  }

  if (segments[0] === 'mcp') {
    audit(req, { route, outcome: 'allowed', detail: 'mcp' });
    try {
      return await handleMcp(req, res);
    } catch (error) {
      console.error('MCP handler failed:', error);
      return res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: error.message } });
    }
  }

  // `aipath` is routing plumbing, not a caller-supplied filter.
  const params = Object.fromEntries(url.searchParams.entries());
  delete params.aipath;
  audit(req, { route, outcome: 'allowed', detail: Object.keys(params).length > 0 ? params : null });

  try {
    const payload = await handleRest(req, segments, params);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error('AI API failed:', error);
    // Service-account misconfiguration is the one failure worth naming: it is
    // the difference between "your setup is incomplete" and "the app is down".
    const misconfigured = /service account is not configured/i.test(error.message);
    return res.status(500).json({
      error: misconfigured ? error.message : 'Internal error reading trade data.'
    });
  }
}
