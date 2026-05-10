import { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

const FEEDS = [
  {
    id: 'wsj',
    name: 'Wall Street Journal',
    tag: 'Markets',
    url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
    dot: 'bg-blue-500',
  },
  {
    id: 'cnbc',
    name: 'CNBC Markets',
    tag: 'Business',
    url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',
    dot: 'bg-yellow-400',
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch',
    tag: 'Markets',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    dot: 'bg-green-500',
  },
  {
    id: 'coindesk',
    name: 'CoinDesk',
    tag: 'Crypto',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    dot: 'bg-orange-500',
  },
  {
    id: 'ct',
    name: 'Cointelegraph',
    tag: 'Crypto',
    url: 'https://cointelegraph.com/rss',
    dot: 'bg-purple-500',
  },
];

async function fetchFeed(url, count = 5) {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=${count}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(data.message || 'Feed unavailable');
  return data.items;
}

function stripHtml(str) {
  return (str ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function FeedSkeleton() {
  return (
    <div className="divide-y divide-dark-border/50 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="px-4 py-3 space-y-2">
          <div className="h-3.5 bg-dark-border rounded w-full" />
          <div className="h-3.5 bg-dark-border rounded w-4/5" />
          <div className="h-2.5 bg-dark-border rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

function FeedCard({ feed, items, error, loading }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden flex flex-col">
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-dark-border">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${feed.dot}`} />
        <span className="text-white font-semibold text-sm">{feed.name}</span>
        <span className="text-gray-600 text-xs ml-auto">{feed.tag}</span>
      </div>

      {/* Content */}
      {loading && items.length === 0 ? (
        <FeedSkeleton />
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <span className="text-gray-500">{error}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-4 text-gray-600 text-sm">No articles found</div>
      ) : (
        <div className="divide-y divide-dark-border/40">
          {items.map((item, i) => {
            const snippet = stripHtml(item.description ?? '').slice(0, 140);
            return (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-dark-bg transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-snug group-hover:text-blue-400 transition-colors line-clamp-2">
                    {item.title}
                  </p>
                  {snippet && (
                    <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">
                      {snippet}
                    </p>
                  )}
                  <p className="text-gray-700 text-xs mt-1.5">{timeAgo(item.pubDate)}</p>
                </div>
                <ExternalLink
                  size={12}
                  className="text-gray-700 group-hover:text-blue-400 flex-shrink-0 mt-0.5 transition-colors"
                />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MorningBrief() {
  const [feedData, setFeedData] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f.url, 5)));
    const next = {};
    FEEDS.forEach((f, i) => {
      const r = results[i];
      next[f.id] = {
        items: r.status === 'fulfilled' ? r.value : [],
        error: r.status === 'rejected' ? (r.reason?.message ?? 'Failed') : null,
      };
    });
    setFeedData(next);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Morning Brief</h2>
            <p className="text-gray-400 text-sm mt-1">Markets &amp; crypto headlines — loads automatically</p>
            {lastUpdated && (
              <p className="text-gray-600 text-xs mt-1">Updated {lastUpdated.toLocaleTimeString()}</p>
            )}
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Feed grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {FEEDS.map((feed) => {
          const { items = [], error } = feedData[feed.id] ?? {};
          return (
            <FeedCard
              key={feed.id}
              feed={feed}
              items={items}
              error={error}
              loading={loading}
            />
          );
        })}
      </div>

    </div>
  );
}

export default MorningBrief;
