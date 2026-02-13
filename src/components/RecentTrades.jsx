import { useState } from 'react';
import { Search, ImageIcon } from 'lucide-react';
import TradeDetailsModal from './TradeDetailsModal';

function RecentTrades({ trades }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('today');
  const [selectedTrade, setSelectedTrade] = useState(null);

  const getTradeDate = (trade) => trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
  const getCreatedTime = (trade) => {
    if (trade.createdAt?.toMillis) {
      return trade.createdAt.toMillis();
    }
    if (trade.createdAt) {
      const created = new Date(trade.createdAt).getTime();
      return Number.isNaN(created) ? 0 : created;
    }
    return 0;
  };

  const filteredTrades = trades.filter((trade) => {
    const matchesSearch =
      (trade.ticker?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (trade.comment?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

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
    const tradeTimeDiff = getTradeDate(b).getTime() - getTradeDate(a).getTime();
    if (tradeTimeDiff !== 0) {
      return tradeTimeDiff;
    }

    const createdTimeDiff = getCreatedTime(b) - getCreatedTime(a);
    if (createdTimeDiff !== 0) {
      return createdTimeDiff;
    }

    return (b.id || '').localeCompare(a.id || '');
  });

  return (
    <>
      <div className="bg-dark-card border border-dark-border rounded-lg p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 space-y-3 md:space-y-0">
          <h2 className="text-xl font-bold text-white">Recent Trades</h2>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search trades..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-full sm:w-auto"
              />
            </div>

            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="all">All Time</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table-fixed w-full">
            <colgroup>
              <col className="w-[80px]" />
              <col className="w-[120px]" />
              <col className="w-[130px]" />
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
                <th className="text-right py-3 px-2">Gain</th>
                <th className="text-right py-3 px-2">Fee</th>
                <th className="text-center py-3 px-2">Chart</th>
                <th className="text-left py-3 px-2">Comment</th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.length > 0 ? (
                sortedTrades.map((trade) => {
                  const tradeDate = getTradeDate(trade);
                  return (
                    <tr
                      key={trade.id}
                      onClick={() => setSelectedTrade(trade)}
                      className="border-b border-dark-border hover:bg-dark-bg cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-2 text-gray-300 text-sm">
                        {tradeDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-2 text-white font-medium">{trade.ticker || 'BTC'}</td>
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`inline-block w-4 h-4 rounded-full ${
                              trade.direction === 'long' ? 'bg-green-500' : 'bg-red-500'
                            }`}
                          />
                          <span className={trade.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
                            {trade.direction === 'long' ? 'L' : 'S'}
                          </span>
                        </span>
                      </td>
                      <td className={`py-3 px-2 text-right font-medium ${
                        trade.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {trade.pnlPercent?.toFixed(2)}%
                      </td>
                      <td className={`py-3 px-2 text-right font-medium ${
                        trade.gainLoss >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        ${trade.gainLoss?.toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-300">
                        ${Number(trade.fee || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {trade.chartImageUrl && (
                          <ImageIcon size={18} className="inline text-blue-500" />
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
                  <td colSpan="8" className="py-8 text-center text-gray-500">
                    No trades found
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
              return (
                <div
                  key={trade.id}
                  onClick={() => setSelectedTrade(trade)}
                  className="bg-dark-bg border border-dark-border rounded-lg p-4 cursor-pointer hover:border-gray-600 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-gray-400 text-xs">
                        {tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-white font-medium">{trade.ticker || 'BTC'}</div>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <span
                        className={`inline-block w-4 h-4 rounded-full ${
                          trade.direction === 'long' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span className={trade.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
                        {trade.direction === 'long' ? 'L' : 'S'}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className={`text-lg font-bold ${
                      trade.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {trade.pnlPercent?.toFixed(2)}%
                    </div>
                    <div className={`text-lg font-bold ${
                      trade.gainLoss >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      ${trade.gainLoss?.toFixed(2)}
                    </div>
                    {trade.chartImageUrl && (
                      <ImageIcon size={18} className="text-blue-500" />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-gray-500">
              No trades found
            </div>
          )}
        </div>
      </div>

      {selectedTrade && (
        <TradeDetailsModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </>
  );
}

export default RecentTrades;
