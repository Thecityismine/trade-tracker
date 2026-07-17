const ALLOWED_HOSTS = new Set([
  'www.theblock.co',
  'finance.yahoo.com',
  'www.coindesk.com',
  'cointelegraph.com',
  'decrypt.co',
]);

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Invalid or missing url' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeTracker/1.0; +https://trade-tracker.vercel.app)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream HTTP ${upstream.status}` });
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message ?? 'Fetch failed' });
  }
}
