import { useState, useEffect } from 'react';
import CountUp from 'react-countup';
import { Plus } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import EquityCurve from '../components/EquityCurve';
import RecentTrades from '../components/RecentTrades';
import TradeModal from '../components/TradeModal';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [trades, setTrades] = useState([]);
  const [metrics, setMetrics] = useState({
    totalPnl: 0,
    winRate: 0,
    wins: 0,
    losses: 0,
    expectancy: 0,
    profitFactor: 0
  });
  const [deposits, setDeposits] = useState([]);

  // Fetch deposits from Firebase
  useEffect(() => {
    return onSnapshot(collection(db, 'deposits'), (snap) => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Fetch trades from Firebase
  useEffect(() => {
    const tradesQuery = query(
      collection(db, 'trades'),
      orderBy('tradeDate', 'desc')
    );

    const unsubscribe = onSnapshot(tradesQuery, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTrades(tradesData);
      calculateMetrics(tradesData);
    });

    return () => unsubscribe();
  }, []);

  const calculateMetrics = (tradesData) => {
    // Filter for current month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthTrades = tradesData.filter(trade => {
      const tradeDate = trade.tradeDate?.toDate();
      return tradeDate && 
        tradeDate.getMonth() === currentMonth && 
        tradeDate.getFullYear() === currentYear;
    });

    const wins = monthTrades.filter(t => t.result === 'win');
    const losses = monthTrades.filter(t => t.result === 'loss');
    
    const totalPnl = monthTrades.reduce((sum, t) => sum + (t.gainLoss || 0), 0);
    const totalWins = wins.reduce((sum, t) => sum + (t.gainLoss || 0), 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.gainLoss || 0), 0));
    
    const winRate = monthTrades.length > 0 
      ? (wins.length / monthTrades.length) * 100 
      : 0;
    
    const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
    const expectancy = winRate > 0 && avgLoss > 0
      ? ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss)
      : 0;
    
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    setMetrics({
      totalPnl,
      winRate,
      wins: wins.length,
      losses: losses.length,
      expectancy: (expectancy / avgLoss) * 100 || 0,
      profitFactor
    });
  };

  const getTradeDate = (trade) => trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);

  const getBalanceAtDate = (targetDate) => {
    const funded = deposits
      .filter(d => {
        const date = d.date?.toDate?.() || new Date(d.date);
        return date <= targetDate;
      })
      .reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);

    const pnlBefore = trades
      .filter(t => {
        const d = getTradeDate(t);
        return !Number.isNaN(d.getTime()) && d < targetDate;
      })
      .reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);

    return funded + pnlBefore;
  };

  const calculatePeriodPercent = (period) => {
    const now = new Date();
    let periodStart;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - 7);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return 0;
    }

    const balanceAtStart = getBalanceAtDate(periodStart);
    const totalFunded = deposits.reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    const denominator = balanceAtStart > 0 ? balanceAtStart : totalFunded;
    if (denominator <= 0) return 0;

    const periodPnl = trades
      .filter(t => {
        const d = getTradeDate(t);
        return !Number.isNaN(d.getTime()) && d >= periodStart && d <= now;
      })
      .reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);

    return (periodPnl / denominator) * 100;
  };

  const maxDrawdown = (() => {
    if (deposits.length === 0 || trades.length === 0) return 0;
    const totalFunded = deposits.reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    const sorted = [...trades]
      .filter(t => t.tradeDate)
      .sort((a, b) => getTradeDate(a) - getTradeDate(b));
    let peak = totalFunded;
    let balance = totalFunded;
    let maxDD = 0;
    for (const t of sorted) {
      balance += Number(t.gainLoss) || 0;
      if (balance > peak) peak = balance;
      if (peak > 0) maxDD = Math.max(maxDD, ((peak - balance) / peak) * 100);
    }
    return maxDD;
  })();

  const percentSummary = {
    day: calculatePeriodPercent('day'),
    week: calculatePeriodPercent('week'),
    month: calculatePeriodPercent('month'),
    year: calculatePeriodPercent('year')
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total P&L"
          value={
            <CountUp
              end={metrics.totalPnl}
              decimals={2}
              duration={1}
              preserveValue
              formattingFn={(val) => `${val < 0 ? '-' : ''}$${Math.abs(val).toFixed(2)}`}
            />
          }
          subtitle={new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
          isPositive={metrics.totalPnl >= 0}
          primary
        />
        <MetricCard
          title="Win Rate"
          value={<CountUp end={metrics.winRate} suffix="%" decimals={2} duration={1} preserveValue />}
          subtitle={`${metrics.wins}W - ${metrics.losses}L`}
          isPositive={metrics.winRate >= 50}
        />
        <MetricCard
          title="Expectancy"
          value={<CountUp end={metrics.expectancy} suffix="%" decimals={2} duration={1} preserveValue />}
          subtitle="Per trade"
          isPositive={metrics.expectancy >= 0}
        />
        <MetricCard
          title="Profit Factor"
          value={<CountUp end={metrics.profitFactor} decimals={2} duration={1} preserveValue />}
          subtitle="Win/Loss ratio"
          isPositive={metrics.profitFactor >= 1}
        />
        <div className="col-span-2 lg:col-span-1">
          <MetricCard
            title="Max Drawdown"
            value={<CountUp end={maxDrawdown} prefix="-" suffix="%" decimals={2} duration={1} preserveValue />}
            subtitle="Peak to trough"
            isPositive={false}
          />
        </div>
      </div>

      {/* Percentage Gain Cards */}
      {deposits.length === 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-4 py-2 text-yellow-400 text-sm">
          Add your initial deposit in <strong>Settings</strong> to see accurate % gain figures.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Day % Gain"
          value={`${percentSummary.day >= 0 ? '+' : ''}${percentSummary.day.toFixed(2)}%`}
          subtitle="Today"
          isPositive={percentSummary.day >= 0}
          primary
        />
        <MetricCard
          title="Week % Gain"
          value={`${percentSummary.week >= 0 ? '+' : ''}${percentSummary.week.toFixed(2)}%`}
          subtitle="Last 7 days"
          isPositive={percentSummary.week >= 0}
          primary
        />
        <MetricCard
          title="Month % Gain"
          value={`${percentSummary.month >= 0 ? '+' : ''}${percentSummary.month.toFixed(2)}%`}
          subtitle={new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          isPositive={percentSummary.month >= 0}
          primary
        />
        <MetricCard
          title="Year % Gain"
          value={`${percentSummary.year >= 0 ? '+' : ''}${percentSummary.year.toFixed(2)}%`}
          subtitle={new Date().getFullYear().toString()}
          isPositive={percentSummary.year >= 0}
          primary
        />
      </div>

      {/* Equity Curve */}
      <EquityCurve trades={trades} deposits={deposits} />

      {/* Recent Trades */}
      <RecentTrades trades={trades} />

      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110 z-50"
        aria-label="Add new trade"
      >
        <Plus size={24} />
      </button>

      {/* Trade Modal */}
      {isModalOpen && (
        <TradeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;
