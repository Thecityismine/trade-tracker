import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Eye, AlertCircle, ChevronDown, ChevronUp, Plus, X, ExternalLink } from 'lucide-react';

const HL_API = 'https://api.hyperliquid.xyz/info';
const STORAGE_KEY = 'hl_watchlist_addresses';

async function hlPost(body) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

function WhaleTracker() {
  const [addresses, setAddresses] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newAddr, setNewAddr] = useState('');
  const [addrError, setAddrError] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedWhale, setExpandedWhale] = useState(null);

  const saveAddresses = (addrs) => {
    setAddresses(addrs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addrs));
  };

  const handleAddAddress = () => {
    const cleaned = newAddr.trim().toLowerCase();
    if (!isValidAddress(cleaned)) {
      setAddrError('Enter a valid 0x Ethereum address (42 characters)');
      return;
    }
    if (addresses.includes(cleaned)) {
      setAddrError('Already in watchlist');
      return;
    }
    saveAddresses([...addresses, cleaned]);
    setNewAddr('');
    setAddrError('');
  };

  const handleRemoveAddress = (addr) => {
    saveAddresses(addresses.filter((a) => a !== addr));
    setData(null);
  };

  const fetchData = useCallback(async (addrs) => {
    if (!addrs.length) return;
    setLoading(true);
    setError(null);
    setExpandedWhale(null);
    try {
      const results = await Promise.allSettled(
        addrs.map((addr) => hlPost({ type: 'clearinghouseState', user: addr }))
      );

      const whales = addrs.map((addr, i) => {
        const res = results[i];
        if (res.status === 'rejected') {
          return { address: addr, accountValue: 0, openPositions: [], fetchFailed: true };
        }
        const state = res.value;
        const accountValue = parseFloat(
          state.crossMarginSummary?.accountValue ?? state.marginSummary?.accountValue ?? 0
        );
        const openPositions = (state.assetPositions ?? [])
          .map((ap) => ap.position)
          .filter((p) => p && parseFloat(p.szi) !== 0);
        return { address: addr, accountValue, openPositions, fetchFailed: false };
      });

      // Sort by account value descending
      whales.sort((a, b) => b.accountValue - a.accountValue);

      // Aggregate exposure per coin
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
          return { coin, ...d, total, longPct, bias: d.longValue >= d.shortValue ? 'long' : 'short' };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      const totalValue = whales.reduce((s, w) => s + w.accountValue, 0);
      setData({ whales, coins, totalValue, withPositions: whales.filter((w) => w.openPositions.length > 0).length });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = () => fetchData(addresses);

  const crowdedLongs = data?.coins.filter((c) => c.bias === 'long' && c.longs >= 2).slice(0, 3) ?? [];
  const crowdedShorts = data?.coins.filter((c) => c.bias === 'short' && c.shorts >= 2).slice(0, 3) ?? [];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-white">Whale Tracker</h2>
            <p className="text-gray-400 text-sm mt-1">Track live Hyperliquid positions for any wallet</p>
            {lastUpdated && (
              <p className="text-gray-600 text-xs mt-1">Last updated {lastUpdated.toLocaleTimeString()}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://app.hyperliquid.xyz/leaderboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white border border-dark-border hover:border-gray-500 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            >
              <ExternalLink size={12} />
              Leaderboard
            </a>
            <button
              onClick={handleRefresh}
              disabled={loading || addresses.length === 0}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Watchlist manager */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-5">
        <h3 className="text-white font-semibold text-sm mb-1">Watchlist</h3>
        <p className="text-gray-500 text-xs mb-4">
          Add wallet addresses to track. Find top traders on the{' '}
          <a
            href="https://app.hyperliquid.xyz/leaderboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Hyperliquid leaderboard
          </a>
          {' '}— copy any address and paste it here.
        </p>

        {/* Add address input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newAddr}
            onChange={(e) => { setNewAddr(e.target.value); setAddrError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddAddress()}
            placeholder="0x… wallet address"
            className="flex-1 bg-dark-bg border border-dark-border text-white text-sm rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={handleAddAddress}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {addrError && <p className="text-red-400 text-xs mb-3 -mt-2">{addrError}</p>}

        {/* Address tags */}
        {addresses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {addresses.map((addr) => (
              <div
                key={addr}
                className="flex items-center gap-2 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5"
              >
                <span className="font-mono text-xs text-gray-300">{shortenAddr(addr)}</span>
                <button
                  onClick={() => handleRemoveAddress(addr)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-600 text-sm border border-dashed border-dark-border rounded-lg">
            No addresses yet — add one above to start tracking
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-red-400 font-medium text-sm">Failed to load</div>
            <div className="text-gray-400 text-xs mt-1">{error}</div>
          </div>
        </div>
      )}

      {/* Empty / not loaded */}
      {addresses.length > 0 && !data && !loading && !error && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-10 text-center">
          <Eye size={36} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-300 font-medium">Ready to scan</p>
          <p className="text-gray-600 text-sm mt-1">{addresses.length} address{addresses.length !== 1 ? 'es' : ''} in watchlist</p>
          <button
            onClick={handleRefresh}
            className="mt-5 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Load Positions
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Wallets Tracked', value: data.whales.length, color: 'text-white' },
              { label: 'With Open Positions', value: data.withPositions, color: 'text-blue-400' },
              { label: 'Assets in Play', value: data.coins.length, color: 'text-white' },
              { label: 'Total Value Tracked', value: fmtUsd(data.totalValue), color: 'text-white' },
            ].map((s) => (
              <div key={s.label} className="bg-dark-card border border-dark-border rounded-lg p-4">
                <div className="text-gray-500 text-xs mb-1">{s.label}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Crowded trades */}
          {(crowdedLongs.length > 0 || crowdedShorts.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { items: crowdedLongs, label: 'Crowded Longs', iconColor: 'text-green-400', barColor: 'bg-green-500', textColor: 'text-green-400', getCount: (c) => c.longs, getValue: (c) => c.longValue, getPct: (c) => c.longPct },
                { items: crowdedShorts, label: 'Crowded Shorts', iconColor: 'text-red-400', barColor: 'bg-red-500', textColor: 'text-red-400', getCount: (c) => c.shorts, getValue: (c) => c.shortValue, getPct: (c) => 100 - c.longPct },
              ].map(({ items, label, iconColor, barColor, textColor, getCount, getValue, getPct }) =>
                items.length > 0 ? (
                  <div key={label} className="bg-dark-card border border-dark-border rounded-lg p-5">
                    <h3 className={`font-semibold text-sm mb-4 ${iconColor}`}>{label}</h3>
                    <div className="space-y-3">
                      {items.map((c) => (
                        <div key={c.coin} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-white font-bold text-sm w-12 flex-shrink-0">{c.coin}</span>
                            <span className="text-gray-500 text-xs">{getCount(c)} wallets</span>
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
              <p className="text-gray-500 text-xs mt-0.5">Combined position value across all tracked wallets</p>
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
                            {c.bias === 'long' ? `${c.longPct.toFixed(0)}%L` : `${(100 - c.longPct).toFixed(0)}%S`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.coins.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-600 text-sm">
                        No open positions found across tracked wallets
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual wallet positions */}
          <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-border">
              <h3 className="text-white font-semibold">Wallet Positions</h3>
              <p className="text-gray-500 text-xs mt-0.5">Sorted by account value — tap to expand</p>
            </div>
            <div className="divide-y divide-dark-border">
              {data.whales.map((whale, i) => {
                const isExpanded = expandedWhale === i;
                const hasPositions = whale.openPositions.length > 0;
                return (
                  <div key={whale.address}>
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
                              ? 'Fetch failed'
                              : hasPositions
                              ? `${whale.openPositions.length} open position${whale.openPositions.length !== 1 ? 's' : ''}`
                              : 'No open positions'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-gray-500 text-xs">Account Value</div>
                          <div className="text-white text-sm font-medium">{fmtUsd(whale.accountValue)}</div>
                        </div>
                        {hasPositions ? (
                          isExpanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />
                        ) : (
                          <div className="w-[14px]" />
                        )}
                      </div>
                    </button>

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
                                  isLong ? 'bg-green-500/5 border-green-500/15' : 'bg-red-500/5 border-red-500/15'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-white font-bold">{pos.coin}</span>
                                  <div className="flex items-center gap-1.5">
                                    {lev && <span className="text-gray-500 text-xs">{lev}x</span>}
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
                                    <div className={upnl >= 0 ? 'text-green-400' : 'text-red-400'}>{signedUsd(upnl)}</div>
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
