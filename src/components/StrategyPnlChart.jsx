import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { getTradeDate } from '../utils/accountMath';

const RANGES = [
  { id: 'all', label: 'All' },
  { id: '30d', label: '30d' },
  { id: 'month', label: 'Month' }
];

// Below this many trades a strategy is ranked but greyed out, and can't be
// crowned top: one or two lucky trades say little about a setup.
const MIN_TRADES = 5;
const COLLAPSED_ROWS = 8;

const isNoStrategy = (s) => /no strategy/i.test(s.name || '');

const rangeStart = (range) => {
  const now = new Date();
  if (range === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
};

const money = (n) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;

function StrategyPnlChart({ trades, strategies, onSelect }) {
  const [range, setRange] = useState('all');
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const since = rangeStart(range);
    const byId = {};
    trades.forEach((t) => {
      if (!t.strategyId || t.status === 'open' || t.gainLoss == null) return;
      if (since) {
        const d = getTradeDate(t);
        if (Number.isNaN(d.getTime()) || d < since) return;
      }
      const s = (byId[t.strategyId] ||= { trades: 0, wins: 0, losses: 0, net: 0 });
      s.trades += 1;
      if (t.result === 'win') s.wins += 1;
      else if (t.result === 'loss') s.losses += 1;
      s.net += Number(t.gainLoss) || 0;
    });
    return strategies
      .filter((s) => byId[s.id])
      .map((s) => {
        const st = byId[s.id];
        const decided = st.wins + st.losses;
        return {
          strategy: s,
          ...st,
          winRate: decided > 0 ? (st.wins / decided) * 100 : null,
          lowSample: st.trades < MIN_TRADES,
          noStrategy: isNoStrategy(s)
        };
      })
      .sort((a, b) => b.net - a.net);
  }, [trades, strategies, range]);

  const top = rows.find((r) => !r.noStrategy && !r.lowSample && r.net > 0)
    || rows.find((r) => !r.noStrategy && r.net > 0);

  // Scale bars to the real strategies so a huge "No Strategy" loss doesn't
  // flatten everything else; its bar is capped at full width instead.
  const scale = Math.max(1, ...rows.filter((r) => !r.noStrategy).map((r) => Math.abs(r.net)));

  let visible = rows;
  if (!expanded && rows.length > COLLAPSED_ROWS) {
    visible = rows.slice(0, COLLAPSED_ROWS);
    const none = rows.find((r) => r.noStrategy);
    if (none && !visible.includes(none)) visible = [...visible, none];
  }
  const hidden = rows.length - visible.length;

  return (
    <div className="bg-surface rounded-card p-4 sm:p-6 shadow-elev-1">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-content-secondary text-sm font-semibold uppercase tracking-wide">Strategy P&L</h2>
        <div className="flex bg-surface-raised border border-line-strong rounded-lg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                range === r.id ? 'bg-brand text-white' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-content-muted text-sm py-6 text-center">No closed strategy trades in this period.</p>
      ) : (
        <>
          {top && (
            <button
              type="button"
              onClick={() => onSelect(top.strategy)}
              className="w-full text-left bg-profit/10 border border-profit/30 rounded-lg p-4 mb-5 hover:border-profit/60 transition-colors"
            >
              <div className="flex items-center gap-2 text-content-secondary text-xs uppercase tracking-wide">
                <Trophy size={14} className="text-profit" />
                Top strategy
              </div>
              <p className="text-content-primary font-semibold mt-1 truncate">{top.strategy.name}</p>
              <p className="text-profit text-3xl font-bold mt-1 tabular-nums">{money(top.net)}</p>
              <p className="text-content-muted text-xs mt-1">
                {top.trades} trades
                {top.winRate != null && ` · ${top.winRate.toFixed(0)}% win`}
                {` · ${money(top.net / top.trades)}/trade`}
              </p>
            </button>
          )}

          <div className="space-y-2">
            {visible.map((r) => {
              const width = Math.min(Math.abs(r.net) / scale, 1) * 100;
              return (
                <button
                  key={r.strategy.id}
                  type="button"
                  onClick={() => onSelect(r.strategy)}
                  title={`${r.trades} trades${r.lowSample ? ' (small sample)' : ''}`}
                  className={`w-full grid grid-cols-[7.5rem_1fr_auto] sm:grid-cols-[12rem_1fr_auto] items-center gap-3 text-left rounded-md px-1 py-1 hover:bg-surface-raised transition-colors ${
                    r.lowSample ? 'opacity-45' : ''
                  }`}
                >
                  <span className="text-content-primary text-xs sm:text-sm truncate">{r.strategy.name}</span>
                  <span className="h-3 bg-surface-raised rounded-sm overflow-hidden">
                    <span
                      className={`block h-full rounded-sm ${r.net >= 0 ? 'bg-profit' : 'bg-loss'}`}
                      style={{ width: `${Math.max(width, 1.5)}%` }}
                    />
                  </span>
                  <span className={`text-xs sm:text-sm font-semibold tabular-nums text-right ${r.net >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {money(r.net)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-content-muted text-[11px]">Faded: fewer than {MIN_TRADES} trades</p>
            {(hidden > 0 || expanded) && rows.length > COLLAPSED_ROWS && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-brand text-xs font-medium"
              >
                {expanded ? 'Show less' : `Show all ${rows.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default StrategyPnlChart;
