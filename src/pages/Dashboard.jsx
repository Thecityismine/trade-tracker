import { useState, useEffect } from 'react';
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

  const calculatePeriodPercent = (period) => {
    const now = new Date();

    const periodTrades = trades.filter((trade) => {
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

    return periodTrades.reduce((sum, trade) => sum + (Number(trade.pnlPercent) || 0), 0);
  };

  const percentSummary = {
    day: calculatePeriodPercent('day'),
    week: calculatePeriodPercent('week'),
    month: calculatePeriodPercent('month'),
    year: calculatePeriodPercent('year')
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total P&L"
          value={`$${metrics.totalPnl.toFixed(2)}`}
          subtitle={new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
          isPositive={metrics.totalPnl >= 0}
        />
        <MetricCard
          title="Win Rate"
          value={`${metrics.winRate.toFixed(2)}%`}
          subtitle={`${metrics.wins}W - ${metrics.losses}L`}
          isPositive={metrics.winRate >= 50}
        />
        <MetricCard
          title="Expectancy"
          value={`${metrics.expectancy.toFixed(2)}%`}
          subtitle="Per trade"
          isPositive={metrics.expectancy >= 0}
        />
        <MetricCard
          title="Profit Factor"
          value={metrics.profitFactor.toFixed(2)}
          subtitle="Win/Loss ratio"
          isPositive={metrics.profitFactor >= 1}
        />
      </div>

      {/* Percentage Gain Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Day % Gain"
          value={`${percentSummary.day >= 0 ? '+' : ''}${percentSummary.day.toFixed(2)}%`}
          subtitle="Today"
          isPositive={percentSummary.day >= 0}
        />
        <MetricCard
          title="Week % Gain"
          value={`${percentSummary.week >= 0 ? '+' : ''}${percentSummary.week.toFixed(2)}%`}
          subtitle="Last 7 days"
          isPositive={percentSummary.week >= 0}
        />
        <MetricCard
          title="Month % Gain"
          value={`${percentSummary.month >= 0 ? '+' : ''}${percentSummary.month.toFixed(2)}%`}
          subtitle={new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          isPositive={percentSummary.month >= 0}
        />
        <MetricCard
          title="Year % Gain"
          value={`${percentSummary.year >= 0 ? '+' : ''}${percentSummary.year.toFixed(2)}%`}
          subtitle={new Date().getFullYear().toString()}
          isPositive={percentSummary.year >= 0}
        />
      </div>

      {/* Equity Curve */}
      <EquityCurve trades={trades} />

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
