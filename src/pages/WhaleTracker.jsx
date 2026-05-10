import { useState, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Eye, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const HL_API = 'https://api.hyperliquid.xyz/info';

async function hlPost(body) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API returned HTTP ${res.status}`);
  return res.json();
}

function shortenAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsd(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function signedUsd(n) {
  return `${n >= 0 ? '+' : '−'}${fmtUsd(n)}`;
}

const TIME_WINDOWS = [
  { id: 'day', label: '24h' },
  { id: 'week', label: '7d' },
  { id: 'month', label: '30d' },
  { id: 'allTime', label: 'All' },
];

function WhaleTracker() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [leaderWindow, setLeaderWindow] = useState('week');
  const [expandedWhale, setExpandedWhale] = useState(null);

  const fetchData = useCallback(async (win) => {
    setLoading(true);
    setError(null);
    setExpandedWhale(null);
    try {
      // 1. Fetch leaderboard
      const lb = await hlPost({ type: 'leaderboard', window: win });
      const rows = lb.leaderboardRows ?? (Array.isArray(lb) ? lb : []);

      if (!rows.length) throw new Error('Leaderboard returned no rows. The API response shape may have changed.');

      const top20 = rows.slice(0, 20);

      // 2. Fetch open positions for each wallet in parallel
      const posResults = await Promise.allSettled(
        top20.map((w) => hlPost({ type: 'clearinghouseState', user: w.ethAddress }))
      );

      // 3. Build enriched whale list
      const whales = top20.map((w, i) => {
        const res = posResults[i];
        const openPositions =
          res.status === 'fulfilled'
            ? (res.value.assetPositions ?? [])
                .map((ap) => ap.position)
                .filter((p) => p && parseFloat(p.szi) !== 0)
            : [];
        return {
          address: w.ethAddress,
          accountValue: parseFloat(w.accountValue ?? 0),
          pnl: parseFloat(w.windowPnl ?? 0),
          openPositions,
          fetchFailed: res.status === 'rejected',
        };
      });

      // 4. Aggregate exposure per coin across all whales
      const coinMap = {};
      whales.forEach((whale) => {
        whale.openPositions.forEach((pos) => {
          const coin = pos.coin;
          const sz = parseFloat(pos.szi);
          const val = Math.abs(parseFloat(pos.positionValue ?? 0));
          if (!coinMap[coin]) coinMap[coin] = { longs: 0, shorts: 0, longValue: 0, shortValue: 0 };
          if (sz > 0) { coinMap[coin].longs++; coinMap[coin].longValue += val; }
          else { coinMap[coin].shorts++; coinMap[coin].shortValue += val; }
        });
      });

      const coins = Object.entries(coinMap)
        .map(([coin, d]) => {
          const total = d.longValue + d.shortValue;
          const longPct = total > 0 ? (d.longValue / total) * 100 : 50;
          return {
            coin, ...d, total, longPct,
            bias: d.longValue >= d.shortValue ? 'long' : 'short',
          };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      setData({
        whales,
        coins,
        withPositions: whales.filter((w) => w.openPositions.length > 0).length,
      });
      setLastUpdated(new Date());
    } catch (err) {
      const isCors = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      setError(
        isCors
          ? 'CORS blocked: the browser cannot reach api.hyperliquid.xyz directly. A proxy is needed — open an issue so we can add one.'
          : err.message || 'Unknown error'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = () => fetchData(leaderWindow);

  const handleWindowChange = (w) => {
    setLeaderWindow(w);
    fetchData(w);
  };

  const crowdedLongs = data?.coins.filter((c) => c.bias === 'long' && c.longs >= 3).slice(0, 3) ?? [];
  const crowdedShorts = data?.coins.filter((c) => c.bias === 'short' && c.shorts >= 3).slice(0, 3) ?? [];
  const windowLabel = TIME_WINDOWS.find((w) => w.id === leaderWindow)?.label ?? leaderWindow;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-white">Whale Tracker</h2>
            <p className="text-gray-400 text-sm mt-1">Top Hyperliquid traders — live positioning & net exposure</p>
            {lastUpdated && (
              <p className="text-gray-600 text-xs mt-1">Last updated {lastUpdated.toLocaleTimeString()}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {/* Time window selector */}
            <div className="flex bg-dark-bg border border-dark-border rounded-lg p-1 gap-0.5">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleWindowChange(w.id)}
                  disabled={loading}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                    leaderWindow === w.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-red-400 font-medium text-sm">Failed to load</div>
            <div className="text-gray-400 text-xs mt-1 break-words">{error}</div>
          </div>
        </div>
      )}

      {/* Empty / initial state */}
      {!data && !loading && !error && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-12 text-center">
          <Eye size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-300 font-medium">No data loaded yet</p>
          <p className="text-gray-600 text-sm mt-1">Pull live whale positions from Hyperliquid's public API</p>
          <button
            onClick={handleRefresh}
            className="mt-5 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Load Now
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-dark-card border border-dark-border rounded-lg p-6 animate-pulse">
              <div className="h-4 bg-dark-border rounded w-1/3 mb-3" />
              <div className="h-3 bg-dark-border rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Whales Tracked', value: data.whales.length, color: 'text-white' },
              { label: 'With Open Positions', value: data.withPositions, color: 'text-blue-400' },
              { label: 'Assets in Play', value: data.coins.length, color: 'text-white' },
              {
                label: `#1 Trader ${windowLabel} P&L`,
                value: signedUsd(data.whales[0]?.pnl ?? 0),
                color: (data.whales[0]?.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
              },
            ].map((s) => (
              <div key={s.label} className="bg-dark-card border border-dark-border rounded-lg p-4">
                <div className="text-gray-500 text-xs mb-1">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Crowded trades */}
          {(crowdedLongs.length > 0 || crowdedShorts.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { items: crowdedLongs, side: 'long', label: 'Crowded Longs', Icon: TrendingUp, barColor: 'bg-green-500', textColor: 'text-green-400', getCount: (c) => c.longs, getValue: (c) => c.longValue, getPct: (c) => c.longPct },
                { items: crowdedShorts, side: 'short', label: 'Crowded Shorts', Icon: TrendingDown, barColor: 'bg-red-500', textColor: 'text-red-400', getCount: (c) => c.shorts, getValue: (c) => c.shortValue, getPct: (c) => 100 - c.longPct },
              ].map(({ items, label, Icon, barColor, textColor, getCount, getValue, getPct }) =>
                items.length > 0 ? (
                  <div key={label} className="bg-dark-card border border-dark-border rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Icon size={15} className={textColor} />
                      <h3 className="text-white font-semibold text-sm">{label}</h3>
                    </div>
                    <div className="space-y-3">
                      {items.map((c) => (
                        <div key={c.coin} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-white font-bold text-sm w-12 flex-shrink-0">{c.coin}</span>
                            <span className="text-gray-500 text-xs truncate">{getCount(c)} whales</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-20 h-1.5 bg-dark-bg rounded-full overflow-hidden">
                              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${getPct(c)}%` }} />
                            </div>
                            <span className={`text-xs font-medium w-14 text-right ${textColor}`}>
                              {fmtUsd(getValue(c))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* Aggregate exposure table */}
          <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-border">
              <h3 className="text-white font-semibold">Aggregate Exposure by Asset</h3>
              <p className="text-gray-500 text-xs mt-0.5">Combined position value across all tracked whales</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-bg">
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left py-2.5 px-4 font-medium">Asset</th>
                    <th className="text-center py-2.5 px-3 font-medium">Longs</th>
                    <th className="text-center py-2.5 px-3 font-medium">Shorts</th>
                    <th className="text-right py-2.5 px-3 font-medium">Long $</th>
                    <th className="text-right py-2.5 px-3 font-medium">Short $</th>
                    <th className="text-right py-2.5 px-4 font-medium">Bias</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coins.map((c) => (
                    <tr key={c.coin} className="border-t border-dark-border hover:bg-dark-bg transition-colors">
                      <td className="py-3 px-4 text-white font-bold text-sm">{c.coin}</td>
                      <td className="py-3 px-3 text-center text-green-400 font-medium text-sm">{c.longs}</td>
                      <td className="py-3 px-3 text-center text-red-400 font-medium text-sm">{c.shorts}</td>
                      <td className="py-3 px-3 text-right text-green-400 text-sm">{fmtUsd(c.longValue)}</td>
                      <td className="py-3 px-3 text-right text-red-400 text-sm">{fmtUsd(c.shortValue)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-dark-bg rounded-full overflow-hidden flex">
                            <div className="h-full bg-green-500" style={{ width: `${c.longPct}%` }} />
                            <div className="h-full bg-red-500 flex-1" />
                          </div>
                          <span className={`text-xs font-semibold w-12 text-right ${c.bias === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                            {c.bias === 'long'
                              ? `${c.longPct.toFixed(0)}% L`
                              : `${(100 - c.longPct).toFixed(0)}% S`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual whale list */}
          <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-border">
              <h3 className="text-white font-semibold">Top 20 Whale Positions</h3>
              <p className="text-gray-500 text-xs mt-0.5">
                Ranked by {windowLabel} P&L — tap a row to expand positions
              </p>
            </div>
            <div className="divide-y divide-dark-border">
              {data.whales.map((whale, i) => {
                const isExpanded = expandedWhale === i;
                const hasPositions = whale.openPositions.length > 0;
                return (
                  <div key={i}>
                    <button
                      onClick={() => hasPositions && setExpandedWhale(isExpanded ? null : i)}
                      className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left ${
                        hasPositions ? 'hover:bg-dark-bg cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-gray-600 text-xs w-5 flex-shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-gray-300 font-mono text-xs">{shortenAddr(whale.address)}</div>
                          <div className="text-gray-600 text-xs mt-0.5">
                            {whale.fetchFailed
                              ? 'Position fetch failed'
                              : hasPositions
                              ? `${whale.openPositions.length} open position${whale.openPositions.length !== 1 ? 's' : ''}`
                              : 'No open positions'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-gray-500 text-xs">Account</div>
                          <div className="text-white text-sm font-medium">{fmtUsd(whale.accountValue)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-gray-500 text-xs">{windowLabel} P&L</div>
                          <div className={`text-sm font-bold ${whale.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {signedUsd(whale.pnl)}
                          </div>
                        </div>
                        {hasPositions ? (
                          isExpanded ? (
                            <ChevronUp size={14} className="text-gray-500" />
                          ) : (
                            <ChevronDown size={14} className="text-gray-500" />
                          )
                        ) : (
                          <div className="w-[14px]" />
                        )}
                      </div>
                    </button>

                    {/* Expanded position cards */}
                    {isExpanded && hasPositions && (
                      <div className="px-5 pb-4 pt-2 bg-dark-bg">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {whale.openPositions.map((pos, j) => {
                            const sz = parseFloat(pos.szi);
                            const isLong = sz > 0;
                            const upnl = parseFloat(pos.unrealizedPnl ?? 0);
                            const val = Math.abs(parseFloat(pos.positionValue ?? 0));
                            const lev = pos.leverage?.value;
                            return (
                              <div
                                key={j}
                                className={`rounded-lg p-3 border ${
                                  isLong
                                    ? 'bg-green-500/5 border-green-500/15'
                                    : 'bg-red-500/5 border-red-500/15'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-white font-bold">{pos.coin}</span>
                                  <div className="flex items-center gap-1.5">
                                    {lev && (
                                      <span className="text-gray-500 text-xs">{lev}x</span>
                                    )}
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                      isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                    }`}>
                                      {isLong ? 'LONG' : 'SHORT'}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                                  <div>
                                    <div className="text-gray-600">Size</div>
                                    <div className="text-gray-300">{Math.abs(sz).toFixed(4)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600">Value</div>
                                    <div className="text-gray-300">{fmtUsd(val)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600">Entry</div>
                                    <div className="text-gray-300">
                                      ${parseFloat(pos.entryPx ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600">uPnL</div>
                                    <div className={upnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                      {signedUsd(upnl)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default WhaleTracker;
