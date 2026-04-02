import { useState, useEffect } from 'react';
import CountUp from 'react-countup';
import { Plus, Pin } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import EquityCurve from '../components/EquityCurve';
import RecentTrades from '../components/RecentTrades';
import TradeModal from '../components/TradeModal';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../config/firebase';

function Dashboard({ onNavigate }) {
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
  const [appSettings, setAppSettings] = useState({});

  // Fetch settings from Firebase
  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'user'), (snap) => {
      if (snap.exists()) setAppSettings(snap.data());
    });
  }, []);

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

  const calculatePeriodPercent = (period) => {
    const now = new Date();
    let periodStart;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week': {
        const dow = now.getDay();
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodStart.setDate(periodStart.getDate() - (dow === 0 ? 6 : dow - 1));
        break;
      }
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return 0;
    }

    return trades
      .filter(t => {
        const d = getTradeDate(t);
        return !Number.isNaN(d.getTime()) && d >= periodStart && d <= now;
      })
      .reduce((sum, t) => sum + (Number(t.pnlPercent) || 0), 0);
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

  const weekBanner = (() => {
    if (trades.length === 0) return null;
    const now = new Date();
    const weekStart = new Date(now);
    const dow = now.getDay();
    weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekTrades = trades.filter(t => {
      const d = getTradeDate(t);
      return !Number.isNaN(d.getTime()) && d >= weekStart && (t.result === 'win' || t.result === 'loss');
    });
    if (weekTrades.length === 0) return null;
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayPnl = {};
    weekTrades.forEach(t => {
      const day = getTradeDate(t).getDay();
      dayPnl[day] = (dayPnl[day] || 0) + (Number(t.gainLoss) || 0);
    });
    const dayEntries = Object.entries(dayPnl);
    const bestEntry = dayEntries.reduce((a, b) => Number(b[1]) > Number(a[1]) ? b : a, dayEntries[0]);
    const bestDay = bestEntry && Number(bestEntry[1]) > 0 ? DAY_NAMES[+bestEntry[0]] : null;
    const sortedAll = [...trades]
      .filter(t => t.result === 'win' || t.result === 'loss')
      .sort((a, b) => getTradeDate(a) - getTradeDate(b));
    let streak = 0;
    let streakType = null;
    sortedAll.forEach(t => {
      if (t.result === streakType) streak++;
      else { streak = 1; streakType = t.result; }
    });
    const parts = [`This week: ${percentSummary.week >= 0 ? '+' : ''}${percentSummary.week.toFixed(1)}%`];
    if (bestDay) parts.push(`Best day: ${bestDay}`);
    if (streak >= 2 && streakType) parts.push(`Streak: ${streak} ${streakType}${streak !== 1 ? 's' : ''}`);
    return parts.join(' · ');
  })();

  const dashGoal = (() => {
    const goalAmt = parseFloat(appSettings.goalAmount) || 0;
    if (goalAmt <= 0) return null;
    const totalFunded = deposits.reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    if (totalFunded <= 0) return null;
    const allTimePnl = trades.reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);
    const balance = totalFunded + allTimePnl;
    const progress = Math.min(100, (balance / goalAmt) * 100);
    return { goalAmt, balance, progress, remaining: Math.max(0, goalAmt - balance) };
  })();

  const riskStatus = (() => {
    const r = parseFloat(appSettings.maxRiskPercent);
    if (!r || r <= 0 || trades.length === 0) return null;
    const violations = trades.filter(t => t.result === 'loss' && Math.abs(t.pnlPercent || 0) > r).length;
    if (violations === 0) return { level: 'green', label: '🟢 Within Rules', violations };
    if (violations <= 3) return { level: 'yellow', label: '🟡 Warning', violations };
    return { level: 'red', label: '🔴 System Violation', violations };
  })();

  const todaysFocus = (() => {
    if (trades.length === 0) return null;
    const r = parseFloat(appSettings.maxRiskPercent);
    const maxTrades = parseInt(appSettings.maxTradesPerDay);
    const maxDailyLoss = parseFloat(appSettings.maxDailyLossPercent);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTrades = trades.filter(t => {
      const d = getTradeDate(t);
      return !Number.isNaN(d.getTime()) && d >= todayStart;
    });
    const todayLossDollars = todayTrades.filter(t => t.result === 'loss').reduce((s, t) => s + Math.abs(Number(t.gainLoss) || 0), 0);
    const totalFunded = deposits.reduce((s, d) => s + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    const todayLossPct = totalFunded > 0 ? (todayLossDollars / totalFunded) * 100 : 0;
    const focuses = [];
    if (r > 0) focuses.push(`Max ${r}% risk per trade — no exceptions.`);
    if (maxTrades > 0) {
      const remaining = maxTrades - todayTrades.length;
      if (remaining <= 0) focuses.push(`Daily trade limit reached (${maxTrades}). Stop trading today.`);
      else focuses.push(`${remaining} trade${remaining !== 1 ? 's' : ''} remaining today (limit: ${maxTrades}).`);
    }
    if (maxDailyLoss > 0 && todayLossPct >= maxDailyLoss * 0.8) {
      focuses.push(`Daily loss at ${todayLossPct.toFixed(1)}% — approaching your ${maxDailyLoss}% limit. Slow down.`);
    }
    if (focuses.length === 0) focuses.push('No trades yet today. Wait for your setup — patience is an edge.');
    return focuses;
  })();

  const dailyGoalProgress = (() => {
    const goal = parseFloat(appSettings.dailyPnlGoalPercent);
    if (!goal || goal <= 0) return null;
    const dayPct = percentSummary.day;
    const progress = Math.min(100, Math.max(0, (dayPct / goal) * 100));
    const remaining = Math.max(0, goal - dayPct);
    const hit = dayPct >= goal;
    return { goal, dayPct, progress, remaining, hit };
  })();

  const performanceIdentity = (() => {
    const completed = trades.filter(t => t.result === 'win' || t.result === 'loss');
    if (completed.length < 5) return null;
    const wins = completed.filter(t => t.result === 'win');
    const losses = completed.filter(t => t.result === 'loss');
    const winRate = (wins.length / completed.length) * 100;
    const longs = completed.filter(t => t.direction !== 'short');
    const shorts = completed.filter(t => t.direction === 'short');
    const dirBias = longs.length >= shorts.length ? 'long-biased' : 'short-biased';
    const execLabel = winRate >= 65 ? 'disciplined execution' : winRate >= 50 ? 'inconsistent execution' : 'poor execution';
    const longPnl = longs.reduce((s, t) => s + (Number(t.gainLoss) || 0), 0);
    const shortPnl = shorts.reduce((s, t) => s + (Number(t.gainLoss) || 0), 0);
    const edgeSide = longs.length > 0 && shorts.length > 0 ? (shortPnl > longPnl ? 'Short' : 'Long') : null;
    const weakSide = edgeSide === 'Short' ? 'Long' : 'Short';
    const edgeDiff = Math.abs(shortPnl - longPnl);
    const totalWinDollar = wins.reduce((s, t) => s + (Number(t.gainLoss) || 0), 0);
    const totalLossDollar = losses.reduce((s, t) => s + Math.abs(Number(t.gainLoss) || 0), 0);
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
    const lines = [`You are a ${dirBias} trader with ${execLabel}.`];
    if (edgeSide && edgeDiff > 0.01) lines.push(`Edge identified: ${edgeSide} setups outperform ${weakSide} by $${edgeDiff.toFixed(2)}.`);
    if (totalLossDollar > totalWinDollar) lines.push(`Main issue: Losses ($${totalLossDollar.toFixed(2)}) exceed wins ($${totalWinDollar.toFixed(2)}) — tighten your risk management.`);
    else if (winRate < 50) lines.push(`Win rate at ${winRate.toFixed(0)}% — focus on entry quality over trade frequency.`);
    if (bestPattern) lines.push(`Strongest setup: ${bestPattern.name} across ${bestPattern.count} trades (${bestPattern.pnl >= 0 ? '+' : ''}$${bestPattern.pnl.toFixed(2)}).`);
    return lines;
  })();

  return (
    <div className="space-y-6">
      {/* Risk Status Badge */}
      {riskStatus && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${
          riskStatus.level === 'green' ? 'bg-green-900/20 border-green-800/30' :
          riskStatus.level === 'yellow' ? 'bg-yellow-900/20 border-yellow-800/30' :
          'bg-red-900/20 border-red-800/30'
        }`}>
          <span className={`font-bold text-sm ${
            riskStatus.level === 'green' ? 'text-green-400' :
            riskStatus.level === 'yellow' ? 'text-yellow-400' : 'text-red-400'
          }`}>{riskStatus.label}</span>
          {riskStatus.level === 'red' && (
            <span className="text-red-300/80 text-xs">Reduce size immediately</span>
          )}
          {riskStatus.level === 'yellow' && (
            <span className="text-yellow-300/80 text-xs">{riskStatus.violations} breach{riskStatus.violations !== 1 ? 'es' : ''}</span>
          )}
        </div>
      )}

      {/* Today's Focus */}
      {todaysFocus && (
        <div className="bg-dark-card border border-dark-border rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Today's Focus</p>
          <div className="space-y-1">
            {todaysFocus.map((item, i) => (
              <p key={i} className="text-white text-sm">→ {item}</p>
            ))}
          </div>
        </div>
      )}

      {/* Hero Card — P&L + all key stats in one */}
      <div className="bg-gradient-to-br from-[#0e1628] to-[#161622] border border-blue-900/40 rounded-2xl p-6 shadow-[0_0_50px_rgba(59,130,246,0.1)]">
        {/* P&L header */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-gray-500 text-xs uppercase tracking-widest">Monthly P&amp;L</p>
          <p className="text-gray-500 text-xs">{new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}</p>
        </div>
        <p
          className={`text-4xl font-bold tabular-nums leading-none mb-1 ${metrics.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
          style={{ filter: `drop-shadow(0 0 12px ${metrics.totalPnl >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'})` }}
        >
          <CountUp
            end={metrics.totalPnl}
            decimals={2}
            duration={1}
            preserveValue
            formattingFn={(val) => `${val < 0 ? '-' : ''}$${Math.abs(val).toFixed(2)}`}
          />
        </p>
        <p className="text-gray-500 text-sm mb-5">{metrics.wins}W · {metrics.losses}L</p>

        {/* Secondary stats row */}
        <div className="grid grid-cols-4 gap-3 mb-5 pb-4 border-b border-white/5">
          <div>
            <p className="text-gray-500 text-xs mb-1">Win Rate</p>
            <p className={`text-base font-bold tabular-nums ${metrics.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              <CountUp end={metrics.winRate} suffix="%" decimals={1} duration={1} preserveValue />
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">P. Factor</p>
            <p className={`text-base font-bold tabular-nums ${metrics.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
              <CountUp end={metrics.profitFactor} decimals={2} duration={1} preserveValue />
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">Expect.</p>
            <p className={`text-base font-bold tabular-nums ${metrics.expectancy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              <CountUp end={metrics.expectancy} suffix="%" decimals={1} duration={1} preserveValue />
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">Max DD</p>
            <p className="text-base font-bold text-red-400 tabular-nums">
              <CountUp end={maxDrawdown} prefix="-" suffix="%" decimals={1} duration={1} preserveValue />
            </p>
          </div>
        </div>

        {/* Period % gains */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Day', value: percentSummary.day },
            { label: 'Week', value: percentSummary.week },
            { label: 'Month', value: percentSummary.month },
            { label: 'Year', value: percentSummary.year },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-gray-500 text-xs mb-1">{label}</p>
              <p className={`text-base font-bold tabular-nums ${value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {value >= 0 ? '+' : ''}{value.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>

        {dailyGoalProgress && (
          <div className="mt-5 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-gray-500 text-xs uppercase tracking-widest">Daily Goal</p>
              <p className={`text-xs font-bold tabular-nums ${dailyGoalProgress.hit ? 'text-green-400' : 'text-gray-400'}`}>
                {dailyGoalProgress.dayPct >= 0 ? '+' : ''}{dailyGoalProgress.dayPct.toFixed(1)}% / +{dailyGoalProgress.goal}%
              </p>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-700 ${dailyGoalProgress.hit ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{
                  width: `${dailyGoalProgress.progress}%`,
                  boxShadow: dailyGoalProgress.hit ? '0 0 6px rgba(34,197,94,0.7)' : '0 0 6px rgba(59,130,246,0.6)'
                }}
              />
            </div>
            <p className={`text-xs mt-1 ${dailyGoalProgress.hit ? 'text-green-400' : 'text-gray-500'}`}>
              {dailyGoalProgress.hit
                ? '✓ Daily goal reached — protect your gains.'
                : `${dailyGoalProgress.remaining.toFixed(1)}% remaining to hit today's target`}
            </p>
          </div>
        )}

        {deposits.length === 0 && (
          <p className="text-yellow-500/70 text-xs mt-4">Add a deposit in <strong>Settings</strong> to see accurate % gains.</p>
        )}
      </div>

      {dashGoal && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-gray-400 text-sm">Account Goal</p>
            <p className="text-gray-400 text-sm">${dashGoal.balance.toFixed(2)} / ${dashGoal.goalAmt.toFixed(2)}</p>
          </div>
          <div className="w-full bg-dark-bg rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-700 ${dashGoal.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${dashGoal.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{dashGoal.progress.toFixed(1)}% complete</span>
            {dashGoal.progress >= 100
              ? <span className="text-green-400">Goal reached!</span>
              : <span>${dashGoal.remaining.toFixed(2)} to go</span>
            }
          </div>
        </div>
      )}

      {/* Equity Curve */}
      <EquityCurve trades={trades} deposits={deposits} />

      {/* AI Coach + Performance Identity */}
      {(aiCoachSummary || performanceIdentity) && (
        <div className="space-y-3">
          {aiCoachSummary && (
            <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-5">
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">Daily Coach</p>
              <p className="text-blue-100 text-sm leading-relaxed">{aiCoachSummary}</p>
            </div>
          )}
          {performanceIdentity && (
            <div className="bg-purple-900/20 border border-purple-800/30 rounded-lg p-4">
              <p className="text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">Performance Identity</p>
              <div className="space-y-1">
                {performanceIdentity.map((line, i) => (
                  <p key={i} className="text-purple-100 text-sm leading-relaxed">{line}</p>
                ))}
              </div>
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
              <div
                key={note.id}
                onClick={() => onNavigate?.('notebook')}
                className="bg-dark-bg border border-dark-border rounded-lg p-3 hover:border-gray-600 transition-colors cursor-pointer"
              >
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
      <RecentTrades
        trades={trades}
        maxRiskPercent={parseFloat(appSettings.maxRiskPercent) || 0}
        onAddTrade={() => setIsModalOpen(true)}
      />

      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white p-3 rounded-full shadow-lg transition-all hover:scale-110 opacity-60 hover:opacity-100 z-50"
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
