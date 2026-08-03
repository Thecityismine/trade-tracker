import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART, gridProps, xAxisProps, yAxisProps, tooltipProps, lineProps, usdTick } from './ui/chartTheme';

function EquityCurve({ trades, deposits = [] }) {
  const [timeframe, setTimeframe] = useState('all');

  // Calculate cumulative P&L for equity curve
  const calculateEquityCurve = () => {
    if (!trades || trades.length === 0) return [];

    const sortedTrades = [...trades]
      .filter(t => t.tradeDate)
      .sort((a, b) => {
        const dateA = a.tradeDate?.toDate?.() || new Date(a.tradeDate);
        const dateB = b.tradeDate?.toDate?.() || new Date(b.tradeDate);
        return dateA - dateB;
      });

    // Funding has to be applied on the timeline, not all at once up front.
    // Seeding the first point with every deposit ever made lifts the whole early
    // curve to a balance that did not exist yet, which flattens the real decline.
    const funding = deposits
      .map(d => ({
        date: d.date?.toDate?.() || new Date(d.date),
        delta: d.type === 'deposit' ? d.amount : -d.amount
      }))
      .filter(f => !Number.isNaN(f.date.getTime()))
      .sort((a, b) => a.date - b.date);

    let cumulativePnl = 0;
    let nextFunding = 0;
    const data = sortedTrades.map(trade => {
      const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      while (nextFunding < funding.length && funding[nextFunding].date <= tradeDate) {
        cumulativePnl += funding[nextFunding].delta;
        nextFunding++;
      }
      cumulativePnl += trade.gainLoss || 0;

      return {
        date: tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: tradeDate,
        pnl: cumulativePnl,
        pnlPercent: trade.pnlPercent || 0,
        ticker: trade.ticker || 'BTC',
        direction: trade.direction || 'long'
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

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface p-3 rounded-card shadow-lg">
          <p className="text-content-primary font-medium">{payload[0].payload.date}</p>
          <p className={`text-sm ${payload[0].value >= 0 ? 'text-profit' : 'text-loss'}`}>
            P&L: ${payload[0].value.toFixed(2)}
          </p>
          <p className="text-content-secondary text-xs">
            {payload[0].payload.ticker} · {payload[0].payload.direction === 'long' ? 'Long' : 'Short'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-surface rounded-card p-4 md:p-6 shadow-elev-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-3 md:space-y-0">
        <h2 className="text-xl font-bold text-content-primary">Equity Curve</h2>
        
        <div className="flex space-x-2 overflow-x-auto">
          {['daily', 'weekly', 'monthly', 'all'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                timeframe === tf
                  ? 'bg-brand text-content-primary'
                  : 'bg-surface-raised text-content-secondary hover:text-content-primary'
              }`}
            >
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full h-64 md:h-80">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.brand} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={CHART.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} tickFormatter={usdTick} />
              <Tooltip content={<CustomTooltip />} cursor={tooltipProps.cursor} />
              <Area
                type="monotone"
                dataKey="pnl"
                stroke={CHART.brand}
                fill="url(#equityGradient)"
                activeDot={{ r: 4, fill: CHART.brand }}
                {...lineProps}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-content-muted">
            No trades to display
          </div>
        )}
      </div>
    </div>
  );
}

export default EquityCurve;
