import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ChevronDown, ChevronUp } from 'lucide-react';

function getWeeklyVerdict(week) {
  const { winRate, pnl, profitFactor, wins, losses } = week;
  if (wins + losses === 0) return null;

  if (winRate > 60 && pnl < 0) {
    return { icon: '⚠', text: 'High win rate but still losing — losses are too large', type: 'warning' };
  }
  if (pnl < 0 && profitFactor < 1) {
    return { icon: '✗', text: 'Losses outweigh wins — cut losers faster or reduce size', type: 'bad' };
  }
  if (pnl < 0) {
    return { icon: '✗', text: 'Losing week — review position sizing and stop placement', type: 'bad' };
  }
  if (pnl > 0 && winRate < 45) {
    return { icon: '!', text: 'Profitable despite low win rate — winners are carrying you', type: 'neutral' };
  }
  if (pnl > 0 && profitFactor >= 2) {
    return { icon: '✓', text: 'Strong week — great edge, keep the discipline', type: 'good' };
  }
  return { icon: '✓', text: 'Profitable week — stay consistent', type: 'good' };
}

function getContradiction(week) {
  const { winRate, pnl, profitFactor } = week;
  if (winRate >= 65 && pnl < 0) {
    return `${winRate.toFixed(0)}% win rate but negative P&L — your losses are too large vs wins`;
  }
  if (profitFactor >= 2 && pnl < 0) {
    return `Profit factor ${profitFactor.toFixed(1)} is strong but you're losing — check fees or sizing`;
  }
  if (winRate < 35 && pnl > 0) {
    return `Only ${winRate.toFixed(0)}% win rate but profitable — your winners are doing the heavy lifting`;
  }
  return null;
}

function getStreakNote(trades) {
  const sorted = [...trades].sort((a, b) => {
    const da = a.tradeDate?.toDate?.() || new Date(a.tradeDate);
    const db_ = b.tradeDate?.toDate?.() || new Date(b.tradeDate);
    return da - db_;
  });
  let maxStreak = 0;
  let cur = 0;
  sorted.forEach((t) => {
    if (t.result === 'loss') { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  });
  if (maxStreak >= 3) return `${maxStreak} consecutive losses this week — check if you chased entries`;
  return null;
}

function getNextWeekFocus(week) {
  const { winRate, pnl, profitFactor, wins, losses } = week;
  const total = wins + losses;
  const focuses = [];
  if (winRate > 60 && pnl < 0) focuses.push('Reduce loss size — your wins are being wiped by single losses');
  if (profitFactor < 1.2 && pnl < 0) focuses.push('Cut losers at predefined stops — no moving stop losses');
  if (total > 12) focuses.push(`${total} trades this week — consider fewer, higher quality setups`);
  if (pnl < 0 && winRate < 40) focuses.push('Tighten entry criteria — only take A+ setups');
  if (focuses.length === 0 && pnl > 0) focuses.push('Keep doing what worked — consistency is the goal');
  if (focuses.length === 0) focuses.push('Review every losing trade before the next session');
  return focuses.slice(0, 3);
}

function groupByDay(trades) {
  const map = {};
  trades.forEach((trade) => {
    const d = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!map[key]) map[key] = { label: key, date: d, trades: [], pnl: 0 };
    map[key].trades.push(trade);
    map[key].pnl += (trade.gainLoss || 0) - (trade.fee || 0);
  });
  return Object.values(map).sort((a, b) => b.date - a.date);
}

function verdictClasses(type) {
  if (type === 'good') return 'bg-green-500/10 border border-green-500/15 text-green-400';
  if (type === 'bad') return 'bg-red-500/10 border border-red-500/15 text-red-400';
  if (type === 'warning') return 'bg-yellow-500/10 border border-yellow-500/15 text-yellow-400';
  return 'bg-blue-500/10 border border-blue-500/15 text-blue-400';
}

function WeeklyTracker() {
  const [trades, setTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [expandedWeek, setExpandedWeek] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setTrades(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'deposits'), (snap) => {
      setDeposits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    calculateWeeklyStats(trades, deposits);
  }, [trades, deposits]);

  const getWeekRange = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday,
      end: sunday,
      label: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  };

  const getBalanceAtDate = (targetDate, tradesData, depositsData) => {
    const funded = depositsData
      .filter((d) => {
        const date = d.date?.toDate?.() || new Date(d.date);
        return date <= targetDate;
      })
      .reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    const pnlBefore = tradesData
      .filter((t) => {
        const date = t.tradeDate?.toDate?.() || new Date(t.tradeDate);
        return !Number.isNaN(date.getTime()) && date < targetDate;
      })
      .reduce((sum, t) => sum + (Number(t.gainLoss) || 0) - (Number(t.fee) || 0), 0);
    return funded + pnlBefore;
  };

  const calculateWeeklyStats = (tradesData, depositsData) => {
    const weekMap = new Map();
    const totalFunded = depositsData.reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);
    const firstDepositDate = depositsData
      .filter((d) => d.type === 'deposit')
      .map((d) => d.date?.toDate?.() || new Date(d.date))
      .reduce((earliest, d) => (d < earliest ? d : earliest), new Date(9999, 0));

    tradesData.forEach((trade) => {
      const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      const weekRange = getWeekRange(tradeDate);
      const weekKey = weekRange.label;

      if (!weekMap.has(weekKey)) {
        const balanceAtWeekStart = getBalanceAtDate(weekRange.start, tradesData, depositsData);
        const denominator = balanceAtWeekStart > 0 ? balanceAtWeekStart : totalFunded;
        weekMap.set(weekKey, {
          weekLabel: weekKey,
          startDate: weekRange.start,
          endDate: weekRange.end,
          trades: [],
          wins: 0,
          losses: 0,
          totalWinPercent: 0,
          totalLossPercentAbs: 0,
          fees: 0,
          pnl: 0,
          denominator,
        });
      }

      const week = weekMap.get(weekKey);
      week.trades.push(trade);
      if (trade.result === 'win') {
        week.wins++;
        week.totalWinPercent += Math.max(0, trade.pnlPercent || 0);
      } else if (trade.result === 'loss') {
        week.losses++;
        week.totalLossPercentAbs += Math.abs(Math.min(0, trade.pnlPercent || 0));
      }
      week.fees += trade.fee || 0;
      week.pnl += (trade.gainLoss || 0) - (trade.fee || 0);
    });

    const weeks = Array.from(weekMap.values()).map((week) => {
      const totalTrades = week.wins + week.losses;
      const winRate = totalTrades > 0 ? (week.wins / totalTrades) * 100 : 0;
      const avgWin = week.wins > 0 ? week.totalWinPercent / week.wins : 0;
      const avgLoss = week.losses > 0 ? -(week.totalLossPercentAbs / week.losses) : 0;
      const expectancy = totalTrades > 0
        ? ((winRate / 100) * avgWin) + ((1 - winRate / 100) * avgLoss)
        : 0;
      const profitFactor = week.totalLossPercentAbs > 0
        ? week.totalWinPercent / week.totalLossPercentAbs
        : 0;
      const hasFunding = firstDepositDate.getFullYear() < 9999 && week.startDate >= firstDepositDate;
      const pnlPercent = (hasFunding && totalTrades > 0 && week.denominator > 0)
        ? (week.pnl / week.denominator) * 100
        : null;
      return { ...week, winRate, avgWin, avgLoss, expectancy, profitFactor, pnlPercent };
    });

    weeks.sort((a, b) => b.startDate - a.startDate);
    setWeeklyData(weeks);
  };

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-dark-border">
          <h2 className="text-2xl font-bold text-white">Weekly Tracker</h2>
          <p className="text-gray-400 text-sm mt-1">Performance breakdown by week</p>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-bg">
              <tr className="text-gray-400 text-sm">
                <th className="text-left py-3 px-4 font-medium">Week</th>
                <th className="text-center py-3 px-2 font-medium">Wins</th>
                <th className="text-center py-3 px-2 font-medium">Losses</th>
                <th className="text-right py-3 px-3 font-medium">Weekly Gain</th>
                <th className="text-right py-3 px-3 font-medium">Fees</th>
                <th className="text-right py-3 px-3 font-medium">Weekly P&L%</th>
                <th className="text-right py-3 px-3 font-medium">Win Rate</th>
                <th className="text-right py-3 px-3 font-medium">Avg Win %</th>
                <th className="text-right py-3 px-3 font-medium">Avg Loss %</th>
                <th className="text-right py-3 px-3 font-medium">Expectancy %</th>
                <th className="text-right py-3 px-3 font-medium">Profit Factor</th>
                <th className="text-center py-3 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((week, idx) => {
                const verdict = getWeeklyVerdict(week);
                return (
                  <>
                    <tr
                      key={idx}
                      className={`border-t border-dark-border cursor-pointer transition-colors ${
                        week.pnl < 0 ? 'hover:bg-red-500/5' : 'hover:bg-dark-bg'
                      }`}
                      onClick={() => setExpandedWeek(expandedWeek === idx ? null : idx)}
                    >
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{week.weekLabel}</div>
                        {verdict && (
                          <div className={`text-xs mt-0.5 ${
                            verdict.type === 'good' ? 'text-green-500/70' :
                            verdict.type === 'bad' ? 'text-red-500/70' :
                            verdict.type === 'warning' ? 'text-yellow-500/70' : 'text-blue-500/70'
                          }`}>
                            {verdict.icon} {verdict.text}
                          </div>
                        )}
                      </td>
                      <td className="text-center py-3 px-2 text-white font-medium">{week.wins}</td>
                      <td className="text-center py-3 px-2 text-white font-medium">{week.losses}</td>
                      <td className={`text-right py-3 px-3 font-semibold ${week.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {week.pnl >= 0 ? '+$' : '-$'}{Math.abs(week.pnl).toFixed(2)}
                      </td>
                      <td className="text-right py-3 px-3 text-gray-300">${week.fees.toFixed(2)}</td>
                      <td className={`text-right py-3 px-3 font-bold ${week.pnlPercent === null ? 'text-gray-500' : week.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {week.pnlPercent === null ? '--' : `${week.pnlPercent.toFixed(2)}%`}
                      </td>
                      <td className="text-right py-3 px-3 text-white">{week.winRate.toFixed(2)}%</td>
                      <td className="text-right py-3 px-3 text-white">{week.avgWin.toFixed(2)}%</td>
                      <td className="text-right py-3 px-3 text-white">{week.avgLoss.toFixed(2)}%</td>
                      <td className="text-right py-3 px-3 text-white">{week.expectancy.toFixed(2)}%</td>
                      <td className="text-right py-3 px-3 text-white">{week.profitFactor.toFixed(2)}</td>
                      <td className="text-center py-3 px-2">
                        {expandedWeek === idx
                          ? <ChevronUp size={18} className="text-gray-400" />
                          : <ChevronDown size={18} className="text-gray-400" />}
                      </td>
                    </tr>
                    {expandedWeek === idx && (
                      <tr className="bg-dark-bg">
                        <td colSpan="12" className="p-4">
                          <div className="space-y-4">
                            {groupByDay(week.trades).map((day) => (
                              <div key={day.label}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-gray-400 text-sm font-semibold">{day.label}</span>
                                  <span className={`text-sm font-semibold ${day.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    Day total: {day.pnl >= 0 ? '+$' : '-$'}{Math.abs(day.pnl).toFixed(2)}
                                  </span>
                                </div>
                                {day.trades.map((trade) => (
                                  <div key={trade.id} className="flex items-center justify-between bg-dark-card border border-dark-border rounded px-3 py-2 mb-1">
                                    <div className="flex items-center gap-3">
                                      <span className={`w-2.5 h-2.5 rounded-full ${trade.direction === 'long' ? 'bg-green-500' : 'bg-red-500'}`} />
                                      <span className="text-white text-sm">{trade.ticker || 'BTC'}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className={`text-sm font-medium ${trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {trade.pnlPercent?.toFixed(2)}%
                                      </span>
                                      <span className={`text-sm font-semibold ${trade.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {trade.gainLoss >= 0 ? '+$' : '-$'}{Math.abs(trade.gainLoss || 0).toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden p-4 space-y-4">
          {weeklyData.map((week, idx) => {
            const verdict = getWeeklyVerdict(week);
            const contradiction = getContradiction(week);
            const streakNote = getStreakNote(week.trades);
            const nextFocus = getNextWeekFocus(week);
            const dayGroups = groupByDay(week.trades);
            const totalTrades = week.wins + week.losses;
            const absGain = Math.abs(week.pnl).toFixed(2);
            const gainPrefix = week.pnl >= 0 ? '+$' : '-$';

            return (
              <div
                key={idx}
                className={`rounded-lg p-4 border ${
                  week.pnl < 0 ? 'bg-red-500/5 border-red-500/15' : 'bg-dark-bg border-dark-border'
                }`}
              >
                {/* Header row: date range + W/L */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">{week.weekLabel}</span>
                  <span className="text-gray-500 text-xs font-medium">
                    {week.wins}W · {week.losses}L
                  </span>
                </div>

                {/* P&L headline */}
                <div className={`text-3xl font-bold mb-3 ${week.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {gainPrefix}{absGain}
                </div>

                {/* Verdict banner */}
                {verdict && (
                  <div className={`rounded-lg px-3 py-2 mb-3 text-sm flex items-start gap-2 ${verdictClasses(verdict.type)}`}>
                    <span className="font-bold flex-shrink-0">{verdict.icon}</span>
                    <span>{verdict.text}</span>
                  </div>
                )}

                {/* Core stats */}
                <div className="grid grid-cols-3 gap-x-2 gap-y-3 mb-3">
                  <div>
                    <div className="text-gray-500 text-xs">Win Rate</div>
                    <div className="text-white font-semibold text-sm">{week.winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">P&L%</div>
                    <div className={`font-bold text-sm ${
                      week.pnlPercent === null ? 'text-gray-500' :
                      week.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {week.pnlPercent === null ? '--' : `${week.pnlPercent.toFixed(1)}%`}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Prof. Factor</div>
                    <div className={`font-semibold text-sm ${
                      week.profitFactor >= 1.5 ? 'text-green-400' :
                      week.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {week.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Expectancy</div>
                    <div className={`font-semibold text-sm ${week.expectancy >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {week.expectancy.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Avg Win</div>
                    <div className="text-green-400 font-semibold text-sm">{week.avgWin.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Avg Loss</div>
                    <div className="text-red-400 font-semibold text-sm">{week.avgLoss.toFixed(1)}%</div>
                  </div>
                </div>

                {/* Contradiction callout */}
                {contradiction && (
                  <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/15 rounded-lg px-3 py-2 mb-3">
                    ⚠ {contradiction}
                  </div>
                )}

                {/* Streak note */}
                {streakNote && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/15 rounded-lg px-3 py-2 mb-3">
                    • {streakNote}
                  </div>
                )}

                {/* Next week focus */}
                <div className="mb-3">
                  <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Next Week Focus</div>
                  <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2 space-y-1">
                    {nextFocus.map((f, i) => (
                      <div key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                        <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={() => setExpandedWeek(expandedWeek === idx ? null : idx)}
                  className="w-full text-gray-500 text-xs flex items-center justify-center gap-1.5 hover:text-gray-400 transition-colors py-1"
                >
                  {expandedWeek === idx
                    ? <>Hide trades <ChevronUp size={13} /></>
                    : <>View {totalTrades} trade{totalTrades !== 1 ? 's' : ''} <ChevronDown size={13} /></>}
                </button>

                {/* Expanded: grouped by day */}
                {expandedWeek === idx && (
                  <div className="mt-3 pt-3 border-t border-dark-border space-y-4">
                    {dayGroups.map((day) => (
                      <div key={day.label}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">{day.label}</span>
                          <span className={`text-xs font-semibold ${day.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {day.pnl >= 0 ? '+$' : '-$'}{Math.abs(day.pnl).toFixed(2)}
                            <span className="ml-1 opacity-70">{day.pnl >= 0 ? '✓' : '✗'}</span>
                          </span>
                        </div>
                        {day.trades.map((trade) => (
                          <div key={trade.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                trade.direction === 'long' ? 'bg-green-500' : 'bg-red-500'
                              }`} />
                              <span className="text-gray-500 text-xs">{trade.ticker || 'BTC'}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-medium ${trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {trade.pnlPercent?.toFixed(2)}%
                              </span>
                              <span className={`text-xs font-semibold min-w-[60px] text-right ${
                                trade.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {trade.gainLoss >= 0 ? '+$' : '-$'}{Math.abs(trade.gainLoss || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {weeklyData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No trades yet. Start adding trades to see weekly statistics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WeeklyTracker;
