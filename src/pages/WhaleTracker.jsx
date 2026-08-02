import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RefreshCw, Eye, AlertCircle, ChevronDown, ChevronUp, Plus, X, ExternalLink } from 'lucide-react';
import Page from '../components/ui/Page';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';

const HL_API = 'https://api.hyperliquid.xyz/info';
const WATCHLIST_DOC = doc(db, 'settings', 'whaleWatchlist');

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
  const [addresses, setAddresses] = useState([]);
  const [newAddr, setNewAddr] = useState('');
  const [addrError, setAddrError] = useState('');

  // Sync watchlist from Firestore so it works across all devices
  useEffect(() => {
    return onSnapshot(WATCHLIST_DOC, (snap) => {
      setAddresses(snap.exists() ? (snap.data().addresses ?? []) : []);
    });
  }, []);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedWhale, setExpandedWhale] = useState(null);
  const [expandedCoin, setExpandedCoin] = useState(null);

  const saveAddresses = (addrs) => {
    setAddresses(addrs); // optimistic update
    setDoc(WATCHLIST_DOC, { addresses: addrs });
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
    setExpandedCoin(null);
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

      // Aggregate exposure per coin + per-coin position breakdown
      const coinMap = {};
      const coinPositions = {};
      whales.forEach((whale) => {
        whale.openPositions.forEach((pos) => {
          const coin = pos.coin;
          const sz = parseFloat(pos.szi);
          const val = Math.abs(parseFloat(pos.positionValue ?? 0));
          if (!coinMap[coin]) coinMap[coin] = { longs: 0, shorts: 0, longValue: 0, shortValue: 0 };
          if (sz > 0) { coinMap[coin].longs++; coinMap[coin].longValue += val; }
          else { coinMap[coin].shorts++; coinMap[coin].shortValue += val; }
          if (!coinPositions[coin]) coinPositions[coin] = [];
          coinPositions[coin].push({
            address: whale.address,
            sz,
            entryPx: parseFloat(pos.entryPx ?? 0),
            value: val,
            upnl: parseFloat(pos.unrealizedPnl ?? 0),
            lev: pos.leverage?.value,
          });
        });
      });
      // Sort each coin's positions by value descending
      Object.values(coinPositions).forEach((arr) => arr.sort((a, b) => b.value - a.value));

      const coins = Object.entries(coinMap)
        .map(([coin, d]) => {
          const total = d.longValue + d.shortValue;
          const longPct = total > 0 ? (d.longValue / total) * 100 : 50;
          return { coin, ...d, total, longPct, bias: d.longValue >= d.shortValue ? 'long' : 'short' };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      const totalValue = whales.reduce((s, w) => s + w.accountValue, 0);
      setData({ whales, coins, coinPositions, totalValue, withPositions: whales.filter((w) => w.openPositions.length > 0).length });
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
    <Page
      toolbar={
        lastUpdated && (
          <p className="text-xs text-content-muted">
            Last updated {lastUpdated.toLocaleTimeString()}
          </p>
        )
      }
      actions={
        <>
          <a
            href="https://app.hyperliquid.xyz/leaderboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
          >
            <ExternalLink size={12} />
            Leaderboard
          </a>
          <Button onClick={handleRefresh} disabled={loading || addresses.length === 0}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </>
      }
    >
      {/* Watchlist manager */}
      <div className="bg-surface rounded-card p-5 shadow-elev-1">
        <h3 className="text-content-primary font-semibold text-sm mb-1">Watchlist</h3>
        <p className="text-content-muted text-xs mb-4">
          Add wallet addresses to track. Find top traders on the{' '}
          <a
            href="https://app.hyperliquid.xyz/leaderboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:text-brand-hover underline"
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
            className="flex-1 bg-surface-raised border border-line-strong text-content-primary text-sm rounded-lg px-3 py-2 placeholder-content-muted focus:outline-none focus:border-brand font-mono"
          />
          <button
            onClick={handleAddAddress}
            className="flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-content-primary px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {addrError && <p className="text-loss text-xs mb-3 -mt-2">{addrError}</p>}

        {/* Address tags */}
        {addresses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {addresses.map((addr) => (
              <div
                key={addr}
                className="flex items-center gap-2 bg-surface-raised rounded-control px-3 py-1.5"
              >
                <span className="font-mono text-xs text-content-secondary">{shortenAddr(addr)}</span>
                <button
                  onClick={() => handleRemoveAddress(addr)}
                  className="text-content-muted hover:text-loss transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-content-muted text-sm border border-dashed border-line-strong rounded-lg">
            No addresses yet — add one above to start tracking
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-loss/10 border border-loss/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-loss flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-loss font-medium text-sm">Failed to load</div>
            <div className="text-content-secondary text-xs mt-1">{error}</div>
          </div>
        </div>
      )}

      {/* Empty / not loaded */}
      {addresses.length > 0 && !data && !loading && !error && (
        <div className="bg-surface rounded-card p-10 text-center shadow-elev-1">
          <Eye size={36} className="text-content-muted mx-auto mb-3" />
          <p className="text-content-secondary font-medium">Ready to scan</p>
          <p className="text-content-muted text-sm mt-1">{addresses.length} address{addresses.length !== 1 ? 'es' : ''} in watchlist</p>
          <button
            onClick={handleRefresh}
            className="mt-5 bg-brand hover:bg-brand-hover text-content-primary px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Load Positions
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-surface rounded-card p-6 shadow-elev-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Wallets Tracked', value: data.whales.length, color: 'text-content-primary' },
              { label: 'With Open Positions', value: data.withPositions, color: 'text-brand' },
              { label: 'Assets in Play', value: data.coins.length, color: 'text-content-primary' },
              { label: 'Total Value Tracked', value: fmtUsd(data.totalValue), color: 'text-content-primary' },
            ].map((s) => (
              <div key={s.label} className="bg-surface rounded-card p-4 shadow-elev-1">
                <div className="text-content-muted text-sm mb-1">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Crowded trades */}
          {(crowdedLongs.length > 0 || crowdedShorts.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { items: crowdedLongs, label: 'Crowded Longs', iconColor: 'text-profit', barColor: 'bg-profit', textColor: 'text-profit', getCount: (c) => c.longs, getValue: (c) => c.longValue, getPct: (c) => c.longPct },
                { items: crowdedShorts, label: 'Crowded Shorts', iconColor: 'text-loss', barColor: 'bg-loss', textColor: 'text-loss', getCount: (c) => c.shorts, getValue: (c) => c.shortValue, getPct: (c) => 100 - c.longPct },
              ].map(({ items, label, iconColor, barColor, textColor, getCount, getValue, getPct }) =>
                items.length > 0 ? (
                  <div key={label} className="bg-surface rounded-card p-5 shadow-elev-1">
                    <h3 className={`font-semibold text-base mb-4 ${iconColor}`}>{label}</h3>
                    <div className="space-y-3">
                      {items.map((c) => (
                        <div key={c.coin} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-content-primary font-bold text-base w-14 flex-shrink-0">{c.coin}</span>
                            <span className="text-content-muted text-sm">{getCount(c)} wallets</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-20 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${getPct(c)}%` }} />
                            </div>
                            <span className={`text-sm font-medium w-16 text-right ${textColor}`}>
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
          <div className="bg-surface rounded-card overflow-hidden shadow-elev-1">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-content-primary font-semibold">Aggregate Exposure by Asset</h3>
              <p className="text-content-muted text-xs mt-0.5">Combined position value across all tracked wallets</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-surface-raised">
                  <tr className="text-content-secondary text-xs">
                    <th className="text-left py-2.5 px-4 font-medium">Asset</th>
                    <th className="text-center py-2.5 px-3 font-medium">Longs</th>
                    <th className="text-center py-2.5 px-3 font-medium">Shorts</th>
                    <th className="text-right py-2.5 px-3 font-medium">Long $</th>
                    <th className="text-right py-2.5 px-3 font-medium">Short $</th>
                    <th className="text-right py-2.5 px-4 font-medium">Bias</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coins.map((c) => {
                    const isOpen = expandedCoin === c.coin;
                    const entries = data.coinPositions[c.coin] ?? [];
                    return (
                      <>
                        <tr
                          key={c.coin}
                          onClick={() => setExpandedCoin(isOpen ? null : c.coin)}
                          className="border-t border-line hover:bg-surface-raised transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-content-primary font-bold text-sm">{c.coin}</span>
                              {isOpen ? <ChevronUp size={12} className="text-content-muted" /> : <ChevronDown size={12} className="text-content-muted" />}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center text-profit font-medium text-sm">{c.longs}</td>
                          <td className="py-3 px-3 text-center text-loss font-medium text-sm">{c.shorts}</td>
                          <td className="py-3 px-3 text-right text-profit text-sm">{fmtUsd(c.longValue)}</td>
                          <td className="py-3 px-3 text-right text-loss text-sm">{fmtUsd(c.shortValue)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-surface-raised rounded-full overflow-hidden flex">
                                <div className="h-full bg-profit" style={{ width: `${c.longPct}%` }} />
                                <div className="h-full bg-loss flex-1" />
                              </div>
                              <span className={`text-xs font-semibold w-12 text-right ${c.bias === 'long' ? 'text-profit' : 'text-loss'}`}>
                                {c.bias === 'long' ? `${c.longPct.toFixed(0)}%L` : `${(100 - c.longPct).toFixed(0)}%S`}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${c.coin}-detail`} className="border-t border-line">
                            <td colSpan={6} className="px-4 py-3 bg-surface-raised">
                              <table className="w-full">
                                <thead>
                                  <tr className="text-content-muted text-xs">
                                    <th className="text-left pb-2 font-medium">Wallet</th>
                                    <th className="text-center pb-2 font-medium">Side</th>
                                    <th className="text-right pb-2 font-medium">Entry Price</th>
                                    <th className="text-right pb-2 font-medium">Size</th>
                                    <th className="text-right pb-2 font-medium">Value</th>
                                    <th className="text-right pb-2 font-medium">uPnL</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                  {entries.map((e, idx) => {
                                    const isLong = e.sz > 0;
                                    return (
                                      <tr key={idx}>
                                        <td className="py-1.5 font-mono text-xs text-content-secondary">{shortenAddr(e.address)}</td>
                                        <td className="py-1.5 text-center">
                                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isLong ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                                            {isLong ? 'LONG' : 'SHORT'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-right text-content-primary text-xs font-medium">
                                          ${e.entryPx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 text-right text-content-secondary text-xs">{Math.abs(e.sz).toFixed(4)}</td>
                                        <td className="py-1.5 text-right text-content-secondary text-xs">{fmtUsd(e.value)}</td>
                                        <td className={`py-1.5 text-right text-xs font-medium ${e.upnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                                          {signedUsd(e.upnl)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {data.coins.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-content-muted text-sm">
                        No open positions found across tracked wallets
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual wallet positions */}
          <div className="bg-surface rounded-card overflow-hidden shadow-elev-1">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-content-primary font-semibold">Wallet Positions</h3>
              <p className="text-content-muted text-xs mt-0.5">Sorted by account value — tap to expand</p>
            </div>
            <div className="divide-y divide-line">
              {data.whales.map((whale, i) => {
                const isExpanded = expandedWhale === i;
                const hasPositions = whale.openPositions.length > 0;
                return (
                  <div key={whale.address}>
                    <button
                      onClick={() => hasPositions && setExpandedWhale(isExpanded ? null : i)}
                      className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left ${
                        hasPositions ? 'hover:bg-surface-raised cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-content-muted text-sm w-5 flex-shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-content-secondary font-mono text-sm">{shortenAddr(whale.address)}</div>
                          <div className="text-content-muted text-sm mt-0.5">
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
                          <div className="text-content-muted text-sm">Account Value</div>
                          <div className="text-content-primary text-base font-semibold">{fmtUsd(whale.accountValue)}</div>
                        </div>
                        {hasPositions ? (
                          isExpanded ? <ChevronUp size={14} className="text-content-muted" /> : <ChevronDown size={14} className="text-content-muted" />
                        ) : (
                          <div className="w-[14px]" />
                        )}
                      </div>
                    </button>

                    {isExpanded && hasPositions && (
                      <div className="px-5 pb-4 pt-2 bg-surface-raised">
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
                                className={`rounded-lg p-4 border ${
                                  isLong ? 'bg-profit/5 border-profit/15' : 'bg-loss/5 border-loss/15'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-content-primary font-bold text-lg">{pos.coin}</span>
                                  <div className="flex items-center gap-2">
                                    {lev && <span className="text-content-secondary text-sm">{lev}x</span>}
                                    <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
                                      isLong ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'
                                    }`}>
                                      {isLong ? 'LONG' : 'SHORT'}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                  <div>
                                    <div className="text-content-muted">Size</div>
                                    <div className="text-content-secondary font-medium">{Math.abs(sz).toFixed(4)}</div>
                                  </div>
                                  <div>
                                    <div className="text-content-muted">Value</div>
                                    <div className="text-content-secondary font-medium">{fmtUsd(val)}</div>
                                  </div>
                                  <div>
                                    <div className="text-content-muted">Entry</div>
                                    <div className="text-content-secondary font-medium">
                                      ${parseFloat(pos.entryPx ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-content-muted">uPnL</div>
                                    <div className={`font-medium ${upnl >= 0 ? 'text-profit' : 'text-loss'}`}>{signedUsd(upnl)}</div>
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
    </Page>
  );
}

export default WhaleTracker;
