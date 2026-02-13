import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function EquityCurve({ trades }) {
  const [timeframe, setTimeframe] = useState('all');

  const getTradeDate = (trade) => trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);

  const calculatePeriodPnlPercent = (period) => {
    if (!trades || trades.length === 0) {
      return { value: 0, count: 0 };
    }

    const now = new Date();
    const filtered = trades.filter((trade) => {
      const tradeDate = getTradeDate(trade);
      if (Number.isNaN(tradeDate.getTime())) {
        return false;
      }

      switch (period) {
        case 'day':
          return tradeDate.toDateString() === now.toDateString();
        case 'week': {
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return tradeDate >= weekAgo && tradeDate <= now;
        }
        case 'month':
          return tradeDate.getMonth() === now.getMonth() &&
            tradeDate.getFullYear() === now.getFullYear();
        case 'year':
          return tradeDate.getFullYear() === now.getFullYear();
        default:
          return false;
      }
    });

    const totalPercent = filtered.reduce((sum, trade) => sum + (Number(trade.pnlPercent) || 0), 0);
    return { value: totalPercent, count: filtered.length };
  };

  // Calculate cumulative P&L for equity curve
  const calculateEquityCurve = () => {
    if (!trades || trades.length === 0) return [];

    const sortedTrades = [...trades]
      .filter(t => t.tradeDate)
      .sort((a, b) => {
        const dateA = getTradeDate(a);
        const dateB = getTradeDate(b);
        return dateA - dateB;
      });

    let cumulativePnl = 0;
    const data = sortedTrades.map(trade => {
      cumulativePnl += trade.gainLoss || 0;
      const tradeDate = getTradeDate(trade);
      
      return {
        date: tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: tradeDate,
        pnl: cumulativePnl,
        pnlPercent: trade.pnlPercent || 0,
        ticker: trade.ticker || 'BTC'
      };
    });

    // Filter by timeframe
    const now = new Date();
    let filtered = data;

    switch (timeframe) {
      case 'daily':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        filtered = data.filter(d => d.fullDate >= yesterday);
        break;
      case 'weekly':
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        filtered = data.filter(d => d.fullDate >= lastWeek);
        break;
      case 'monthly':
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        filtered = data.filter(d => d.fullDate >= lastMonth);
        break;
      default:
        filtered = data;
    }

    return filtered;
  };

  const data = calculateEquityCurve();
  const periodCards = [
    { key: 'day', label: 'Day P&L %' },
    { key: 'week', label: 'Week P&L %' },
    { key: 'month', label: 'Month P&L %' },
    { key: 'year', label: 'Year P&L %' }
  ].map((period) => {
    const stats = calculatePeriodPnlPercent(period.key);
    return { ...period, ...stats };
  });

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-dark-card border border-dark-border p-3 rounded-lg shadow-lg">
          <p className="text-white font-medium">{payload[0].payload.date}</p>
          <p className={`text-sm ${payload[0].value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            P&L: ${payload[0].value.toFixed(2)}
          </p>
          <p className="text-gray-400 text-xs">{payload[0].payload.ticker}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-dark-card border border-dark-border rounded-lg p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 space-y-3 md:space-y-0">
        <h2 className="text-xl font-bold text-white">Equity Curve</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {periodCards.map((card) => (
          <div
            key={card.key}
            className="bg-dark-bg border border-dark-border rounded-lg px-4 py-3"
          >
            <p className="text-xs text-gray-400">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${card.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {card.value >= 0 ? '+' : ''}{card.value.toFixed(2)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">{card.count} trade{card.count === 1 ? '' : 's'}</p>
          </div>
        ))}

        <div className="bg-dark-bg border border-dark-border rounded-lg p-2 flex items-center">
          <div className="flex space-x-2 overflow-x-auto w-full">
          {['daily', 'weekly', 'monthly', 'all'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-dark-bg text-gray-400 hover:text-white'
              }`}
            >
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="w-full h-64 md:h-80">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="pnl"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No trades to display
          </div>
        )}
      </div>
    </div>
  );
}

export default EquityCurve;
