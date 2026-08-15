import { Clock, Target } from 'lucide-react';

const fmtPrice = (n) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '--';

const daysOpen = (trade) => {
  const opened = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
  if (Number.isNaN(opened.getTime())) return null;
  const days = Math.floor((Date.now() - opened.getTime()) / 86400000);
  if (days <= 0) return 'today';
  return `${days}d open`;
};

/**
 * Live positions, shown above the stats so they read as commitments rather than
 * results. Nothing here is counted in P&L — these trades haven't resolved.
 */
function OpenPositions({ trades, onClose }) {
  if (!trades?.length) return null;

  return (
    <div className="bg-surface rounded-card shadow-elev-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <p className="text-content-muted text-xs uppercase tracking-widest">
          Open Positions
        </p>
        <span className="text-xs text-content-muted tabular-nums">
          {trades.length} live
        </span>
      </div>

      <div className="divide-y divide-line">
        {trades.map((trade) => {
          const entry = Number(trade.entryPrice);
          const stop = Number(trade.stopLoss);
          const leverage = Number(trade.leverage) || 1;
          const riskPercent =
            Number.isFinite(entry) && Number.isFinite(stop) && entry > 0
              ? (Math.abs(entry - stop) / entry) * 100 * leverage
              : null;
          const isLong = (trade.direction || '').toLowerCase() === 'long';

          return (
            <div key={trade.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-content-primary font-semibold text-sm">
                      {trade.ticker || 'BTC'}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${
                        isLong ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {isLong ? 'Long' : 'Short'}
                    </span>
                    {leverage > 1 && (
                      <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-surface-raised text-content-secondary">
                        {leverage}x
                      </span>
                    )}
                    <span className="text-[11px] text-content-muted inline-flex items-center gap-1">
                      <Clock size={10} />
                      {daysOpen(trade)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs text-content-secondary tabular-nums flex-wrap">
                    <span>Entry {fmtPrice(entry)}</span>
                    {Number.isFinite(stop) && stop > 0 && (
                      <span className="text-loss/90">Stop {fmtPrice(stop)}</span>
                    )}
                    {Number.isFinite(Number(trade.targetPrice)) && Number(trade.targetPrice) > 0 && (
                      <span className="text-profit/90 inline-flex items-center gap-1">
                        <Target size={11} />
                        {fmtPrice(Number(trade.targetPrice))}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-[11px] text-content-muted tabular-nums">
                    {Number.isFinite(trade.plannedRR) && (
                      <span>Planned {trade.plannedRR.toFixed(2)}R</span>
                    )}
                    {riskPercent !== null && <span>Risk -{riskPercent.toFixed(1)}%</span>}
                  </div>

                  {trade.entryReason && (
                    <p className="text-xs text-content-secondary mt-2 leading-snug">
                      {trade.entryReason}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => onClose(trade)}
                  className="flex-shrink-0 rounded-control bg-brand hover:bg-brand-hover transition-colors px-3 py-1.5 text-xs font-medium text-content-primary active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OpenPositions;
