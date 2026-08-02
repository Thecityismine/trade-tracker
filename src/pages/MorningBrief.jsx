import { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import Page from '../components/ui/Page';
import Button from '../components/ui/Button';
import { SkeletonText } from '../components/ui/Skeleton';

const FEEDS = [
  {
    id: 'theblock',
    name: 'The Block',
    tag: 'Crypto',
    url: 'https://www.theblock.co/rss.xml',
    dot: 'bg-content-muted',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    tag: 'Markets',
    url: 'https://finance.yahoo.com/news/rssindex',
    dot: 'bg-content-muted',
  },
  {
    id: 'coindesk',
    name: 'CoinDesk',
    tag: 'Crypto',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    dot: 'bg-content-muted',
  },
  {
    id: 'ct',
    name: 'Cointelegraph',
    tag: 'Crypto',
    url: 'https://cointelegraph.com/rss',
    dot: 'bg-content-muted',
  },
  {
    id: 'decrypt',
    name: 'Decrypt',
    tag: 'Crypto',
    url: 'https://decrypt.co/feed',
    dot: 'bg-content-muted',
  },
];

async function fetchFeed(url, count = 5) {
  const proxyUrl = `/api/feed?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');

  if (xml.querySelector('parsererror')) throw new Error('Invalid feed format');

  const items = Array.from(xml.querySelectorAll('item')).slice(0, count);
  if (items.length === 0) throw new Error('No articles found');

  return items.map((item) => {
    const getText = (tag) => item.querySelector(tag)?.textContent?.trim() ?? '';
    const link =
      getText('link') ||
      item.querySelector('link')?.getAttribute('href') ||
      getText('guid');
    return {
      title: getText('title'),
      link,
      description: getText('description'),
      pubDate: getText('pubDate') || getText('updated') || getText('dc\\:date'),
    };
  });
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
    <div className="divide-y divide-line">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="px-4 py-3">
          <SkeletonText lines={3} />
        </div>
      ))}
    </div>
  );
}

function FeedCard({ feed, items, error, loading }) {
  return (
    <div className="bg-surface rounded-card overflow-hidden flex flex-col shadow-elev-1">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${feed.dot}`} />
        <span className="text-content-primary font-semibold text-sm">{feed.name}</span>
        <span className="text-content-muted text-xs ml-auto">{feed.tag}</span>
      </div>

      {loading && items.length === 0 ? (
        <FeedSkeleton />
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm">
          <AlertCircle size={14} className="text-loss flex-shrink-0" />
          <span className="text-content-muted">{error}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-4 text-content-muted text-sm">No articles found</div>
      ) : (
        <div className="divide-y divide-line">
          {items.map((item, i) => {
            const snippet = stripHtml(item.description ?? '').slice(0, 140);
            return (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-raised transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-content-primary text-sm font-medium leading-snug group-hover:text-brand-hover transition-colors line-clamp-2">
                    {item.title}
                  </p>
                  {snippet && (
                    <p className="text-content-muted text-xs mt-1 line-clamp-2 leading-relaxed">
                      {snippet}
                    </p>
                  )}
                  <p className="text-content-muted text-xs mt-1.5">{timeAgo(item.pubDate)}</p>
                </div>
                <ExternalLink
                  size={12}
                  className="text-content-muted group-hover:text-brand-hover flex-shrink-0 mt-0.5 transition-colors"
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
    <Page
      toolbar={
        lastUpdated && (
          <p className="text-xs text-content-muted">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )
      }
      actions={
        <Button onClick={loadAll} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      }
    >
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
    </Page>
  );
}

export default MorningBrief;
