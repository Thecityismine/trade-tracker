import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART, gridProps, xAxisProps, yAxisProps, tooltipProps, lineProps, usdTick } from './ui/chartTheme';

/**
 * Account balance after each trade. `since` (a Date, or null for all time)
 * comes from the dashboard's range picker, so the curve always shows the same
 * window as the KPIs beside it. `rangeLabel` names that window in the header.
 *
 * The card fills the height its parent gives it — the dashboard stretches it
 * to line up with the Today rail — and never shrinks the chart below a
 * readable minimum.
 */
function EquityCurve({ trades, deposits = [], since = null, rangeLabel = 'all time' }) {
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

    if (!since) return data;

    const inRange = data.filter(d => d.fullDate >= since);
    if (inRange.length === 0) return [];
    // Start from the balance going into the range, so a single trade still
    // draws a line and the first trade's move is visible.
    const before = data.filter(d => d.fullDate < since).pop();
    return before ? [{ ...before, date: 'Start', isStart: true }, ...inRange] : inRange;
  };

  const data = calculateEquityCurve();

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="bg-surface p-3 rounded-card shadow-lg">
          <p className="text-content-primary font-medium">{point.isStart ? 'Start of range' : point.date}</p>
          <p className={`text-sm ${payload[0].value >= 0 ? 'text-profit' : 'text-loss'}`}>
            Balance: {payload[0].value < 0 ? '-' : ''}${Math.abs(payload[0].value).toFixed(2)}
          </p>
          {!point.isStart && (
            <p className="text-content-secondary text-xs">
              {point.ticker} · {point.direction === 'long' ? 'Long' : 'Short'}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface rounded-card p-4 md:p-6 shadow-elev-1">
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-content-primary">Equity Curve</h2>
        <p className="text-xs text-content-muted">{rangeLabel}</p>
      </div>

      {/* The chart is positioned absolutely so the card can stretch to any
          height; min-h keeps it readable when nothing stretches it. */}
      <div className="relative min-h-[16rem] w-full flex-1 md:min-h-[20rem]">
        <div className="absolute inset-0">
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
                <YAxis {...yAxisProps} tickFormatter={usdTick} domain={['auto', 'auto']} />
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
              No trades {rangeLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EquityCurve;
