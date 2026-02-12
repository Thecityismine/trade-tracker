import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

function MonthlyTracker() {
  const [trades, setTrades] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTrades(tradesData);
      calculateMonthlyStats(tradesData);
    });

    return () => unsubscribe();
  }, []);

  const getGrade = (pnlPercent, profitFactor, expectancy) => {
    // Grading based on multiple factors
    let score = 0;
    
    // P&L% contribution (40%)
    if (pnlPercent >= 300) score += 40;
    else if (pnlPercent >= 200) score += 35;
    else if (pnlPercent >= 100) score += 30;
    else if (pnlPercent >= 50) score += 20;
    else if (pnlPercent >= 0) score += 10;
    
    // Profit Factor contribution (30%)
    if (profitFactor >= 3) score += 30;
    else if (profitFactor >= 2) score += 25;
    else if (profitFactor >= 1.5) score += 20;
    else if (profitFactor >= 1) score += 10;
    
    // Expectancy contribution (30%)
    if (expectancy >= 15) score += 30;
    else if (expectancy >= 10) score += 25;
    else if (expectancy >= 5) score += 20;
    else if (expectancy >= 0) score += 10;
    
    // Assign grade
    if (score >= 85) return { grade: 'A', color: 'bg-green-600' };
    if (score >= 70) return { grade: 'B', color: 'bg-blue-600' };
    if (score >= 50) return { grade: 'C', color: 'bg-yellow-600' };
    if (score >= 30) return { grade: 'D', color: 'bg-orange-600' };
    return { grade: 'F', color: 'bg-red-600' };
  };

  const calculateMonthlyStats = (tradesData) => {
    const monthMap = new Map();

    tradesData.forEach(trade => {
      const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      const monthKey = `${tradeDate.toLocaleDateString('en-US', { month: 'long' })} ${tradeDate.getFullYear()}`;
      const monthYear = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthLabel: monthKey,
          monthYear: monthYear,
          trades: [],
          wins: 0,
          losses: 0,
          totalGain: 0,
          totalLoss: 0,
          totalPnl: 0,
          fees: 0
        });
      }

      const month = monthMap.get(monthKey);
      month.trades.push(trade);

      if (trade.result === 'win') {
        month.wins++;
        month.totalGain += trade.gainLoss || 0;
      } else if (trade.result === 'loss') {
        month.losses++;
        month.totalLoss += Math.abs(trade.gainLoss || 0);
      }

      month.totalPnl += trade.gainLoss || 0;
      month.fees += trade.fee || 0;
    });

    const months = Array.from(monthMap.values()).map(month => {
      const totalTrades = month.wins + month.losses;
      const winRate = totalTrades > 0 ? (month.wins / totalTrades) * 100 : 0;
      const avgWin = month.wins > 0 ? month.totalGain / month.wins : 0;
      const avgLoss = month.losses > 0 ? month.totalLoss / month.losses : 0;
      const expectancy = totalTrades > 0 
        ? ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss)
        : 0;
      const profitFactor = month.totalLoss > 0 ? month.totalGain / month.totalLoss : 0;
      
      // Calculate monthly P&L%
      const monthlyPnlPercent = totalTrades > 0 ? (month.totalPnl / totalTrades) * 10 : 0;
      
      const expectancyPercent = avgLoss > 0 ? (expectancy / avgLoss) * 100 : 0;
      
      const gradeInfo = getGrade(monthlyPnlPercent, profitFactor, expectancyPercent);

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

    // Sort by month/year descending
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
                  <td className="text-center py-3 px-2 text-gray-300">{month.totalTrades}</td>
                  <td className="text-center py-3 px-2 text-green-500 font-medium">{month.wins}</td>
                  <td className="text-center py-3 px-2 text-red-500 font-medium">{month.losses}</td>
                  <td className="text-center py-3 px-2">
                    <span className={`${month.color} text-white px-3 py-1 rounded font-bold`}>
                      {month.grade}
                    </span>
                  </td>
                  <td className={`text-right py-3 px-3 font-bold ${month.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${month.totalPnl.toFixed(2)}
                  </td>
                  <td className={`text-right py-3 px-3 font-bold ${month.monthlyPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {month.monthlyPnlPercent.toFixed(2)}%
                  </td>
                  <td className="text-right py-3 px-3 text-white">{month.winRate.toFixed(2)}%</td>
                  <td className="text-right py-3 px-3 text-green-500">{month.avgWin.toFixed(2)}%</td>
                  <td className="text-right py-3 px-3 text-red-500">-{month.avgLoss.toFixed(2)}%</td>
                  <td className={`text-right py-3 px-3 ${month.expectancy >= 0 ? 'text-green-500' : 'text-red-500'}`}>
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
                    <span className="text-gray-400">{month.totalTrades} trades</span>
                    <span className="text-green-500">{month.wins}W</span>
                    <span className="text-red-500">{month.losses}L</span>
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
                  <div className="text-gray-400">Win Rate</div>
                  <div className="text-white font-medium">{month.winRate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Monthly P&L%</div>
                  <div className={`font-bold ${month.monthlyPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {month.monthlyPnlPercent.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Expectancy</div>
                  <div className={`font-medium ${month.expectancy >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {month.expectancy.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Profit Factor</div>
                  <div className="text-white font-medium">{month.profitFactor.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Avg Win</div>
                  <div className="text-green-500 font-medium">{month.avgWin.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Avg Loss</div>
                  <div className="text-red-500 font-medium">-{month.avgLoss.toFixed(2)}%</div>
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
