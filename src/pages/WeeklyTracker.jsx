import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useTrades } from '../context/TradesContext';
import { db } from '../config/firebase';
import { ChevronDown, ChevronUp } from 'lucide-react';
import WeeklyReport from '../components/WeeklyReport';
import Page from '../components/ui/Page';
import ColumnPicker, { useVisibleColumns } from '../components/ui/ColumnPicker';
import { Card } from '../components/ui/Surface';
import {
  buildChartPayload,
  buildReportPayload,
  buildTradeRefs,
  requestChartNotes,
  requestWeeklyReport,
  weekKeyFor
} from '../utils/weeklyReport';

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
    map[key].pnl += trade.gainLoss || 0;
  });
  return Object.values(map).sort((a, b) => b.date - a.date);
}

function verdictClasses(type) {
  if (type === 'good') return 'bg-profit/10 border border-profit/15 text-profit';
  if (type === 'bad') return 'bg-loss/10 border border-loss/15 text-loss';
  if (type === 'warning') return 'bg-warn/10 border border-warn/15 text-warn';
  return 'bg-brand/10 border border-brand/15 text-brand';
}

const WEEKLY_COLUMNS = [
  { id: 'wins', label: 'Wins' },
  { id: 'losses', label: 'Losses' },
  { id: 'gain', label: 'Weekly Gain' },
  { id: 'fees', label: 'Fees' },
  { id: 'pnlPct', label: 'Weekly P&L%' },
  { id: 'winRate', label: 'Win Rate' },
  { id: 'avgWin', label: 'Avg Win %' },
  { id: 'avgLoss', label: 'Avg Loss %' },
  { id: 'expectancy', label: 'Expectancy %' },
  { id: 'profitFactor', label: 'Profit Factor' },
];

function WeeklyTracker() {
  const { hidden, isVisible, toggle, reset } = useVisibleColumns('tt:weekly-cols', WEEKLY_COLUMNS);
  // Week label + chevron are always present, plus whatever is toggled on.
  const visibleColSpan = 2 + WEEKLY_COLUMNS.filter((c) => isVisible(c.id)).length;
  const { trades, deposits } = useTrades();
  const [weeklyData, setWeeklyData] = useState([]);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [reports, setReports] = useState({});
  const [strategies, setStrategies] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [mindsetEntries, setMindsetEntries] = useState([]);
  const [generatingKey, setGeneratingKey] = useState(null);
  const [chartsPendingKey, setChartsPendingKey] = useState(null);
  const [reportErrors, setReportErrors] = useState({});

  useEffect(() => {
    calculateWeeklyStats(trades, deposits);
  }, [trades, deposits]);

  useEffect(() => {
    const subscribe = (name, setter) =>
      onSnapshot(
        collection(db, name),
        (snap) => setter(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (error) => console.error(`Error loading ${name}:`, error)
      );

    const unsubReports = onSnapshot(
      collection(db, 'weeklyReports'),
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => { next[d.id] = { id: d.id, ...d.data() }; });
        setReports(next);
      },
      (error) => console.error('Error loading weekly reports:', error)
    );
    const unsubStrategies = subscribe('strategies', setStrategies);
    const unsubJournal = subscribe('tradeJournalEntries', setJournalEntries);
    const unsubMindset = subscribe('mindsetEntries', setMindsetEntries);

    return () => {
      unsubReports();
      unsubStrategies();
      unsubJournal();
      unsubMindset();
    };
  }, []);

  const handleGenerateReport = async (week) => {
    const key = weekKeyFor(week.startDate);
    const reportRef = doc(db, 'weeklyReports', key);

    setGeneratingKey(key);
    setReportErrors((prev) => ({ ...prev, [key]: null }));

    try {
      // weeklyData is sorted newest-first, so the entries after this week are the prior ones.
      const index = weeklyData.findIndex((w) => weekKeyFor(w.startDate) === key);
      const priorReports = weeklyData
        .slice(index + 1, index + 3)
        .map((w) => reports[weekKeyFor(w.startDate)])
        .filter(Boolean);

      const { report, usage } = await requestWeeklyReport(
        buildReportPayload({ week, strategies, journalEntries, mindsetEntries, priorReports })
      );

      await setDoc(reportRef, {
        weekKey: key,
        weekLabel: week.weekLabel,
        model: 'claude-opus-5',
        report,
        usage,
        tradeIds: week.trades.map((t) => t.id),
        chartNotes: [],
        chartError: null,
        generatedAt: serverTimestamp()
      });

      // Phase 2 — charts. Failures here leave the written report intact.
      const chartPayload = await buildChartPayload({ week });
      if (chartPayload.charts.length > 0) {
        setChartsPendingKey(key);
        try {
          const { chartNotes } = await requestChartNotes(chartPayload);
          await setDoc(reportRef, { chartNotes, chartError: null }, { merge: true });
        } catch (chartError) {
          await setDoc(
            reportRef,
            { chartError: chartError.message || 'Chart review failed.' },
            { merge: true }
          );
        } finally {
          setChartsPendingKey(null);
        }
      }
    } catch (error) {
      console.error('Weekly report failed:', error);
      setReportErrors((prev) => ({ ...prev, [key]: error.message || 'Report generation failed.' }));
    } finally {
      setGeneratingKey(null);
    }
  };

  const renderReport = (week) => {
    const key = weekKeyFor(week.startDate);
    return (
      <WeeklyReport
        doc={reports[key]}
        tradesByRef={buildTradeRefs(week.trades).byRef}
        generating={generatingKey === key}
        chartsPending={chartsPendingKey === key}
        error={reportErrors[key]}
        hasCharts={week.trades.some((t) => t.chartImageUrl)}
        onGenerate={() => handleGenerateReport(week)}
      />
    );
  };

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
      .reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);
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
      week.pnl += trade.gainLoss || 0;
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
    <Page
      actions={
        <div className="hidden lg:block">
          <ColumnPicker columns={WEEKLY_COLUMNS} hidden={hidden} onToggle={toggle} onReset={reset} />
        </div>
      }
    >
      <Card padded={false} className="overflow-hidden">
        {/* Desktop Table — sticky header needs its own scroll box, so the
            wrapper caps height rather than growing the page. */}
        <div className="hidden lg:block max-h-[70vh] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface-raised">
              <tr className="text-content-secondary text-sm">
                <th className="text-left py-3.5 px-4 font-medium">Week</th>
                {isVisible('wins') && <th className="text-right py-3.5 px-2 font-medium">Wins</th>}
                {isVisible('losses') && <th className="text-right py-3.5 px-2 font-medium">Losses</th>}
                {isVisible('gain') && <th className="text-right py-3.5 px-3 font-medium">Weekly Gain</th>}
                {isVisible('fees') && <th className="text-right py-3.5 px-3 font-medium">Fees</th>}
                {isVisible('pnlPct') && <th className="text-right py-3.5 px-3 font-medium">Weekly P&L%</th>}
                {isVisible('winRate') && <th className="text-right py-3.5 px-3 font-medium">Win Rate</th>}
                {isVisible('avgWin') && <th className="text-right py-3.5 px-3 font-medium">Avg Win %</th>}
                {isVisible('avgLoss') && <th className="text-right py-3.5 px-3 font-medium">Avg Loss %</th>}
                {isVisible('expectancy') && <th className="text-right py-3.5 px-3 font-medium">Expectancy %</th>}
                {isVisible('profitFactor') && <th className="text-right py-3.5 px-3 font-medium">Profit Factor</th>}
                <th className="text-center py-3.5 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((week, idx) => {
                const verdict = getWeeklyVerdict(week);
                return (
                  <>
                    <tr
                      key={idx}
                      className={`border-t border-line cursor-pointer transition-colors ${
                        week.pnl < 0 ? 'hover:bg-loss/5' : 'hover:bg-surface-raised'
                      }`}
                      onClick={() => setExpandedWeek(expandedWeek === idx ? null : idx)}
                    >
                      <td className="py-3 px-4">
                        <div className="text-content-primary font-medium">{week.weekLabel}</div>
                        {verdict && (
                          <div className={`text-xs mt-0.5 ${
                            verdict.type === 'good' ? 'text-profit/70' :
                            verdict.type === 'bad' ? 'text-loss/70' :
                            verdict.type === 'warning' ? 'text-warn/70' : 'text-brand/70'
                          }`}>
                            {verdict.icon} {verdict.text}
                          </div>
                        )}
                      </td>
                      {isVisible('wins') && <td className="text-right py-3.5 px-2 text-content-primary font-medium">{week.wins}</td>}
                      {isVisible('losses') && <td className="text-right py-3.5 px-2 text-content-primary font-medium">{week.losses}</td>}
                      {isVisible('gain') && (
                        <td className={`text-right py-3.5 px-3 font-semibold ${week.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {week.pnl >= 0 ? '+$' : '-$'}{Math.abs(week.pnl).toFixed(2)}
                        </td>
                      )}
                      {isVisible('fees') && <td className="text-right py-3.5 px-3 text-content-secondary">${week.fees.toFixed(2)}</td>}
                      {isVisible('pnlPct') && (
                        <td className={`text-right py-3.5 px-3 font-bold ${week.pnlPercent === null ? 'text-content-muted' : week.pnlPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {week.pnlPercent === null ? '--' : `${week.pnlPercent.toFixed(2)}%`}
                        </td>
                      )}
                      {isVisible('winRate') && <td className="text-right py-3.5 px-3 text-content-primary">{week.winRate.toFixed(2)}%</td>}
                      {isVisible('avgWin') && <td className="text-right py-3.5 px-3 text-content-primary">{week.avgWin.toFixed(2)}%</td>}
                      {isVisible('avgLoss') && <td className="text-right py-3.5 px-3 text-content-primary">{week.avgLoss.toFixed(2)}%</td>}
                      {isVisible('expectancy') && <td className="text-right py-3.5 px-3 text-content-primary">{week.expectancy.toFixed(2)}%</td>}
                      {isVisible('profitFactor') && <td className="text-right py-3.5 px-3 text-content-primary">{week.profitFactor.toFixed(2)}</td>}
                      <td className="text-center py-3.5 px-2">
                        {expandedWeek === idx
                          ? <ChevronUp size={18} className="text-content-secondary" />
                          : <ChevronDown size={18} className="text-content-secondary" />}
                      </td>
                    </tr>
                    {expandedWeek === idx && (
                      <tr className="bg-surface-raised">
                        <td colSpan={visibleColSpan} className="p-4">
                          <div className="mb-5">
                            {renderReport(week)}
                          </div>
                          <div className="space-y-4">
                            {groupByDay(week.trades).map((day) => (
                              <div key={day.label}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-content-secondary text-sm font-semibold">{day.label}</span>
                                  <span className={`text-sm font-semibold ${day.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                                    Day total: {day.pnl >= 0 ? '+$' : '-$'}{Math.abs(day.pnl).toFixed(2)}
                                  </span>
                                </div>
                                {day.trades.map((trade) => (
                                  <div key={trade.id} className="flex items-center justify-between bg-surface-hover rounded-chip px-3 py-2 mb-1">
                                    <div className="flex items-center gap-3">
                                      <span className={`w-2.5 h-2.5 rounded-full ${trade.direction === 'long' ? 'bg-profit' : 'bg-loss'}`} />
                                      <span className="text-content-primary text-sm">{trade.ticker || 'BTC'}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className={`text-sm font-medium ${trade.pnlPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                                        {trade.pnlPercent?.toFixed(2)}%
                                      </span>
                                      <span className={`text-sm font-semibold ${trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
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
                  week.pnl < 0 ? 'bg-loss/5 border-loss/15' : 'bg-surface-raised border-line'
                }`}
              >
                {/* Header row: date range + W/L */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-content-secondary text-sm">{week.weekLabel}</span>
                  <span className="text-content-muted text-xs font-medium">
                    {week.wins}W · {week.losses}L
                  </span>
                </div>

                {/* P&L headline */}
                <div className={`text-3xl font-bold mb-3 ${week.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
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
                    <div className="text-content-muted text-xs">Win Rate</div>
                    <div className="text-content-primary font-semibold text-sm">{week.winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-content-muted text-xs">P&L%</div>
                    <div className={`font-bold text-sm ${
                      week.pnlPercent === null ? 'text-content-muted' :
                      week.pnlPercent >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {week.pnlPercent === null ? '--' : `${week.pnlPercent.toFixed(1)}%`}
                    </div>
                  </div>
                  <div>
                    <div className="text-content-muted text-xs">Prof. Factor</div>
                    <div className={`font-semibold text-sm ${
                      week.profitFactor >= 1.5 ? 'text-profit' :
                      week.profitFactor >= 1 ? 'text-warn' : 'text-loss'
                    }`}>
                      {week.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-content-muted text-xs">Expectancy</div>
                    <div className={`font-semibold text-sm ${week.expectancy >= 0 ? 'text-content-primary' : 'text-loss'}`}>
                      {week.expectancy.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-content-muted text-xs">Avg Win</div>
                    <div className="text-profit font-semibold text-sm">{week.avgWin.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-content-muted text-xs">Avg Loss</div>
                    <div className="text-loss font-semibold text-sm">{week.avgLoss.toFixed(1)}%</div>
                  </div>
                </div>

                {/* Contradiction callout */}
                {contradiction && (
                  <div className="text-xs text-caution bg-caution/10 border border-caution/15 rounded-lg px-3 py-2 mb-3">
                    ⚠ {contradiction}
                  </div>
                )}

                {/* Streak note */}
                {streakNote && (
                  <div className="text-xs text-loss bg-loss/10 border border-loss/15 rounded-lg px-3 py-2 mb-3">
                    • {streakNote}
                  </div>
                )}

                {/* Coach review — replaces the rule-based focus list once generated,
                    so there is only ever one set of recommendations on screen. */}
                <div className="mb-3">
                  {reports[weekKeyFor(week.startDate)] || generatingKey === weekKeyFor(week.startDate) ? (
                    renderReport(week)
                  ) : (
                    <>
                      <div className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Next Week Focus</div>
                      <div className="bg-brand/5 border border-brand/15 rounded-lg px-3 py-2 space-y-1 mb-3">
                        {nextFocus.map((f, i) => (
                          <div key={i} className="text-xs text-content-secondary flex items-start gap-1.5">
                            <span className="text-brand flex-shrink-0 mt-0.5">•</span>
                            {f}
                          </div>
                        ))}
                      </div>
                      {renderReport(week)}
                    </>
                  )}
                </div>

                {/* Expand toggle */}
                <button
                  onClick={() => setExpandedWeek(expandedWeek === idx ? null : idx)}
                  className="w-full text-content-muted text-xs flex items-center justify-center gap-1.5 hover:text-content-secondary transition-colors py-1"
                >
                  {expandedWeek === idx
                    ? <>Hide trades <ChevronUp size={13} /></>
                    : <>View {totalTrades} trade{totalTrades !== 1 ? 's' : ''} <ChevronDown size={13} /></>}
                </button>

                {/* Expanded: grouped by day */}
                {expandedWeek === idx && (
                  <div className="mt-3 pt-3 border-t border-line space-y-4">
                    {dayGroups.map((day) => (
                      <div key={day.label}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-content-secondary text-xs font-semibold uppercase tracking-wide">{day.label}</span>
                          <span className={`text-xs font-semibold ${day.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {day.pnl >= 0 ? '+$' : '-$'}{Math.abs(day.pnl).toFixed(2)}
                            <span className="ml-1 opacity-70">{day.pnl >= 0 ? '✓' : '✗'}</span>
                          </span>
                        </div>
                        {day.trades.map((trade) => (
                          <div key={trade.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                trade.direction === 'long' ? 'bg-profit' : 'bg-loss'
                              }`} />
                              <span className="text-content-muted text-xs">{trade.ticker || 'BTC'}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-medium ${trade.pnlPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                                {trade.pnlPercent?.toFixed(2)}%
                              </span>
                              <span className={`text-xs font-semibold min-w-[60px] text-right ${
                                trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'
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
            <div className="text-center py-8 text-content-muted">
              No trades yet. Start adding trades to see weekly statistics.
            </div>
          )}
        </div>
      </Card>
    </Page>
  );
}

export default WeeklyTracker;
