import { useState } from 'react';
import { ImageIcon, BarChart2, Plus } from 'lucide-react';
import TradeDetailsModal from './TradeDetailsModal';
import Select from './ui/Select';

function getExecutionTag(trade, maxRiskPercent) {
  const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
    Math.abs(trade.pnlPercent || 0) > maxRiskPercent;
  const mistakeTags = trade.mistakeTags || [];
  const score = trade.executionScore || 0;

  if (isOverRisk || mistakeTags.includes('over-risk')) {
    return { label: 'Over Risk', style: 'bg-loss/20 text-loss border border-loss/30' };
  }
  if (mistakeTags.includes('revenge')) {
    return { label: 'Revenge', style: 'bg-loss/20 text-loss border border-loss/30' };
  }
  if (mistakeTags.includes('fomo')) {
    return { label: 'FOMO', style: 'bg-caution/20 text-caution border border-caution/30' };
  }
  if (mistakeTags.includes('no-stop')) {
    return { label: 'No Stop', style: 'bg-warn/20 text-warn border border-warn/30' };
  }
  if (score >= 8 && trade.result === 'win') {
    return { label: 'A+ Setup', style: 'bg-brand/20 text-brand border border-brand/30' };
  }
  if (score >= 6 && trade.result === 'win') {
    return { label: 'Clean Trade', style: 'bg-profit/20 text-profit border border-profit/30' };
  }
  if (score > 0 && score < 4) {
    return { label: 'Rule Break', style: 'bg-loss/20 text-loss border border-loss/30' };
  }
  return null;
}

function RecentTrades({ trades, maxRiskPercent = 0, onAddTrade }) {
  const [filterPeriod, setFilterPeriod] = useState('today');
  const [filterResult, setFilterResult] = useState('all');
  const [selectedTrade, setSelectedTrade] = useState(null);

  const getTradeDate = (trade) => trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
  const getCreatedTime = (trade) => {
    if (trade.createdAt?.toMillis) return trade.createdAt.toMillis();
    if (trade.createdAt) {
      const created = new Date(trade.createdAt).getTime();
      return Number.isNaN(created) ? 0 : created;
    }
    return 0;
  };

  const filteredTrades = trades.filter((trade) => {
    if (filterResult === 'win' && trade.result !== 'win') return false;
    if (filterResult === 'loss' && trade.result !== 'loss') return false;

    const now = new Date();
    const tradeDate = getTradeDate(trade);

    switch (filterPeriod) {
      case 'today':
        return tradeDate.toDateString() === now.toDateString();
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return tradeDate >= weekAgo;
      }
      case 'month':
        return tradeDate.getMonth() === now.getMonth() &&
          tradeDate.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  });

  const sortedTrades = [...filteredTrades].sort((a, b) => {
    const createdTimeDiff = getCreatedTime(b) - getCreatedTime(a);
    if (createdTimeDiff !== 0) return createdTimeDiff;
    const tradeTimeDiff = getTradeDate(b).getTime() - getTradeDate(a).getTime();
    if (tradeTimeDiff !== 0) return tradeTimeDiff;
    return (b.id || '').localeCompare(a.id || '');
  });

  return (
    <>
      <div className="bg-surface rounded-card p-4 md:p-6 shadow-elev-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h2 className="text-xl font-bold text-content-primary">Recent Trades</h2>
          <div className="flex gap-2">
            <Select
              className="w-36"
              value={filterPeriod}
              onChange={setFilterPeriod}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' },
                { value: 'all', label: 'All Time' },
              ]}
            />
            <Select
              className="w-36"
              value={filterResult}
              onChange={setFilterResult}
              options={[
                { value: 'all', label: 'All Results' },
                { value: 'win', label: 'Wins' },
                { value: 'loss', label: 'Losses' },
              ]}
            />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table-fixed w-full">
            <colgroup>
              <col className="w-[80px]" />
              <col className="w-[100px]" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[120px]" />
              <col className="w-[100px]" />
              <col className="w-[80px]" />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-line text-content-secondary text-sm">
                <th className="text-left py-3 px-2">Date</th>
                <th className="text-left py-3 px-2">Ticker</th>
                <th className="text-left py-3 px-2">Direction</th>
                <th className="text-right py-3 px-2">P&L%</th>
                <th className="text-right py-3 px-2">Gain / Loss</th>
                <th className="text-right py-3 px-2">Fee</th>
                <th className="text-center py-3 px-2">Chart</th>
                <th className="text-left py-3 px-2">Comment</th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.length > 0 ? (
                sortedTrades.map((trade) => {
                  const tradeDate = getTradeDate(trade);
                  const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
                    Math.abs(trade.pnlPercent || 0) > maxRiskPercent;
                  const executionTag = getExecutionTag(trade, maxRiskPercent);
                  const absGain = Math.abs(trade.gainLoss || 0).toFixed(2);
                  const gainPrefix = trade.gainLoss >= 0 ? '+$' : '-$';

                  return (
                    <tr
                      key={trade.id}
                      onClick={() => setSelectedTrade(trade)}
                      className={`border-b border-line cursor-pointer transition-colors ${
                        isOverRisk
                          ? 'hover:bg-loss/5 bg-loss/3'
                          : 'hover:bg-surface-raised'
                      }`}
                    >
                      <td className="py-3 px-2 text-content-secondary text-sm">
                        {tradeDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-2 text-content-primary font-medium">{trade.ticker || 'BTC'}</td>
                      <td className="py-3 px-2">
                        <div>
                          <span className="inline-flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${
                              trade.direction === 'long' ? 'bg-profit' : 'bg-loss'
                            }`} />
                            <span className={trade.direction === 'long' ? 'text-profit' : 'text-loss'}>
                              {trade.direction === 'long' ? 'Long' : 'Short'}
                            </span>
                          </span>
                          {executionTag && (
                            <div className="mt-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${executionTag.style}`}>
                                {executionTag.label}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`py-3 px-2 text-right font-medium ${
                        trade.pnlPercent >= 0 ? 'text-profit' : 'text-loss'
                      }`}>
                        <span>{trade.pnlPercent?.toFixed(2)}%</span>
                        {isOverRisk && (
                          <span className="ml-1 text-caution text-xs" title="Exceeded risk limit">⚠</span>
                        )}
                      </td>
                      <td className={`py-3 px-2 text-right font-semibold ${
                        trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'
                      }`}>
                        {gainPrefix}{absGain}
                      </td>
                      <td className="py-3 px-2 text-right text-content-secondary text-sm">
                        ${Number(trade.fee || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {trade.chartImageUrl && (
                          <ImageIcon size={16} className="inline text-brand/60" />
                        )}
                      </td>
                      <td className="py-3 px-2 text-content-secondary text-sm">
                        <span className="block truncate" title={trade.comment || ''}>
                          {trade.comment?.trim() ? trade.comment : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8">
                    <div className="py-12 flex flex-col items-center gap-3">
                      <BarChart2 size={40} strokeWidth={1.2} className="text-content-muted" />
                      <p className="text-content-secondary font-medium">No trades this period</p>
                      <p className="text-content-muted text-sm">Try a different filter, or log your first trade.</p>
                      {onAddTrade && (
                        <button
                          onClick={onAddTrade}
                          className="mt-1 flex items-center gap-2 bg-brand hover:bg-brand-hover active:scale-95 text-content-primary text-sm px-4 py-2 rounded-lg transition-all"
                        >
                          <Plus size={15} />
                          Add Trade
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {sortedTrades.length > 0 ? (
            sortedTrades.map((trade) => {
              const tradeDate = getTradeDate(trade);
              const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
                Math.abs(trade.pnlPercent || 0) > maxRiskPercent;
              const executionTag = getExecutionTag(trade, maxRiskPercent);
              const absGain = Math.abs(trade.gainLoss || 0).toFixed(2);
              const gainPrefix = trade.gainLoss >= 0 ? '+$' : '-$';

              return (
                <div
                  key={trade.id}
                  onClick={() => setSelectedTrade(trade)}
                  className={`rounded-lg p-4 cursor-pointer transition-all active:scale-[0.97] border ${
                    isOverRisk
                      ? 'bg-loss/5 border-loss/25 hover:border-loss/40'
                      : trade.result === 'win'
                        ? 'bg-surface-raised border-line-strong hover:border-profit/30'
                        : 'bg-surface-raised border-line-strong hover:border-brand/50'
                  }`}
                >
                  {/* Top row: Ticker + Direction + Execution tag */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-content-primary font-semibold">{trade.ticker || 'BTC'}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        trade.direction === 'long'
                          ? 'bg-profit/15 text-profit'
                          : 'bg-loss/15 text-loss'
                      }`}>
                        {trade.direction === 'long' ? 'LONG' : 'SHORT'}
                      </span>
                    </div>
                    {executionTag && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${executionTag.style}`}>
                        {executionTag.label}
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <div className="text-content-muted text-xs mb-3">
                    {tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>

                  {/* P&L — $ is anchor */}
                  <div className="flex items-end justify-between">
                    <div>
                      <div className={`text-2xl font-bold leading-tight ${
                        trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'
                      }`}>
                        {gainPrefix}{absGain}
                      </div>
                      <div className={`flex items-center gap-1 text-sm mt-0.5 ${
                        trade.pnlPercent >= 0 ? 'text-profit/60' : 'text-loss/60'
                      }`}>
                        {trade.pnlPercent?.toFixed(2)}%
                        {isOverRisk && (
                          <span className="text-caution text-xs" title="Exceeded risk limit">⚠</span>
                        )}
                      </div>
                    </div>

                    {/* Right-side indicators */}
                    <div className="flex items-center gap-2">
                      {trade.chartImageUrl && (
                        <ImageIcon size={15} className="text-brand/50" />
                      )}
                      {(trade.executionScore || 0) > 0 && (
                        <span className={`text-xs font-medium ${
                          trade.executionScore >= 7 ? 'text-profit/60' :
                          trade.executionScore >= 4 ? 'text-warn/60' : 'text-loss/60'
                        }`}>
                          {trade.executionScore}/10
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 flex flex-col items-center gap-3">
              <BarChart2 size={40} strokeWidth={1.2} className="text-content-muted" />
              <p className="text-content-secondary font-medium">No trades this period</p>
              <p className="text-content-muted text-sm">Try a different filter, or log your first trade.</p>
              {onAddTrade && (
                <button
                  onClick={onAddTrade}
                  className="mt-1 flex items-center gap-2 bg-brand hover:bg-brand-hover active:scale-95 text-content-primary text-sm px-4 py-2 rounded-lg transition-all"
                >
                  <Plus size={15} />
                  Add Trade
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedTrade && (
        <TradeDetailsModal
          trade={selectedTrade}
          maxRiskPercent={maxRiskPercent}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </>
  );
}

export default RecentTrades;
