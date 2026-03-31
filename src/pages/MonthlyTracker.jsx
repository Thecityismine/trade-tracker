import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ChevronDown, ChevronUp } from 'lucide-react';

function getMonthlyVerdict(month) {
  const { totalPnl, winRate, profitFactor, grade, totalTrades } = month;
  if (totalTrades === 0) return null;

  if (grade === 'A') {
    return { label: 'EXCELLENT MONTH', text: 'Strategy firing on all cylinders — document what worked', type: 'good' };
  }
  if (grade === 'B') {
    return { label: 'STRONG MONTH', text: 'Profitable with solid metrics — keep refining execution', type: 'good' };
  }
  if (winRate > 60 && totalPnl < 0) {
    return { label: 'RISK MANAGEMENT FAILURE', text: 'High win rate still losing — individual losses are too large', type: 'bad' };
  }
  if (profitFactor >= 2 && totalPnl < 0) {
    return { label: 'EXECUTION PROBLEM', text: 'Strong edge but losing — fees or sizing are killing results', type: 'warning' };
  }
  if (totalPnl < 0 && winRate < 40) {
    return { label: 'LOSING MONTH', text: 'Win rate too low — tighten entry criteria, only A+ setups', type: 'bad' };
  }
  if (totalPnl < 0) {
    return { label: 'LOSING MONTH', text: 'Focus on risk control and sizing before adding frequency', type: 'bad' };
  }
  if (grade === 'C') {
    return { label: 'AVERAGE MONTH', text: 'Profitable but room to improve — push execution quality', type: 'neutral' };
  }
  return { label: 'PROFITABLE MONTH', text: 'Keep the discipline — consistency compounds', type: 'neutral' };
}

function getMonthlyContradiction(month) {
  const { winRate, totalPnl, profitFactor } = month;
  if (winRate >= 60 && totalPnl < 0) {
    return `${winRate.toFixed(0)}% win rate but negative P&L — loss sizes are too large vs wins`;
  }
  if (profitFactor >= 2.5 && totalPnl < 0) {
    return `Profit factor ${profitFactor.toFixed(1)} is strong but you're still losing — review trade sizing`;
  }
  if (winRate < 38 && totalPnl > 0) {
    return `Only ${winRate.toFixed(0)}% wins but profitable — winners are covering all losses`;
  }
  return null;
}

function getTopMistake(trades) {
  const counts = {};
  trades.forEach((t) => {
    (t.mistakeTags || []).forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  if (!Object.keys(counts).length) return null;
  const [topTag, topCount] = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
  const labels = {
    'over-risk': 'Over-risking positions',
    fomo: 'FOMO entries',
    'no-stop': 'Trading without stop losses',
    revenge: 'Revenge trading',
  };
  return { tag: topTag, count: topCount, label: labels[topTag] || topTag };
}

function getNextMonthFocus(month, topMistake) {
  const { winRate, totalPnl, totalTrades } = month;
  const focuses = [];
  if (topMistake) {
    const fixMap = {
      'over-risk': 'Hard cap on position size — protect the account before growing it',
      fomo: 'Only enter on your defined setup — no chasing moves',
      'no-stop': 'Stop loss set before every entry, no exceptions',
      revenge: 'One loss ends the session — no revenge trades ever',
    };
    focuses.push(fixMap[topMistake.tag] || `Fix: ${topMistake.label}`);
  }
  if (winRate > 60 && totalPnl < 0) focuses.push('Hard cap on max loss per trade — wins cannot cover oversized losses');
  if (totalPnl < 0 && winRate < 40) focuses.push('Tighten entry criteria — only trade your A+ setup');
  if (totalTrades > 60) focuses.push(`${totalTrades} trades is high — aim for fewer, higher quality setups`);
  if (focuses.length === 0 && totalPnl > 0) focuses.push('Maintain the process — consistency is the edge');
  if (focuses.length === 0) focuses.push('Define one thing to improve this month and focus on it');
  return focuses.slice(0, 3);
}

function verdictClasses(type) {
  if (type === 'good') return 'bg-green-500/10 border border-green-500/15';
  if (type === 'bad') return 'bg-red-500/10 border border-red-500/15';
  if (type === 'warning') return 'bg-yellow-500/10 border border-yellow-500/15';
  return 'bg-blue-500/10 border border-blue-500/15';
}
function verdictTextColor(type) {
  if (type === 'good') return 'text-green-400';
  if (type === 'bad') return 'text-red-400';
  if (type === 'warning') return 'text-yellow-400';
  return 'text-blue-400';
}

function MonthlyTracker() {
  const [trades, setTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [advancedOpen, setAdvancedOpen] = useState({});

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
    calculateMonthlyStats(trades, deposits);
  }, [trades, deposits]);

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

  const getTotalFunded = (depositsData) =>
    depositsData.reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);

  const downgradeGrade = (grade) => {
    if (grade === 'A') return 'B';
    if (grade === 'B') return 'C';
    if (grade === 'C') return 'D';
    return grade;
  };

  const getGradeExplanation = (grade, monthlyPnlPercent, profitFactor, expectancyPercent) => {
    const parts = [];
    if (monthlyPnlPercent !== null) {
      if (monthlyPnlPercent >= 20) parts.push(`+${monthlyPnlPercent.toFixed(1)}% gain (excellent)`);
      else if (monthlyPnlPercent >= 10) parts.push(`+${monthlyPnlPercent.toFixed(1)}% gain (strong)`);
      else if (monthlyPnlPercent >= 5) parts.push(`+${monthlyPnlPercent.toFixed(1)}% gain (good)`);
      else if (monthlyPnlPercent >= 0) parts.push(`+${monthlyPnlPercent.toFixed(1)}% gain (modest)`);
      else parts.push(`${monthlyPnlPercent.toFixed(1)}% (losing month)`);
    }
    if (profitFactor >= 2.5) parts.push(`PF ${profitFactor.toFixed(1)} (excellent)`);
    else if (profitFactor >= 2) parts.push(`PF ${profitFactor.toFixed(1)} (strong)`);
    else if (profitFactor >= 1.5) parts.push(`PF ${profitFactor.toFixed(1)} (good)`);
    else if (profitFactor >= 1) parts.push(`PF ${profitFactor.toFixed(1)} (marginal)`);
    else if (profitFactor > 0) parts.push(`PF ${profitFactor.toFixed(1)} (poor)`);
    if (expectancyPercent >= 8) parts.push(`E ${expectancyPercent.toFixed(1)}% (high)`);
    else if (expectancyPercent >= 3) parts.push(`E ${expectancyPercent.toFixed(1)}% (positive)`);
    else if (expectancyPercent >= 0) parts.push(`E ${expectancyPercent.toFixed(1)}% (low)`);
    else parts.push(`E ${expectancyPercent.toFixed(1)}% (negative)`);
    return `Grade ${grade}: ${parts.join(' · ')}`;
  };

  const getGrade = (monthlyPnlPercent, profitFactor, expectancyPercent, totalPnl) => {
    let score = 0;
    if (monthlyPnlPercent >= 20) score += 40;
    else if (monthlyPnlPercent >= 10) score += 35;
    else if (monthlyPnlPercent >= 5) score += 25;
    else if (monthlyPnlPercent >= 2) score += 15;
    else if (monthlyPnlPercent >= 0) score += 8;

    if (profitFactor >= 2.5) score += 30;
    else if (profitFactor >= 2) score += 26;
    else if (profitFactor >= 1.5) score += 22;
    else if (profitFactor >= 1.2) score += 16;
    else if (profitFactor >= 1) score += 10;
    else if (profitFactor >= 0.8) score += 5;

    if (expectancyPercent >= 12) score += 30;
    else if (expectancyPercent >= 8) score += 24;
    else if (expectancyPercent >= 5) score += 18;
    else if (expectancyPercent >= 3) score += 14;
    else if (expectancyPercent >= 0) score += 8;
    else if (expectancyPercent > -5) score += 4;

    let grade = 'F';
    if (score >= 85) grade = 'A';
    else if (score >= 65) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 35) grade = 'D';
    if (totalPnl < 0) grade = downgradeGrade(grade);

    const colorMap = { A: 'bg-green-600', B: 'bg-blue-600', C: 'bg-yellow-600', D: 'bg-orange-600', F: 'bg-red-600' };
    return { grade, color: colorMap[grade] };
  };

  const calculateMonthlyStats = (tradesData, depositsData) => {
    const monthMap = new Map();
    const totalFunded = getTotalFunded(depositsData);
    const firstDepositDate = depositsData
      .filter((d) => d.type === 'deposit')
      .map((d) => d.date?.toDate?.() || new Date(d.date))
      .reduce((earliest, d) => (d < earliest ? d : earliest), new Date(9999, 0));

    tradesData.forEach((trade) => {
      const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      const monthKey = `${tradeDate.toLocaleDateString('en-US', { month: 'long' })} ${tradeDate.getFullYear()}`;
      const monthYear = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        const monthStart = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), 1);
        const balanceAtStart = getBalanceAtDate(monthStart, tradesData, depositsData);
        const denominator = balanceAtStart > 0 ? balanceAtStart : totalFunded;
        monthMap.set(monthKey, {
          monthLabel: monthKey, monthYear, monthStart,
          trades: [], wins: 0, losses: 0,
          totalWinPercent: 0, totalLossPercentAbs: 0,
          totalPnl: 0, totalFees: 0, denominator,
        });
      }

      const month = monthMap.get(monthKey);
      month.trades.push(trade);
      if (trade.result === 'win') {
        month.wins++;
        month.totalWinPercent += Math.max(0, trade.pnlPercent || 0);
      } else if (trade.result === 'loss') {
        month.losses++;
        month.totalLossPercentAbs += Math.abs(Math.min(0, trade.pnlPercent || 0));
      }
      month.totalPnl += (trade.gainLoss || 0) - (trade.fee || 0);
      month.totalFees += trade.fee || 0;
    });

    const months = Array.from(monthMap.values()).map((month) => {
      const totalTrades = month.wins + month.losses;
      const winRate = totalTrades > 0 ? (month.wins / totalTrades) * 100 : 0;
      const avgWin = month.wins > 0 ? month.totalWinPercent / month.wins : 0;
      const avgLoss = month.losses > 0 ? -(month.totalLossPercentAbs / month.losses) : 0;
      const expectancyPercent = totalTrades > 0
        ? ((winRate / 100) * avgWin) + ((1 - winRate / 100) * avgLoss)
        : 0;
      const profitFactor = month.totalLossPercentAbs > 0
        ? month.totalWinPercent / month.totalLossPercentAbs
        : 0;
      const hasFunding = firstDepositDate.getFullYear() < 9999 && month.monthStart >= firstDepositDate;
      const monthlyPnlPercent = (hasFunding && totalTrades > 0 && month.denominator > 0)
        ? (month.totalPnl / month.denominator) * 100
        : null;
      const gradeInfo = getGrade(monthlyPnlPercent ?? 0, profitFactor, expectancyPercent, month.totalPnl);
      const gradeExplanation = getGradeExplanation(gradeInfo.grade, monthlyPnlPercent, profitFactor, expectancyPercent);
      return { ...month, totalTrades, winRate, avgWin, avgLoss, expectancy: expectancyPercent, profitFactor, monthlyPnlPercent, gradeExplanation, ...gradeInfo };
    });

    months.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    setMonthlyData(months);
  };

  const toggleAdvanced = (idx) => {
    setAdvancedOpen((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-dark-border">
          <h2 className="text-2xl font-bold text-white">Monthly Tracker</h2>
          <p className="text-gray-400 text-sm mt-1">Performance breakdown by month with grades</p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-bg">
              <tr className="text-gray-400 text-sm">
                <th className="text-left py-3 px-4 font-medium">Month</th>
                <th className="text-center py-3 px-2 font-medium">Trades</th>
                <th className="text-center py-3 px-2 font-medium">Wins</th>
                <th className="text-center py-3 px-2 font-medium">Losses</th>
                <th className="text-center py-3 px-2 font-medium">Grade</th>
                <th className="text-right py-3 px-3 font-medium">Total Gain</th>
                <th className="text-right py-3 px-3 font-medium">Fees</th>
                <th className="text-right py-3 px-3 font-medium">Monthly P&L%</th>
                <th className="text-right py-3 px-3 font-medium">Win Rate</th>
                <th className="text-right py-3 px-3 font-medium">Avg Win %</th>
                <th className="text-right py-3 px-3 font-medium">Avg Loss %</th>
                <th className="text-right py-3 px-3 font-medium">Expectancy %</th>
                <th className="text-right py-3 px-3 font-medium">Profit Factor</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((month, idx) => {
                const verdict = getMonthlyVerdict(month);
                const contradiction = getMonthlyContradiction(month);
                return (
                  <tr
                    key={idx}
                    className={`border-t border-dark-border hover:bg-dark-bg transition-colors ${
                      month.totalPnl < 0 ? 'bg-red-500/3' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{month.monthLabel}</div>
                      {verdict && (
                        <div className={`text-xs mt-0.5 ${verdictTextColor(verdict.type)}`}>
                          {verdict.label}
                        </div>
                      )}
                      {contradiction && (
                        <div className="text-xs text-orange-400/80 mt-0.5">⚠ {contradiction}</div>
                      )}
                    </td>
                    <td className="text-center py-3 px-2 text-white">{month.totalTrades}</td>
                    <td className="text-center py-3 px-2 text-white font-medium">{month.wins}</td>
                    <td className="text-center py-3 px-2 text-white font-medium">{month.losses}</td>
                    <td className="text-center py-3 px-2">
                      <span
                        className={`${month.color} text-white px-3 py-1 rounded font-bold cursor-help`}
                        title={month.gradeExplanation}
                      >
                        {month.grade}
                      </span>
                    </td>
                    <td className={`text-right py-3 px-3 font-bold ${month.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {month.totalPnl >= 0 ? '+$' : '-$'}{Math.abs(month.totalPnl).toFixed(2)}
                    </td>
                    <td className="text-right py-3 px-3 text-gray-300">${month.totalFees.toFixed(2)}</td>
                    <td className={`text-right py-3 px-3 font-bold ${month.monthlyPnlPercent === null ? 'text-gray-500' : month.monthlyPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {month.monthlyPnlPercent === null ? '--' : `${month.monthlyPnlPercent >= 0 ? '+' : ''}${month.monthlyPnlPercent.toFixed(2)}%`}
                    </td>
                    <td className="text-right py-3 px-3 text-white">{month.winRate.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">{month.avgWin.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">{month.avgLoss.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">{month.expectancy.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">{month.profitFactor.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden p-4 space-y-4">
          {monthlyData.map((month, idx) => {
            const verdict = getMonthlyVerdict(month);
            const contradiction = getMonthlyContradiction(month);
            const topMistake = getTopMistake(month.trades);
            const prevMonth = monthlyData[idx + 1];
            const comparison = prevMonth ? {
              pnlDelta: month.totalPnl - prevMonth.totalPnl,
              winRateDelta: month.winRate - prevMonth.winRate,
              pfDelta: month.profitFactor - prevMonth.profitFactor,
            } : null;
            const nextFocuses = getNextMonthFocus(month, topMistake);
            const isAdvancedOpen = !!advancedOpen[idx];

            return (
              <div
                key={idx}
                className={`rounded-lg p-4 border ${
                  month.totalPnl < 0 ? 'bg-red-500/5 border-red-500/15' : 'bg-dark-bg border-dark-border'
                }`}
              >
                {/* Header: month name + grade badge */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-white font-semibold text-base">{month.monthLabel}</h3>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {month.totalTrades} trades · {month.wins}W {month.losses}L
                    </div>
                  </div>
                  <span
                    className={`${month.color} text-white text-xl font-black px-3 py-1.5 rounded-lg min-w-[2.75rem] text-center cursor-help`}
                    title={month.gradeExplanation}
                  >
                    {month.grade}
                  </span>
                </div>

                {/* P&L headline */}
                <div className={`text-3xl font-bold mb-3 ${month.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {month.totalPnl >= 0 ? '+$' : '-$'}{Math.abs(month.totalPnl).toFixed(2)}
                </div>

                {/* Verdict */}
                {verdict && (
                  <div className={`rounded-lg px-3 py-2.5 mb-3 ${verdictClasses(verdict.type)}`}>
                    <div className={`text-xs font-bold mb-0.5 ${verdictTextColor(verdict.type)}`}>
                      {verdict.label}
                    </div>
                    <div className="text-gray-400 text-xs">{verdict.text}</div>
                  </div>
                )}

                {/* Core metrics */}
                <div className="grid grid-cols-3 gap-x-2 gap-y-3 mb-3">
                  <div>
                    <div className="text-gray-500 text-xs">Win Rate</div>
                    <div className="text-white font-semibold text-sm">{month.winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">P&L%</div>
                    <div className={`font-bold text-sm ${
                      month.monthlyPnlPercent === null ? 'text-gray-500' :
                      month.monthlyPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {month.monthlyPnlPercent === null ? '--' : `${month.monthlyPnlPercent >= 0 ? '+' : ''}${month.monthlyPnlPercent.toFixed(1)}%`}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Prof. Factor</div>
                    <div className={`font-semibold text-sm ${
                      month.profitFactor >= 1.5 ? 'text-green-400' :
                      month.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {month.profitFactor.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Contradiction */}
                {contradiction && (
                  <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/15 rounded-lg px-3 py-2 mb-3">
                    ⚠ {contradiction}
                  </div>
                )}

                {/* Advanced toggle */}
                <button
                  onClick={() => toggleAdvanced(idx)}
                  className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 mb-3 transition-colors"
                >
                  {isAdvancedOpen ? 'Hide advanced' : 'Show advanced'}
                  {isAdvancedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {/* Advanced metrics */}
                {isAdvancedOpen && (
                  <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-dark-border">
                    <div>
                      <div className="text-gray-500 text-xs">Expectancy</div>
                      <div className={`font-semibold text-sm ${month.expectancy >= 0 ? 'text-white' : 'text-red-400'}`}>
                        {month.expectancy.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Avg Win</div>
                      <div className="text-green-400 font-semibold text-sm">{month.avgWin.toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Avg Loss</div>
                      <div className="text-red-400 font-semibold text-sm">{month.avgLoss.toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Fees</div>
                      <div className="text-gray-300 font-semibold text-sm">${month.totalFees.toFixed(2)}</div>
                    </div>
                  </div>
                )}

                {/* Top mistake */}
                {topMistake && (
                  <div className="mb-3 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Top Mistake</div>
                    <div className="text-red-400 text-xs">
                      {topMistake.label} — tagged {topMistake.count} time{topMistake.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}

                {/* vs Previous month */}
                {comparison && (
                  <div className="mb-3">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">vs Previous Month</div>
                    <div className="flex gap-5">
                      <div>
                        <div className="text-gray-500 text-xs">Win Rate</div>
                        <div className={`text-xs font-semibold ${comparison.winRateDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {comparison.winRateDelta >= 0 ? '+' : ''}{comparison.winRateDelta.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Profit Factor</div>
                        <div className={`text-xs font-semibold ${comparison.pfDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {comparison.pfDelta >= 0 ? '+' : ''}{comparison.pfDelta.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">P&L</div>
                        <div className={`text-xs font-semibold ${comparison.pnlDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {comparison.pnlDelta >= 0 ? '+$' : '-$'}{Math.abs(comparison.pnlDelta).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Next month focus */}
                <div>
                  <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Next Month Focus</div>
                  <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2 space-y-1">
                    {nextFocuses.map((f, i) => (
                      <div key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                        <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {monthlyData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No trades yet. Start adding trades to see monthly statistics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MonthlyTracker;
