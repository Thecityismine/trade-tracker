import { useState, useEffect } from 'react';
import CountUp from 'react-countup';
import { Plus, Pin } from 'lucide-react';
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
  const [pinnedNotes, setPinnedNotes] = useState([]);

  // Fetch deposits from Firebase
  useEffect(() => {
    return onSnapshot(collection(db, 'deposits'), (snap) => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Fetch pinned notebook notes
  useEffect(() => {
    return onSnapshot(collection(db, 'notebookEntries'), (snap) => {
      const pinned = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => n.pinned)
        .slice(0, 3);
      setPinnedNotes(pinned);
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

  const aiCoachSummary = (() => {
    if (trades.length === 0) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTrades = trades.filter(t => {
      const d = getTradeDate(t);
      return !Number.isNaN(d.getTime()) && d >= todayStart;
    });
    if (todayTrades.length > 0) {
      const wins = todayTrades.filter(t => t.result === 'win').length;
      const losses = todayTrades.filter(t => t.result === 'loss').length;
      const pnl = todayTrades.reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);
      const wr = Math.round(wins / todayTrades.length * 100);
      let note = '';
      if (wins > 0 && losses === 0) note = ' Clean session — excellent discipline.';
      else if (losses > wins) note = ' More losses than wins — review your setups and reset for tomorrow.';
      else if (wins > losses) note = ' Solid day. Consider locking in the gains.';
      else note = ' Mixed results. Analyze each trade before tomorrow.';
      return `Today: ${todayTrades.length} trade${todayTrades.length !== 1 ? 's' : ''} · ${wins}W / ${losses}L · ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)} · ${wr}% WR.${note}`;
    }
    const weekStart = new Date(now);
    const dow = now.getDay();
    weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekTrades = trades.filter(t => {
      const d = getTradeDate(t);
      return !Number.isNaN(d.getTime()) && d >= weekStart;
    });
    if (weekTrades.length === 0) return 'No trades this week yet. Stay patient and wait for your setup.';
    const wWins = weekTrades.filter(t => t.result === 'win').length;
    const wPnl = weekTrades.reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);
    return `No trades today. This week: ${weekTrades.length} trade${weekTrades.length !== 1 ? 's' : ''} · ${wWins}W / ${weekTrades.length - wWins}L · ${wPnl >= 0 ? '+' : '-'}$${Math.abs(wPnl).toFixed(2)}.`;
  })();

  const performanceIdentity = (() => {
    const completed = trades.filter(t => t.result === 'win' || t.result === 'loss');
    if (completed.length < 5) return null;
    const wins = completed.filter(t => t.result === 'win');
    const winRate = (wins.length / completed.length) * 100;
    const longs = completed.filter(t => t.direction !== 'short');
    const shorts = completed.filter(t => t.direction === 'short');
    const dirLabel = longs.length >= shorts.length ? 'long-biased' : 'short-biased';
    const style = winRate >= 65 ? 'Disciplined' : winRate >= 50 ? 'Developing' : 'High-risk';
    const patternMap = {};
    completed.forEach(t => {
      if (!t.chartPattern?.trim()) return;
      const key = t.chartPattern.trim().toLowerCase();
      if (!patternMap[key]) patternMap[key] = { name: t.chartPattern.trim(), pnl: 0, count: 0 };
      patternMap[key].pnl += Number(t.gainLoss) || 0;
      patternMap[key].count++;
    });
    const patterns = Object.values(patternMap).filter(p => p.count >= 2).sort((a, b) => b.pnl - a.pnl);
    const bestPattern = patterns[0];
    const patternText = bestPattern ? `, strongest with ${bestPattern.name}` : '';
    return `${style}, ${dirLabel} trader — ${winRate.toFixed(0)}% win rate over ${completed.length} trades${patternText}.`;
  })();

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

      {/* AI Coach + Performance Identity */}
      {(aiCoachSummary || performanceIdentity) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aiCoachSummary && (
            <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4">
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">Daily Coach</p>
              <p className="text-blue-100 text-sm leading-relaxed">{aiCoachSummary}</p>
            </div>
          )}
          {performanceIdentity && (
            <div className="bg-purple-900/20 border border-purple-800/30 rounded-lg p-4">
              <p className="text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">Performance Identity</p>
              <p className="text-purple-100 text-sm leading-relaxed">{performanceIdentity}</p>
            </div>
          )}
        </div>
      )}

      {/* Pinned Playbooks */}
      {pinnedNotes.length > 0 && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4 md:p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Pin size={16} className="text-yellow-400" />
            Pinned Playbooks
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {pinnedNotes.map(note => (
              <div key={note.id} className="bg-dark-bg border border-dark-border rounded-lg p-3 hover:border-gray-600 transition-colors">
                <p className="text-white text-sm font-medium mb-1 truncate">{note.title}</p>
                <p className="text-gray-400 text-xs line-clamp-3 whitespace-pre-wrap">
                  {String(note.content || '').replace(/[#*`_~\[\]]/g, '').trim().slice(0, 120)}
                  {(note.content || '').length > 120 ? '...' : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
