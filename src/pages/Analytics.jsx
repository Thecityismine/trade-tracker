import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, getDocs } from 'firebase/firestore';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { db } from '../config/firebase';

const COLORS = {
  positive: '#22c55e',
  negative: '#ef4444',
  accent: '#3b82f6',
  muted: '#9ca3af'
};

const TOOLTIP_THEME = {
  contentStyle: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px'
  },
  labelStyle: {
    color: '#f9fafb',
    fontWeight: 600
  },
  itemStyle: {
    color: '#e5e7eb'
  },
  cursor: {
    fill: 'rgba(59, 130, 246, 0.08)'
  }
};

const TIME_BUCKETS = [
  { key: 'overnight', label: 'Overnight', start: 0, end: 5 },
  { key: 'morning', label: 'Morning', start: 6, end: 11 },
  { key: 'afternoon', label: 'Afternoon', start: 12, end: 17 },
  { key: 'evening', label: 'Evening', start: 18, end: 23 }
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTradeDate = (trade) => trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);

const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const getWeekLabel = (startDate) => {
  const weekStart = new Date(startDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

function Analytics() {
  const [trades, setTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'deposits'), (snap) => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const tradesQuery = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));

    const unsubscribe = onSnapshot(tradesQuery, (snapshot) => {
      const tradesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setTrades(tradesData);
    });

    return () => unsubscribe();
  }, []);

  const completedTrades = useMemo(() => {
    return trades
      .map((trade) => {
        const tradeDate = getTradeDate(trade);
        return {
          ...trade,
          parsedTradeDate: tradeDate
        };
      })
      .filter((trade) => {
        const hasValidDate = !Number.isNaN(trade.parsedTradeDate.getTime());
        const isClosedTrade = trade.result === 'win' || trade.result === 'loss';
        return hasValidDate && isClosedTrade;
      });
  }, [trades]);

  const directionStats = useMemo(() => {
    const initial = {
      long: { direction: 'Long', wins: 0, losses: 0, totalPnl: 0, totalPnlPercent: 0 },
      short: { direction: 'Short', wins: 0, losses: 0, totalPnl: 0, totalPnlPercent: 0 }
    };

    completedTrades.forEach((trade) => {
      const key = trade.direction === 'short' ? 'short' : 'long';
      const target = initial[key];

      if (trade.result === 'win') {
        target.wins += 1;
      } else {
        target.losses += 1;
      }

      target.totalPnl += toNumber(trade.gainLoss);
      target.totalPnlPercent += toNumber(trade.pnlPercent);
    });

    return Object.values(initial).map((item) => {
      const tradesCount = item.wins + item.losses;
      return {
        ...item,
        tradesCount,
        winRate: tradesCount > 0 ? (item.wins / tradesCount) * 100 : 0,
        avgPnlPercent: tradesCount > 0 ? item.totalPnlPercent / tradesCount : 0
      };
    });
  }, [completedTrades]);

  const timeOfDayStats = useMemo(() => {
    const bucketMap = new Map(
      TIME_BUCKETS.map((bucket) => [
        bucket.key,
        {
          name: bucket.label,
          trades: 0,
          wins: 0,
          losses: 0,
          totalPnl: 0,
          totalPnlPercent: 0
        }
      ])
    );

    completedTrades.forEach((trade) => {
      const hour = trade.parsedTradeDate.getHours();
      const bucket = TIME_BUCKETS.find((item) => hour >= item.start && hour <= item.end);
      if (!bucket) {
        return;
      }

      const target = bucketMap.get(bucket.key);
      target.trades += 1;
      target.totalPnl += toNumber(trade.gainLoss);
      target.totalPnlPercent += toNumber(trade.pnlPercent);

      if (trade.result === 'win') {
        target.wins += 1;
      } else {
        target.losses += 1;
      }
    });

    return Array.from(bucketMap.values()).map((item) => ({
      ...item,
      winRate: item.trades > 0 ? (item.wins / item.trades) * 100 : 0,
      avgPnlPercent: item.trades > 0 ? item.totalPnlPercent / item.trades : 0
    }));
  }, [completedTrades]);

  const avgWinLossStats = useMemo(() => {
    const wins = completedTrades.filter((trade) => trade.result === 'win');
    const losses = completedTrades.filter((trade) => trade.result === 'loss');

    const avgWinUsd = wins.length > 0
      ? wins.reduce((sum, trade) => sum + toNumber(trade.gainLoss), 0) / wins.length
      : 0;

    const avgLossUsdAbs = losses.length > 0
      ? Math.abs(losses.reduce((sum, trade) => sum + toNumber(trade.gainLoss), 0) / losses.length)
      : 0;

    const avgWinPercent = wins.length > 0
      ? wins.reduce((sum, trade) => sum + toNumber(trade.pnlPercent), 0) / wins.length
      : 0;

    const avgLossPercentAbs = losses.length > 0
      ? Math.abs(losses.reduce((sum, trade) => sum + toNumber(trade.pnlPercent), 0) / losses.length)
      : 0;

    return {
      avgWinUsd,
      avgLossUsdAbs,
      avgWinPercent,
      avgLossPercentAbs,
      chartData: [
        {
          name: 'Avg Win',
          value: avgWinUsd,
          fill: COLORS.positive
        },
        {
          name: 'Avg Loss',
          value: -avgLossUsdAbs,
          fill: COLORS.negative
        }
      ]
    };
  }, [completedTrades]);

  const streakStats = useMemo(() => {
    const sortedTrades = [...completedTrades].sort((a, b) => a.parsedTradeDate - b.parsedTradeDate);

    let currentType = null;
    let currentCount = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    sortedTrades.forEach((trade) => {
      if (trade.result === currentType) {
        currentCount += 1;
      } else {
        currentType = trade.result;
        currentCount = 1;
      }

      if (trade.result === 'win') {
        maxWinStreak = Math.max(maxWinStreak, currentCount);
      } else {
        maxLossStreak = Math.max(maxLossStreak, currentCount);
      }
    });

    return {
      maxWinStreak,
      maxLossStreak,
      currentType,
      currentCount
    };
  }, [completedTrades]);

  const monthlyComparison = useMemo(() => {
    const monthMap = new Map();

    completedTrades.forEach((trade) => {
      const date = trade.parsedTradeDate;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          key,
          label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          totalPnl: 0,
          totalPnlPercent: 0,
          wins: 0,
          losses: 0,
          trades: 0
        });
      }

      const target = monthMap.get(key);
      target.totalPnl += toNumber(trade.gainLoss);
      target.totalPnlPercent += toNumber(trade.pnlPercent);
      target.trades += 1;

      if (trade.result === 'win') {
        target.wins += 1;
      } else {
        target.losses += 1;
      }
    });

    return Array.from(monthMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12)
      .map((month) => ({
        ...month,
        winRate: month.trades > 0 ? (month.wins / month.trades) * 100 : 0,
        avgPnlPercent: month.trades > 0 ? month.totalPnlPercent / month.trades : 0
      }));
  }, [completedTrades]);

  const weeklyPerformance = useMemo(() => {
    const weekMap = new Map();

    completedTrades.forEach((trade) => {
      const weekStart = getWeekStart(trade.parsedTradeDate);
      const key = weekStart.toISOString().split('T')[0];

      if (!weekMap.has(key)) {
        weekMap.set(key, {
          key,
          label: getWeekLabel(weekStart),
          startDate: weekStart,
          totalPnl: 0,
          totalPnlPercent: 0,
          wins: 0,
          losses: 0,
          trades: 0
        });
      }

      const target = weekMap.get(key);
      target.totalPnl += toNumber(trade.gainLoss);
      target.totalPnlPercent += toNumber(trade.pnlPercent);
      target.trades += 1;

      if (trade.result === 'win') {
        target.wins += 1;
      } else {
        target.losses += 1;
      }
    });

    return Array.from(weekMap.values()).sort((a, b) => a.startDate - b.startDate);
  }, [completedTrades]);

  const bestWorstWeeks = useMemo(() => {
    if (weeklyPerformance.length === 0) {
      return { bestWeek: null, worstWeek: null };
    }

    const sortedByPnl = [...weeklyPerformance].sort((a, b) => b.totalPnl - a.totalPnl);
    return {
      bestWeek: sortedByPnl[0],
      worstWeek: sortedByPnl[sortedByPnl.length - 1]
    };
  }, [weeklyPerformance]);

  const maxDrawdown = useMemo(() => {
    if (deposits.length === 0 || completedTrades.length === 0) return 0;
    const totalFunded = deposits.reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    const sorted = [...completedTrades].sort((a, b) => a.parsedTradeDate - b.parsedTradeDate);
    let peak = totalFunded;
    let balance = totalFunded;
    let maxDD = 0;
    for (const t of sorted) {
      balance += toNumber(t.gainLoss);
      if (balance > peak) peak = balance;
      if (peak > 0) maxDD = Math.max(maxDD, ((peak - balance) / peak) * 100);
    }
    return maxDD;
  }, [completedTrades, deposits]);

  const tradeFrequency = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recent = completedTrades.filter(t => t.parsedTradeDate >= cutoff);
    return recent.length > 0 ? +(recent.length / 30).toFixed(2) : 0;
  }, [completedTrades]);

  const directionInsight = useMemo(() => {
    const withTrades = directionStats.filter(d => d.tradesCount > 0);
    if (withTrades.length < 2) return null;
    const best = withTrades.reduce((a, b) => a.winRate >= b.winRate ? a : b);
    return `Your ${best.direction} trades have the highest win rate at ${best.winRate.toFixed(1)}%.`;
  }, [directionStats]);

  const timeInsight = useMemo(() => {
    const active = timeOfDayStats.filter(s => s.trades > 0);
    if (active.length === 0) return null;
    const best = active.reduce((a, b) => a.totalPnl >= b.totalPnl ? a : b);
    if (best.totalPnl <= 0) return `No profitable session yet — keep building your history.`;
    return `You perform best in the ${best.name.toLowerCase()} (+$${best.totalPnl.toFixed(2)} total P&L).`;
  }, [timeOfDayStats]);

  const avgWinLossInsight = useMemo(() => {
    const { avgWinUsd, avgLossUsdAbs } = avgWinLossStats;
    if (avgWinUsd === 0 && avgLossUsdAbs === 0) return null;
    if (avgLossUsdAbs === 0) return 'No losses recorded — solid consistency.';
    const ratio = avgWinUsd / avgLossUsdAbs;
    if (ratio >= 1.5) return `Strong R:R — your average win ($${avgWinUsd.toFixed(2)}) is ${ratio.toFixed(1)}x your average loss.`;
    if (ratio >= 1) return `Your wins ($${avgWinUsd.toFixed(2)}) edge out losses ($${avgLossUsdAbs.toFixed(2)}) — maintain or improve R:R.`;
    return `Your average loss ($${avgLossUsdAbs.toFixed(2)}) exceeds wins ($${avgWinUsd.toFixed(2)}) — focus on improving R:R.`;
  }, [avgWinLossStats]);

  const monthlyInsight = useMemo(() => {
    if (monthlyComparison.length === 0) return null;
    const best = [...monthlyComparison].reduce((a, b) => a.totalPnl >= b.totalPnl ? a : b);
    const totalPnl = monthlyComparison.reduce((sum, m) => sum + m.totalPnl, 0);
    const trend = totalPnl >= 0 ? 'Overall trend is positive.' : 'Focus on consistency to improve the trend.';
    return `Best month: ${best.label} (+$${best.totalPnl.toFixed(2)}). ${trend}`;
  }, [monthlyComparison]);

  const patternPerformance = useMemo(() => {
    const patternMap = new Map();
    completedTrades.forEach(trade => {
      if (!trade.chartPattern?.trim()) return;
      const key = trade.chartPattern.trim().toLowerCase();
      if (!patternMap.has(key)) {
        patternMap.set(key, { name: trade.chartPattern.trim(), wins: 0, losses: 0, totalPnl: 0 });
      }
      const p = patternMap.get(key);
      if (trade.result === 'win') p.wins++;
      else p.losses++;
      p.totalPnl += toNumber(trade.gainLoss);
    });
    return Array.from(patternMap.values())
      .map(p => ({ ...p, trades: p.wins + p.losses, winRate: (p.wins + p.losses) > 0 ? (p.wins / (p.wins + p.losses)) * 100 : 0 }))
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }, [completedTrades]);

  const behavioralPatterns = useMemo(() => {
    const insights = [];
    if (completedTrades.length < 5) return insights;

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayMap = {};
    completedTrades.forEach(t => {
      const d = t.parsedTradeDate.getDay();
      if (!dayMap[d]) dayMap[d] = { wins: 0, losses: 0, pnl: 0 };
      if (t.result === 'win') dayMap[d].wins++;
      else dayMap[d].losses++;
      dayMap[d].pnl += toNumber(t.gainLoss);
    });
    const days = Object.entries(dayMap)
      .map(([d, s]) => ({ day: +d, name: DAY_NAMES[+d], ...s, trades: s.wins + s.losses }))
      .filter(d => d.trades >= 2);

    if (days.length >= 2) {
      const best = days.reduce((a, b) => a.pnl >= b.pnl ? a : b);
      const worst = days.reduce((a, b) => a.pnl <= b.pnl ? a : b);
      if (best.pnl > 0) insights.push({ type: 'positive', text: `${best.name} is your best trading day (+$${best.pnl.toFixed(2)} total, ${best.wins}W / ${best.losses}L).` });
      if (worst.pnl < 0 && worst.day !== best.day) insights.push({ type: 'warning', text: `${worst.name} is your worst day ($${worst.pnl.toFixed(2)} total) — consider smaller size on ${worst.name}.` });
    }

    const sorted = [...completedTrades].sort((a, b) => a.parsedTradeDate - b.parsedTradeDate);
    let streak = 0;
    let checksAfter3 = 0;
    let lossesAfter3 = 0;
    sorted.forEach(t => {
      if (streak >= 3) { checksAfter3++; if (t.result === 'loss') lossesAfter3++; }
      streak = t.result === 'win' ? streak + 1 : 0;
    });
    if (checksAfter3 >= 3 && lossesAfter3 / checksAfter3 >= 0.6) {
      insights.push({ type: 'warning', text: `You tend to lose after 3+ consecutive wins (${Math.round(lossesAfter3 / checksAfter3 * 100)}% of the time) — watch for overconfidence.` });
    }

    return insights;
  }, [completedTrades]);

  const avgExecutionScore = useMemo(() => {
    const scored = completedTrades.filter(t => t.executionScore > 0);
    if (scored.length === 0) return null;
    return scored.reduce((sum, t) => sum + t.executionScore, 0) / scored.length;
  }, [completedTrades]);

  const totalClosedTrades = completedTrades.length;
  const totalWins = completedTrades.filter((trade) => trade.result === 'win').length;
  const overallWinRate = totalClosedTrades > 0 ? (totalWins / totalClosedTrades) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-1">Analytics</h2>
        <p className="text-gray-400">Deeper performance breakdown from your trade history.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <p className="text-xs text-gray-400">Closed Trades</p>
            <p className="text-2xl font-bold text-white mt-1">{totalClosedTrades}</p>
          </div>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <p className="text-xs text-gray-400">Overall Win Rate</p>
            <p className={`text-2xl font-bold mt-1 ${overallWinRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {overallWinRate.toFixed(2)}%
            </p>
          </div>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <p className="text-xs text-gray-400">Best Win Streak</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{streakStats.maxWinStreak}</p>
          </div>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <p className="text-xs text-gray-400">Worst Loss Streak</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{streakStats.maxLossStreak}</p>
          </div>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <p className="text-xs text-gray-400">Max Drawdown</p>
            <p className="text-2xl font-bold text-red-400 mt-1">-{maxDrawdown.toFixed(2)}%</p>
          </div>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <p className="text-xs text-gray-400">Trades / Day</p>
            <p className="text-2xl font-bold text-white mt-1">{tradeFrequency.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
          </div>
          {avgExecutionScore !== null && (
            <div className="col-span-2 sm:col-span-1 bg-dark-bg border border-dark-border rounded-lg p-4">
              <p className="text-xs text-gray-400">Avg Execution</p>
              <p className={`text-2xl font-bold mt-1 ${avgExecutionScore >= 7 ? 'text-green-400' : avgExecutionScore >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                {avgExecutionScore.toFixed(1)}/10
              </p>
            </div>
          )}
        </div>
      </div>

      {totalClosedTrades === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-lg p-8 text-center text-gray-400">
          Add closed trades to unlock analytics.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Win Rate by Direction</h3>
              <p className="text-gray-400 text-sm mb-4">Long vs short win-rate comparison.</p>

              <div className="w-full h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directionStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="direction" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(value) => `${value}%`} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={TOOLTIP_THEME.contentStyle}
                      labelStyle={TOOLTIP_THEME.labelStyle}
                      itemStyle={TOOLTIP_THEME.itemStyle}
                      cursor={TOOLTIP_THEME.cursor}
                      formatter={(value, name) => {
                        if (name === 'winRate') return [`${Number(value).toFixed(2)}%`, 'Win Rate'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="winRate" radius={[6, 6, 0, 0]}>
                      {directionStats.map((entry) => (
                        <Cell
                          key={entry.direction}
                          fill={entry.winRate >= 50 ? COLORS.positive : COLORS.negative}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                {directionStats.map((item) => (
                  <div key={item.direction} className="bg-dark-bg border border-dark-border rounded-lg p-3">
                    <p className="text-white font-medium">{item.direction}</p>
                    <p className="text-gray-400 text-sm">{item.wins}W / {item.losses}L</p>
                    <p className={`text-sm mt-1 ${item.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${item.totalPnl.toFixed(2)} total
                    </p>
                  </div>
                ))}
              </div>
              {directionInsight && (
                <p className="text-xs text-blue-400 mt-3 bg-blue-900/20 border border-blue-800/30 rounded-lg px-3 py-2">
                  {directionInsight}
                </p>
              )}
            </div>

            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Performance by Time of Day</h3>
              <p className="text-gray-400 text-sm mb-4">Total P&amp;L per trading session.</p>

              <div className="w-full h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeOfDayStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(value) => `$${value.toFixed(0)}`} />
                    <Tooltip
                      contentStyle={TOOLTIP_THEME.contentStyle}
                      labelStyle={TOOLTIP_THEME.labelStyle}
                      itemStyle={TOOLTIP_THEME.itemStyle}
                      cursor={TOOLTIP_THEME.cursor}
                      formatter={(value, name) => {
                        if (name === 'totalPnl') return [`$${Number(value).toFixed(2)}`, 'Total P&L'];
                        if (name === 'trades') return [value, 'Trades'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="totalPnl" radius={[6, 6, 0, 0]}>
                      {timeOfDayStats.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.totalPnl >= 0 ? COLORS.positive : COLORS.negative}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                {timeOfDayStats.map((item) => (
                  <div key={item.name} className="bg-dark-bg border border-dark-border rounded-lg p-3">
                    <p className="text-white text-sm font-medium">{item.name}</p>
                    <p className="text-gray-400 text-xs">{item.trades} trades</p>
                    <p className={`text-sm mt-1 ${item.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${item.totalPnl.toFixed(2)} total
                    </p>
                  </div>
                ))}
              </div>
              {timeInsight && (
                <p className="text-xs text-blue-400 mt-3 bg-blue-900/20 border border-blue-800/30 rounded-lg px-3 py-2">
                  {timeInsight}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Average Win Size vs Average Loss Size</h3>
              <p className="text-gray-400 text-sm mb-4">Average dollar size per winning vs losing trade.</p>

              <div className="w-full h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgWinLossStats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(value) => `$${Math.abs(value).toFixed(0)}`} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={TOOLTIP_THEME.contentStyle}
                      labelStyle={TOOLTIP_THEME.labelStyle}
                      itemStyle={TOOLTIP_THEME.itemStyle}
                      cursor={TOOLTIP_THEME.cursor}
                      formatter={(value) => [`$${Math.abs(Number(value)).toFixed(2)}`, 'Average Size']}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {avgWinLossStats.chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <p className="text-xs text-gray-400">Avg Win</p>
                  <p className="text-lg font-bold text-green-500">${avgWinLossStats.avgWinUsd.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">{avgWinLossStats.avgWinPercent.toFixed(2)}%</p>
                </div>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                  <p className="text-xs text-gray-400">Avg Loss</p>
                  <p className="text-lg font-bold text-red-500">-${avgWinLossStats.avgLossUsdAbs.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">-{avgWinLossStats.avgLossPercentAbs.toFixed(2)}%</p>
                </div>
              </div>
              {avgWinLossInsight && (
                <p className="text-xs text-blue-400 mt-3 bg-blue-900/20 border border-blue-800/30 rounded-lg px-3 py-2">
                  {avgWinLossInsight}
                </p>
              )}
            </div>

            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Consecutive Wins/Losses Streaks</h3>
              <p className="text-gray-400 text-sm mb-4">Current, best, and worst streak tracking.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <p className="text-xs text-gray-400">Best Win Streak</p>
                  <p className="text-3xl font-bold text-green-500 mt-1">{streakStats.maxWinStreak}</p>
                </div>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <p className="text-xs text-gray-400">Worst Loss Streak</p>
                  <p className="text-3xl font-bold text-red-500 mt-1">{streakStats.maxLossStreak}</p>
                </div>
                <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <p className="text-xs text-gray-400">Current Streak</p>
                  <p className={`text-3xl font-bold mt-1 ${streakStats.currentType === 'win' ? 'text-green-500' : 'text-red-500'}`}>
                    {streakStats.currentCount}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    {streakStats.currentType || 'none'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {patternPerformance.length > 0 && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Pattern Performance</h3>
              <p className="text-gray-400 text-sm mb-4">Win rate and P&amp;L grouped by chart pattern used.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-dark-border">
                      <th className="text-left py-2 pr-4 font-medium">Pattern</th>
                      <th className="text-center py-2 px-2 font-medium">Trades</th>
                      <th className="text-center py-2 px-2 font-medium">W / L</th>
                      <th className="text-right py-2 px-2 font-medium">Win Rate</th>
                      <th className="text-right py-2 pl-2 font-medium">Total P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patternPerformance.map(p => (
                      <tr key={p.name} className="border-t border-dark-border hover:bg-dark-bg transition-colors">
                        <td className="py-2 pr-4 text-white font-medium">{p.name}</td>
                        <td className="text-center py-2 px-2 text-gray-300">{p.trades}</td>
                        <td className="text-center py-2 px-2 text-gray-300">{p.wins}W / {p.losses}L</td>
                        <td className={`text-right py-2 px-2 font-medium ${p.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                          {p.winRate.toFixed(1)}%
                        </td>
                        <td className={`text-right py-2 pl-2 font-bold ${p.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {p.totalPnl >= 0 ? '+' : ''}${p.totalPnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {behavioralPatterns.length > 0 && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Behavioral Patterns</h3>
              <p className="text-gray-400 text-sm mb-4">Detected tendencies from your trading history.</p>
              <div className="space-y-2">
                {behavioralPatterns.map((insight, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-lg px-4 py-3 border ${
                      insight.type === 'positive'
                        ? 'bg-green-900/20 border-green-800/30 text-green-300'
                        : 'bg-yellow-900/20 border-yellow-800/30 text-yellow-300'
                    }`}
                  >
                    {insight.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Monthly Comparison</h3>
              <p className="text-gray-400 text-sm mb-4">Monthly total P&amp;L with win-rate trend (up to 12 months).</p>

              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="label" stroke="#9ca3af" />
                    <YAxis yAxisId="left" stroke="#9ca3af" tickFormatter={(value) => `$${value.toFixed(0)}`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" tickFormatter={(value) => `${value.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={TOOLTIP_THEME.contentStyle}
                      labelStyle={TOOLTIP_THEME.labelStyle}
                      itemStyle={TOOLTIP_THEME.itemStyle}
                      cursor={TOOLTIP_THEME.cursor}
                      formatter={(value, name) => {
                        if (name === 'totalPnl') return [`$${Number(value).toFixed(2)}`, 'Total P&L'];
                        if (name === 'winRate') return [`${Number(value).toFixed(2)}%`, 'Win Rate'];
                        return [value, name];
                      }}
                    />
                    <Bar yAxisId="left" dataKey="totalPnl" radius={[6, 6, 0, 0]}>
                      {monthlyComparison.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.totalPnl >= 0 ? COLORS.positive : COLORS.negative}
                        />
                      ))}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="winRate" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {monthlyInsight && (
                <p className="text-xs text-blue-400 mt-4 bg-blue-900/20 border border-blue-800/30 rounded-lg px-3 py-2">
                  {monthlyInsight}
                </p>
              )}
            </div>

            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-1">Best/Worst Performing Weeks</h3>
              <p className="text-gray-400 text-sm mb-4">Weekly extremes by total P&amp;L.</p>

              {bestWorstWeeks.bestWeek ? (
                <div className="space-y-4">
                  <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                    <p className="text-xs text-gray-400">Best Week</p>
                    <p className="text-white font-medium mt-1">{bestWorstWeeks.bestWeek.label}</p>
                    <p className="text-green-500 text-xl font-bold mt-1">${bestWorstWeeks.bestWeek.totalPnl.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">{bestWorstWeeks.bestWeek.trades} trades</p>
                  </div>

                  <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                    <p className="text-xs text-gray-400">Worst Week</p>
                    <p className="text-white font-medium mt-1">{bestWorstWeeks.worstWeek.label}</p>
                    <p className="text-red-500 text-xl font-bold mt-1">${bestWorstWeeks.worstWeek.totalPnl.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">{bestWorstWeeks.worstWeek.trades} trades</p>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">Not enough data yet.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Analytics;
