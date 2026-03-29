import { useState } from 'react';
import { ImageIcon, BarChart2, Plus } from 'lucide-react';
import TradeDetailsModal from './TradeDetailsModal';

function getExecutionTag(trade, maxRiskPercent) {
  const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
    Math.abs(trade.pnlPercent || 0) > maxRiskPercent;
  const mistakeTags = trade.mistakeTags || [];
  const score = trade.executionScore || 0;

  if (isOverRisk || mistakeTags.includes('over-risk')) {
    return { label: 'Over Risk', style: 'bg-red-500/20 text-red-400 border border-red-500/30' };
  }
  if (mistakeTags.includes('revenge')) {
    return { label: 'Revenge', style: 'bg-red-500/20 text-red-400 border border-red-500/30' };
  }
  if (mistakeTags.includes('fomo')) {
    return { label: 'FOMO', style: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' };
  }
  if (mistakeTags.includes('no-stop')) {
    return { label: 'No Stop', style: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' };
  }
  if (score >= 8 && trade.result === 'win') {
    return { label: 'A+ Setup', style: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' };
  }
  if (score >= 6 && trade.result === 'win') {
    return { label: 'Clean Trade', style: 'bg-green-500/20 text-green-400 border border-green-500/30' };
  }
  if (score > 0 && score < 4) {
    return { label: 'Rule Break', style: 'bg-red-500/20 text-red-400 border border-red-500/30' };
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
      <div className="bg-dark-card border border-dark-border rounded-lg p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h2 className="text-xl font-bold text-white">Recent Trades</h2>
          <div className="flex gap-2">
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">All Results</option>
              <option value="win">Wins</option>
              <option value="loss">Losses</option>
            </select>
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
              <tr className="border-b border-dark-border text-gray-400 text-sm">
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
                      className={`border-b border-dark-border cursor-pointer transition-colors ${
                        isOverRisk
                          ? 'hover:bg-red-500/5 bg-red-500/3'
                          : 'hover:bg-dark-bg'
                      }`}
                    >
                      <td className="py-3 px-2 text-gray-300 text-sm">
                        {tradeDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-2 text-white font-medium">{trade.ticker || 'BTC'}</td>
                      <td className="py-3 px-2">
                        <div>
                          <span className="inline-flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${
                              trade.direction === 'long' ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                            <span className={trade.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
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
                        trade.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        <span>{trade.pnlPercent?.toFixed(2)}%</span>
                        {isOverRisk && (
                          <span className="ml-1 text-orange-400 text-xs" title="Exceeded risk limit">⚠</span>
                        )}
                      </td>
                      <td className={`py-3 px-2 text-right font-semibold ${
                        trade.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {gainPrefix}{absGain}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-300 text-sm">
                        ${Number(trade.fee || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {trade.chartImageUrl && (
                          <ImageIcon size={16} className="inline text-blue-500/60" />
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-400 text-sm">
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
                      <BarChart2 size={40} strokeWidth={1.2} className="text-gray-700" />
                      <p className="text-gray-400 font-medium">No trades this period</p>
                      <p className="text-gray-600 text-sm">Try a different filter, or log your first trade.</p>
                      {onAddTrade && (
                        <button
                          onClick={onAddTrade}
                          className="mt-1 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm px-4 py-2 rounded-lg transition-all"
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
                      ? 'bg-red-500/5 border-red-500/25 hover:border-red-500/40'
                      : trade.result === 'win'
                        ? 'bg-dark-bg border-dark-border hover:border-green-500/30'
                        : 'bg-dark-bg border-dark-border hover:border-gray-600'
                  }`}
                >
                  {/* Top row: Ticker + Direction + Execution tag */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">{trade.ticker || 'BTC'}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        trade.direction === 'long'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-red-500/15 text-red-400'
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
                  <div className="text-gray-500 text-xs mb-3">
                    {tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>

                  {/* P&L — $ is anchor */}
                  <div className="flex items-end justify-between">
                    <div>
                      <div className={`text-2xl font-bold leading-tight ${
                        trade.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {gainPrefix}{absGain}
                      </div>
                      <div className={`flex items-center gap-1 text-sm mt-0.5 ${
                        trade.pnlPercent >= 0 ? 'text-green-500/60' : 'text-red-500/60'
                      }`}>
                        {trade.pnlPercent?.toFixed(2)}%
                        {isOverRisk && (
                          <span className="text-orange-400 text-xs" title="Exceeded risk limit">⚠</span>
                        )}
                      </div>
                    </div>

                    {/* Right-side indicators */}
                    <div className="flex items-center gap-2">
                      {trade.chartImageUrl && (
                        <ImageIcon size={15} className="text-blue-500/50" />
                      )}
                      {(trade.executionScore || 0) > 0 && (
                        <span className={`text-xs font-medium ${
                          trade.executionScore >= 7 ? 'text-green-500/60' :
                          trade.executionScore >= 4 ? 'text-yellow-500/60' : 'text-red-500/60'
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
              <BarChart2 size={40} strokeWidth={1.2} className="text-gray-700" />
              <p className="text-gray-400 font-medium">No trades this period</p>
              <p className="text-gray-600 text-sm">Try a different filter, or log your first trade.</p>
              {onAddTrade && (
                <button
                  onClick={onAddTrade}
                  className="mt-1 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm px-4 py-2 rounded-lg transition-all"
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
