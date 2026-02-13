import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ChevronDown, ChevronUp } from 'lucide-react';

function WeeklyTracker() {
  const [trades, setTrades] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [expandedWeek, setExpandedWeek] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTrades(tradesData);
      calculateWeeklyStats(tradesData);
    });

    return () => unsubscribe();
  }, []);

  const getWeekRange = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return {
      start: monday,
      end: sunday,
      label: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    };
  };

  const calculateWeeklyStats = (tradesData) => {
    const weekMap = new Map();

    tradesData.forEach(trade => {
      const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      const weekRange = getWeekRange(tradeDate);
      const weekKey = weekRange.label;

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekLabel: weekKey,
          startDate: weekRange.start,
          endDate: weekRange.end,
          trades: [],
          wins: 0,
          losses: 0,
          totalGain: 0,
          totalLoss: 0,
          fees: 0,
          pnl: 0
        });
      }

      const week = weekMap.get(weekKey);
      week.trades.push(trade);

      if (trade.result === 'win') {
        week.wins++;
        week.totalGain += trade.gainLoss || 0;
      } else if (trade.result === 'loss') {
        week.losses++;
        week.totalLoss += Math.abs(trade.gainLoss || 0);
      }

      week.fees += trade.fee || 0;
      week.pnl += trade.gainLoss || 0;
    });

    const weeks = Array.from(weekMap.values()).map(week => {
      const totalTrades = week.wins + week.losses;
      const winRate = totalTrades > 0 ? (week.wins / totalTrades) * 100 : 0;
      const avgWin = week.wins > 0 ? week.totalGain / week.wins : 0;
      const avgLoss = week.losses > 0 ? week.totalLoss / week.losses : 0;
      const expectancy = totalTrades > 0 
        ? ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss)
        : 0;
      const profitFactor = week.totalLoss > 0 ? week.totalGain / week.totalLoss : 0;
      const pnlPercent = week.pnl > 0 ? (week.pnl / 100) * 100 : week.pnl;

      return {
        ...week,
        winRate,
        avgWin,
        avgLoss,
        expectancy: avgLoss > 0 ? (expectancy / avgLoss) * 100 : 0,
        profitFactor,
        pnlPercent: totalTrades > 0 ? pnlPercent : 0
      };
    });

    // Sort by start date descending
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
              {weeklyData.map((week, idx) => (
                <>
                  <tr
                    key={idx}
                    className="border-t border-dark-border hover:bg-dark-bg transition-colors cursor-pointer"
                    onClick={() => setExpandedWeek(expandedWeek === idx ? null : idx)}
                  >
                    <td className="py-3 px-4 text-white font-medium">{week.weekLabel}</td>
                    <td className="text-center py-3 px-2 text-white font-medium">{week.wins}</td>
                    <td className="text-center py-3 px-2 text-white font-medium">{week.losses}</td>
                    <td className={`text-right py-3 px-3 font-medium ${week.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${week.pnl.toFixed(2)}
                    </td>
                    <td className="text-right py-3 px-3 text-white">${week.fees.toFixed(2)}</td>
                    <td className={`text-right py-3 px-3 font-bold ${week.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {week.pnlPercent.toFixed(2)}%
                    </td>
                    <td className="text-right py-3 px-3 text-white">{week.winRate.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">{week.avgWin.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">-{week.avgLoss.toFixed(2)}%</td>
                    <td className="text-right py-3 px-3 text-white">
                      {week.expectancy.toFixed(2)}%
                    </td>
                    <td className="text-right py-3 px-3 text-white">{week.profitFactor.toFixed(2)}</td>
                    <td className="text-center py-3 px-2">
                      {expandedWeek === idx ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                    </td>
                  </tr>
                  {expandedWeek === idx && (
                    <tr className="bg-dark-bg">
                      <td colSpan="12" className="p-4">
                        <div className="space-y-2">
                          <h4 className="text-white font-medium mb-3">Trades this week:</h4>
                          {week.trades.map(trade => {
                            const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
                            return (
                              <div key={trade.id} className="flex items-center justify-between bg-dark-card border border-dark-border rounded px-3 py-2">
                                <div className="flex items-center space-x-3">
                                  <span className={`${trade.direction === 'long' ? 'text-green-500' : 'text-red-500'}`}>
                                    {trade.direction === 'long' ? '🟢' : '🔴'}
                                  </span>
                                  <span className="text-gray-400 text-sm">
                                    {tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                  <span className="text-white">{trade.ticker}</span>
                                </div>
                                <div className="flex items-center space-x-4">
                                  <span className={`font-medium ${trade.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {trade.pnlPercent.toFixed(2)}%
                                  </span>
                                  <span className={`font-medium ${trade.gainLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    ${trade.gainLoss.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden p-4 space-y-4">
          {weeklyData.map((week, idx) => (
            <div key={idx} className="bg-dark-bg border border-dark-border rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-white font-medium">{week.weekLabel}</h3>
                  <div className="flex space-x-3 mt-1 text-sm">
                    <span className="text-white">{week.wins}W</span>
                    <span className="text-white">{week.losses}L</span>
                  </div>
                </div>
                <div className={`text-xl font-bold ${week.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  ${week.pnl.toFixed(2)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-400">Win Rate</div>
                  <div className="text-white font-medium">{week.winRate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">P&L%</div>
                  <div className={`font-bold ${week.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {week.pnlPercent.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Expectancy</div>
                  <div className="font-medium text-white">
                    {week.expectancy.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Profit Factor</div>
                  <div className="text-white font-medium">{week.profitFactor.toFixed(2)}</div>
                </div>
              </div>

              <button
                onClick={() => setExpandedWeek(expandedWeek === idx ? null : idx)}
                className="w-full mt-3 text-gray-400 text-sm flex items-center justify-center space-x-2"
              >
                <span>{expandedWeek === idx ? 'Hide' : 'Show'} trades</span>
                {expandedWeek === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedWeek === idx && (
                <div className="mt-3 space-y-2 pt-3 border-t border-dark-border">
                  {week.trades.map(trade => {
                    const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
                    return (
                      <div key={trade.id} className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <span className={`${trade.direction === 'long' ? 'text-green-500' : 'text-red-500'}`}>
                            {trade.direction === 'long' ? '🟢' : '🔴'}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`text-sm font-medium ${trade.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {trade.pnlPercent.toFixed(2)}%
                          </span>
                          <span className={`text-sm font-medium ${trade.gainLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${trade.gainLoss.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

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
