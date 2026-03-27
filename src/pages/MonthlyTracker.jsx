import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

function MonthlyTracker() {
  const [trades, setTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'deposits'), (snap) => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    calculateMonthlyStats(trades, deposits);
  }, [trades, deposits]);

  const getBalanceAtDate = (targetDate, tradesData, depositsData) => {
    const funded = depositsData
      .filter(d => {
        const date = d.date?.toDate?.() || new Date(d.date);
        return date <= targetDate;
      })
      .reduce((sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0);

    const pnlBefore = tradesData
      .filter(t => {
        const date = t.tradeDate?.toDate?.() || new Date(t.tradeDate);
        return !Number.isNaN(date.getTime()) && date < targetDate;
      })
      .reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);

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

  const getGrade = (monthlyPnlPercent, profitFactor, expectancyPercent, totalPnl) => {
    let score = 0;

    // Monthly account % gain contribution (realistic account-based thresholds)
    if (monthlyPnlPercent >= 20) score += 40;
    else if (monthlyPnlPercent >= 10) score += 35;
    else if (monthlyPnlPercent >= 5) score += 25;
    else if (monthlyPnlPercent >= 2) score += 15;
    else if (monthlyPnlPercent >= 0) score += 8;

    // Profit factor contribution
    if (profitFactor >= 2.5) score += 30;
    else if (profitFactor >= 2) score += 26;
    else if (profitFactor >= 1.5) score += 22;
    else if (profitFactor >= 1.2) score += 16;
    else if (profitFactor >= 1) score += 10;
    else if (profitFactor >= 0.8) score += 5;

    // Expectancy contribution
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

    const colorMap = {
      A: 'bg-green-600',
      B: 'bg-blue-600',
      C: 'bg-yellow-600',
      D: 'bg-orange-600',
      F: 'bg-red-600'
    };

    return { grade, color: colorMap[grade] };
  };

  const calculateMonthlyStats = (tradesData, depositsData) => {
    const monthMap = new Map();
    const totalFunded = getTotalFunded(depositsData);

    tradesData.forEach(trade => {
      const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      const monthKey = `${tradeDate.toLocaleDateString('en-US', { month: 'long' })} ${tradeDate.getFullYear()}`;
      const monthYear = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        const monthStart = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), 1);
        const balanceAtStart = getBalanceAtDate(monthStart, tradesData, depositsData);
        const denominator = balanceAtStart > 0 ? balanceAtStart : totalFunded;

        monthMap.set(monthKey, {
          monthLabel: monthKey,
          monthYear,
          trades: [],
          wins: 0,
          losses: 0,
          totalWinPercent: 0,
          totalLossPercentAbs: 0,
          totalPnl: 0,
          totalFees: 0,
          denominator
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

      month.totalPnl += trade.gainLoss || 0;
      month.totalFees += trade.fee || 0;
    });

    const months = Array.from(monthMap.values()).map(month => {
      const totalTrades = month.wins + month.losses;
      const winRate = totalTrades > 0 ? (month.wins / totalTrades) * 100 : 0;
      const avgWin = month.wins > 0 ? month.totalWinPercent / month.wins : 0;
      const avgLoss = month.losses > 0 ? -(month.totalLossPercentAbs / month.losses) : 0;
      const expectancyPercent = totalTrades > 0
        ? ((winRate / 100) * avgWin) + ((1 - winRate / 100) * avgLoss)
        : 0;
      const profitFactor = month.totalLossPercentAbs > 0 ? month.totalWinPercent / month.totalLossPercentAbs : 0;
      const monthlyPnlPercent = month.denominator > 0 ? (month.totalPnl / month.denominator) * 100 : 0;

      const gradeInfo = getGrade(monthlyPnlPercent, profitFactor, expectancyPercent, month.totalPnl);

      return {
        ...month,
        totalTrades,
        winRate,
        avgWin,
        avgLoss,
        expectancy: expectancyPercent,
        profitFactor,
        monthlyPnlPercent,
        ...gradeInfo
      };
    });

    months.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    setMonthlyData(months);
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
              {monthlyData.map((month, idx) => (
                <tr
                  key={idx}
                  className="border-t border-dark-border hover:bg-dark-bg transition-colors"
                >
                  <td className="py-3 px-4 text-white font-medium">{month.monthLabel}</td>
                  <td className="text-center py-3 px-2 text-white">{month.totalTrades}</td>
                  <td className="text-center py-3 px-2 text-white font-medium">{month.wins}</td>
                  <td className="text-center py-3 px-2 text-white font-medium">{month.losses}</td>
                  <td className="text-center py-3 px-2">
                    <span className={`${month.color} text-white px-3 py-1 rounded font-bold`}>
                      {month.grade}
                    </span>
                  </td>
                  <td className={`text-right py-3 px-3 font-bold ${month.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${month.totalPnl.toFixed(2)}
                  </td>
                  <td className="text-right py-3 px-3 text-white">
                    ${month.totalFees.toFixed(2)}
                  </td>
                  <td className={`text-right py-3 px-3 font-bold ${month.monthlyPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {month.monthlyPnlPercent >= 0 ? '+' : ''}{month.monthlyPnlPercent.toFixed(2)}%
                  </td>
                  <td className="text-right py-3 px-3 text-white">{month.winRate.toFixed(2)}%</td>
                  <td className="text-right py-3 px-3 text-white">{month.avgWin.toFixed(2)}%</td>
                  <td className="text-right py-3 px-3 text-white">{month.avgLoss.toFixed(2)}%</td>
                  <td className="text-right py-3 px-3 text-white">
                    {month.expectancy.toFixed(2)}%
                  </td>
                  <td className="text-right py-3 px-3 text-white">{month.profitFactor.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden p-4 space-y-4">
          {monthlyData.map((month, idx) => (
            <div key={idx} className="bg-dark-bg border border-dark-border rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-white font-medium">{month.monthLabel}</h3>
                  <div className="flex space-x-3 mt-1 text-sm">
                    <span className="text-white">{month.totalTrades} trades</span>
                    <span className="text-white">{month.wins}W</span>
                    <span className="text-white">{month.losses}L</span>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <span className={`${month.color} text-white px-3 py-1 rounded font-bold`}>
                    {month.grade}
                  </span>
                  <div className={`text-xl font-bold ${month.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${month.totalPnl.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-400">Fees</div>
                  <div className="text-white font-medium">${month.totalFees.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Win Rate</div>
                  <div className="text-white font-medium">{month.winRate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Monthly P&L%</div>
                  <div className={`font-bold ${month.monthlyPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {month.monthlyPnlPercent >= 0 ? '+' : ''}{month.monthlyPnlPercent.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Expectancy</div>
                  <div className="font-medium text-white">{month.expectancy.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Profit Factor</div>
                  <div className="text-white font-medium">{month.profitFactor.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Avg Win</div>
                  <div className="text-white font-medium">{month.avgWin.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Avg Loss</div>
                  <div className="text-white font-medium">{month.avgLoss.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          ))}

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
