import { useState, useEffect, useMemo } from 'react';
import CountUp from 'react-countup';
import { Pin, DollarSign, Target, Scale, Sigma, Receipt, TrendingDown, Sun, CalendarDays, Percent, ClipboardCheck, Flame, ListChecks } from 'lucide-react';
import EquityCurve from '../components/EquityCurve';
import RecentTrades from '../components/RecentTrades';
import OpenPositions from '../components/OpenPositions';
import TradeModal from '../components/TradeModal';
import ReviewQueue from '../components/ReviewQueue';
import { reviewQueue } from '../utils/review';
import { decidedWinRate } from '../utils/outcome';
import { useRoutines } from '../hooks/useRoutines';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useTrades } from '../context/TradesContext';
import Page from '../components/ui/Page';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { balanceBefore, buildReturnIndex, getTradeDate, maxDrawdownPercent } from '../utils/accountMath';

/**
 * A figure that counts up, unless the viewer has asked it not to.
 *
 * react-countup divides by its duration to work out each frame, so the old
 * reduced-motion path — passing duration={0} — rendered NaN instead of a static
 * number. Anyone with "reduce motion" enabled at the OS level saw NaN% for every
 * animated figure on the card while the same account looked fine elsewhere.
 * Skip the animation component entirely rather than asking it to animate over
 * no time at all.
 */
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '', formattingFn, duration }) {
  if (!Number.isFinite(value)) return '--';

  if (!duration) {
    return formattingFn
      ? formattingFn(value)
      : `${prefix}${value.toFixed(decimals)}${suffix}`;
  }

  return (
    <CountUp
      end={value}
      decimals={decimals}
      prefix={prefix}
      suffix={suffix}
      duration={duration}
      formattingFn={formattingFn}
      preserveValue
    />
  );
}

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All' },
];

const RANGE_LABELS = {
  today: 'today',
  week: 'this week',
  month: 'this month',
  ytd: 'year to date',
  all: 'all time',
};

/** First moment of the range, or null for all time. Weeks start Monday. */
function rangeStart(range, now = new Date()) {
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dow = d.getDay();
      d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      return d;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
}

function tradesSince(trades, since) {
  return trades.filter((t) => {
    if (!t.tradeDate) return false;
    const d = getTradeDate(t);
    return !Number.isNaN(d.getTime()) && (since === null || d >= since);
  });
}

function summarize(list) {
  // `outcome`, not `result`: a scratch is neither a win nor a loss, so it is
  // left out of win rate but its dollars still count toward P&L.
  const wins = list.filter(t => t.outcome === 'win');
  const losses = list.filter(t => t.outcome === 'loss');
  const scratches = list.filter(t => t.outcome === 'scratch');

  const totalPnl = list.reduce((sum, t) => sum + (t.gainLoss || 0), 0);
  // gainLoss is recorded net of fees, so gross is the figure before costs.
  // Kept as its own line because costs this size are invisible in the net
  // number alone.
  const fees = list.reduce((sum, t) => sum + (t.fee || 0), 0);
  const grossPnl = totalPnl + fees;
  // Profit factor is by dollars, so it sums every positive and negative
  // trade, scratches included.
  const totalWins = list.reduce((sum, t) => sum + Math.max(0, t.gainLoss || 0), 0);
  const totalLosses = Math.abs(list.reduce((sum, t) => sum + Math.min(0, t.gainLoss || 0), 0));

  const winRate = decidedWinRate(wins.length, losses.length);
  // Average net per trade. With every trade a win or a loss this equals the
  // win-rate formula; it stays correct once scratches are in the mix.
  const expectancy = list.length > 0 ? totalPnl / list.length : 0;

  // null, not 0: a period with no losing trades has an undefined profit factor.
  // Reporting it as 0.00 renders a flawless run as the worst possible score.
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : null;

  return {
    count: list.length,
    totalPnl,
    grossPnl,
    fees,
    winRate,
    wins: wins.length,
    losses: losses.length,
    scratches: scratches.length,
    expectancy,
    profitFactor,
  };
}

const money = (v, signed = false) =>
  `${v < 0 ? '-' : signed && v > 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;

const toneOf = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

const GLOW_FOR_TONE = {
  'text-profit': 'glow-profit',
  'text-loss': 'glow-loss',
  'text-warn': 'glow-warn',
};

function Kpi({ label, hint, icon: Icon, tone = 'text-content-primary', sub, children }) {
  return (
    <div
      className={`card-glow ${GLOW_FOR_TONE[tone] || ''} min-w-0 rounded-card bg-surface px-4 py-3.5 shadow-elev-1 transition-[transform,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-elev-2`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-xs text-content-muted">
          {label}
          {hint && <span className="ml-1 text-[10px] opacity-70">{hint}</span>}
        </p>
        {Icon && (
          <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-chip bg-white/[0.04] ring-1 ring-white/[0.06] ${tone === 'text-content-primary' || tone === 'text-content-muted' ? 'text-content-secondary' : tone}`}>
            <Icon size={14} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={`-mt-1 truncate text-xl font-bold tabular-nums xl:text-2xl ${tone}`}>{children}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-content-muted">{sub}</p>}
    </div>
  );
}

/** Small uppercase card heading with an icon chip. */
function CardLabel({ icon: Icon, children, right, className = 'text-content-muted' }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className={`flex items-center gap-2 text-xs uppercase tracking-widest ${className}`}>
        {Icon && <Icon size={14} aria-hidden="true" />}
        {children}
      </p>
      {right}
    </div>
  );
}

function ProgressBar({ value, done, tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className={`h-2 rounded-full transition-all duration-700 ${tone || (done ? 'bg-profit' : 'bg-brand')}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function Dashboard({ onNavigate }) {
  const reducedMotion = usePrefersReducedMotion();
  const countDuration = reducedMotion ? 0 : 1;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [closingTrade, setClosingTrade] = useState(null);
  const { trades, openTrades, deposits, loading: dataLoading, error: dataError } = useTrades();
  // Always opens on the current week; the switch changes it for this visit.
  const [range, setRange] = useState('week');
  const [pinnedNotes, setPinnedNotes] = useState([]);
  const { routines } = useRoutines();
  // Ids fixed when the review opens; null while closed.
  const [reviewIds, setReviewIds] = useState(null);
  const [appSettings, setAppSettings] = useState({});

  // Fetch settings from Firebase
  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'user'), (snap) => {
      if (snap.exists()) setAppSettings(snap.data());
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

  // The selected range drives the KPI strip and Recent Trades; the monthly
  // breakdown card always reports the calendar month.
  const since = rangeStart(range);
  const sinceKey = since ? since.getTime() : null;
  const metrics = useMemo(
    () => summarize(tradesSince(trades, sinceKey === null ? null : new Date(sinceKey))),
    [trades, sinceKey]
  );
  const monthMetrics = useMemo(() => summarize(tradesSince(trades, rangeStart('month'))), [trades]);

  // Shared with Analytics so both pages report the same drawdown.
  const returnIndex = buildReturnIndex(trades, deposits);

  // Index as of `date` — the last point at or before it, or 1 if the account
  // had not started yet.
  const indexAt = (date) => {
    let value = 1;
    for (const p of returnIndex) {
      if (p.date > date) break;
      value = p.index;
    }
    return value;
  };

  // Account return from `start` (null = inception) to now, on the
  // time-weighted index so deposits don't read as gains.
  const rangeReturn = (start) => {
    const from = start ? indexAt(start) : 1;
    return from > 0 ? ((indexAt(new Date()) / from) - 1) * 100 : 0;
  };

  const maxDrawdown = maxDrawdownPercent(returnIndex);

  const percentSummary = {
    day: rangeReturn(rangeStart('today')),
    week: rangeReturn(rangeStart('week')),
    month: rangeReturn(rangeStart('month')),
    year: rangeReturn(rangeStart('ytd'))
  };
  const selectedReturn = rangeReturn(since);

  const aiCoachSummary = (() => {
    if (trades.length === 0) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTrades = trades.filter(t => {
      const d = getTradeDate(t);
      return !Number.isNaN(d.getTime()) && d >= todayStart;
    });
    if (todayTrades.length > 0) {
      const wins = todayTrades.filter(t => t.outcome === 'win').length;
      const losses = todayTrades.filter(t => t.outcome === 'loss').length;
      const pnl = todayTrades.reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);
      const wr = Math.round(decidedWinRate(wins, losses));
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
    const wWins = weekTrades.filter(t => t.outcome === 'win').length;
    const wLosses = weekTrades.filter(t => t.outcome === 'loss').length;
    const wPnl = weekTrades.reduce((sum, t) => sum + (Number(t.gainLoss) || 0), 0);
    return `No trades today. This week: ${weekTrades.length} trade${weekTrades.length !== 1 ? 's' : ''} · ${wWins}W / ${wLosses}L · ${wPnl >= 0 ? '+' : '-'}$${Math.abs(wPnl).toFixed(2)}.`;
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
    // Scratches neither extend nor break a streak.
    const sortedAll = [...trades]
      .filter(t => t.outcome === 'win' || t.outcome === 'loss')
      .sort((a, b) => getTradeDate(a) - getTradeDate(b));
    let streak = 0;
    let streakType = null;
    sortedAll.forEach(t => {
      if (t.outcome === streakType) streak++;
      else { streak = 1; streakType = t.outcome; }
    });
    const parts = [`This week: ${percentSummary.week >= 0 ? '+' : ''}${percentSummary.week.toFixed(1)}%`];
    if (bestDay) parts.push(`Best day: ${bestDay}`);
    if (streak >= 2 && streakType) parts.push(`Streak: ${streak} ${streakType === 'win' ? 'wins' : 'losses'}`);
    return parts.join(' · ');
  })();

  const toReview = reviewQueue(trades);

  // The last ten closed trades, oldest to newest — the market's recent
  // feedback at a glance. A run of red is the cue to size down.
  const lastTen = trades
    .filter(t => t.result === 'win' || t.result === 'loss')
    .sort((a, b) => getTradeDate(a) - getTradeDate(b))
    .slice(-10);
  const lastTenWins = lastTen.filter(t => t.outcome === 'win').length;
  const lastTenLosses = lastTen.filter(t => t.outcome === 'loss').length;
  const lastTenScratches = lastTen.length - lastTenWins - lastTenLosses;

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
    // Measured against the balance the day started with. Dividing by lifetime
    // net funding overstated the base once the account had lost money, so the
    // warning fired late.
    const dayStartBalance = balanceBefore(trades, deposits, todayStart);
    const todayLossPct = dayStartBalance > 0 ? (todayLossDollars / dayStartBalance) * 100 : 0;
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

  // Today's result as account %, the same basis as Returns > Day. Summing
  // each trade's own P&L% measured the position, not the account, so a
  // −30% position move on a ~7% account loss read as −30% against the goal.
  // Once the day is red, the bar switches to the daily loss limit (if one
  // is set) — chasing the goal from below is the wrong prompt.
  const dailyGoalProgress = (() => {
    const goal = parseFloat(appSettings.dailyPnlGoalPercent);
    const lossLimit = parseFloat(appSettings.maxDailyLossPercent);
    const dayPct = percentSummary.day;
    if (dayPct < 0 && lossLimit > 0) {
      const used = Math.abs(dayPct);
      return {
        mode: 'loss', dayPct, limit: lossLimit,
        progress: Math.min(100, (used / lossLimit) * 100),
        remaining: Math.max(0, lossLimit - used),
        hit: used >= lossLimit,
      };
    }
    if (!goal || goal <= 0) return null;
    return {
      mode: 'goal', dayPct, goal,
      progress: Math.min(100, Math.max(0, (dayPct / goal) * 100)),
      remaining: Math.max(0, goal - dayPct),
      hit: dayPct >= goal,
    };
  })();

  const performanceIdentity = (() => {
    const completed = trades.filter(t => t.result === 'win' || t.result === 'loss');
    if (completed.length < 5) return null;
    const wins = completed.filter(t => t.result === 'win');
    const losses = completed.filter(t => t.result === 'loss');
    const winRate = decidedWinRate(
      completed.filter(t => t.outcome === 'win').length,
      completed.filter(t => t.outcome === 'loss').length
    );
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

  const monthFeeShare = monthMetrics.grossPnl > 0 ? (monthMetrics.fees / monthMetrics.grossPnl) * 100 : null;
  const rangeFeeShare = metrics.grossPnl > 0 ? (metrics.fees / metrics.grossPnl) * 100 : null;
  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  const rangeToolbar = (
    <div role="tablist" aria-label="Date range" className="flex gap-1 overflow-x-auto rounded-control bg-surface p-1 shadow-elev-1">
      {RANGES.map((r) => (
        <button
          key={r.id}
          role="tab"
          aria-selected={range === r.id}
          onClick={() => setRange(r.id)}
          className={`whitespace-nowrap rounded-chip px-3 py-1.5 text-sm font-medium transition-colors ${
            range === r.id
              ? 'bg-brand text-content-primary'
              : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <Page toolbar={rangeToolbar} className="!space-y-4 lg:!space-y-5">
      {/* Order matters: a failed or pending read also produces zero trades and
          zero deposits, so those states must be ruled out before blaming the
          account for being empty. */}
      {dataError ? (
        <p className="text-loss/80 text-xs">
          Could not load your trades — this is a connection or permissions problem, not an empty
          account. Nothing has been deleted. Reload to retry.
        </p>
      ) : dataLoading ? (
        <p className="text-content-muted text-xs">Loading your trades…</p>
      ) : deposits.length === 0 ? (
        <p className="text-warn/70 text-xs">Add a deposit in <strong>Settings</strong> to see accurate % gains.</p>
      ) : null}

      {/* Open positions — live trades, deliberately above the stats they are
          excluded from. */}
      <OpenPositions trades={openTrades} onClose={setClosingTrade} />

      {/* KPI strip — every tile follows the range selector except Max DD. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Net P&L"
          icon={DollarSign}
          hint={RANGE_LABELS[range]}
          tone={toneOf(metrics.totalPnl)}
          sub={`${metrics.wins}W · ${metrics.losses}L${metrics.scratches ? ` · ${metrics.scratches}S` : ''} · ${selectedReturn >= 0 ? '+' : ''}${selectedReturn.toFixed(1)}%`}
        >
          <AnimatedNumber value={metrics.totalPnl} decimals={2} duration={countDuration} formattingFn={(v) => money(v)} />
        </Kpi>
        <Kpi
          label="Win rate"
          icon={Target}
          tone={metrics.wins + metrics.losses === 0 ? 'text-content-muted' : metrics.winRate >= 50 ? 'text-profit' : 'text-loss'}
          sub={`${metrics.count} trade${metrics.count === 1 ? '' : 's'}${metrics.scratches ? `, ${metrics.scratches} scratch${metrics.scratches === 1 ? '' : 'es'}` : ''}`}
        >
          {metrics.wins + metrics.losses === 0
            ? '--'
            : <AnimatedNumber value={metrics.winRate} suffix="%" decimals={1} duration={countDuration} />}
        </Kpi>
        <Kpi
          label="Profit factor"
          icon={Scale}
          tone={
            metrics.profitFactor === null
              ? (metrics.wins > 0 ? 'text-profit' : 'text-content-muted')
              : metrics.profitFactor >= 1 ? 'text-profit' : 'text-loss'
          }
          sub="Wins ÷ losses"
        >
          {metrics.profitFactor === null
            ? (metrics.wins > 0 ? '∞' : '--')
            : <AnimatedNumber value={metrics.profitFactor} decimals={2} duration={countDuration} />}
        </Kpi>
        <Kpi
          label="Expectancy"
          icon={Sigma}
          tone={metrics.count === 0 ? 'text-content-muted' : toneOf(metrics.expectancy)}
          sub="Per trade"
        >
          {metrics.count === 0
            ? '--'
            : <AnimatedNumber value={metrics.expectancy} decimals={2} duration={countDuration} formattingFn={(v) => money(v)} />}
        </Kpi>
        <Kpi
          label="Fees vs gross"
          icon={Receipt}
          tone={
            rangeFeeShare === null
              ? (metrics.fees > 0 ? 'text-loss' : 'text-content-muted')
              : rangeFeeShare >= 50 ? 'text-loss' : rangeFeeShare >= 25 ? 'text-warn' : 'text-content-primary'
          }
          sub={
            metrics.fees === 0
              ? 'No fees'
              : rangeFeeShare === null
                ? `Gross ${money(metrics.grossPnl, true)}, no edge`
                : `${money(-metrics.fees)} fees · ${money(metrics.grossPnl, true)} gross`
          }
        >
          {rangeFeeShare !== null
            ? `${rangeFeeShare.toFixed(0)}%`
            : metrics.fees > 0 ? money(-metrics.fees) : '--'}
        </Kpi>
        {/* The only all-time figure in the strip — say so, or it reads as the
            selected range's drawdown. */}
        <Kpi label="Max DD" icon={TrendingDown} hint="all-time" tone="text-loss" sub="Peak to trough">
          <AnimatedNumber value={maxDrawdown} prefix="-" suffix="%" decimals={1} duration={countDuration} />
        </Kpi>
      </div>

      {/* From 1700px the page is two independent columns — charts and trades
          and the reference cards on the left, today's rail and the month on
          the right — so a tall card on one side never leaves a hole on the
          other. Below that the column wrappers are `display: contents`,
          their cards flow straight into the 3-column grid, and `order`
          interleaves them: equity beside the rail, then the month, then the
          trades table at full width (its fixed columns overflow 2/3 of a
          1536px screen). */}
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5 min-[1700px]:flex">
        <div className="contents min-[1700px]:flex min-[1700px]:min-w-0 min-[1700px]:flex-[2_2_0%] min-[1700px]:flex-col min-[1700px]:gap-5">
          {/* Stretches to the rail's height beside it, and at 1700px+ takes
              the height the left column has spare, up to a cap. */}
          <div className="order-1 flex min-w-0 lg:col-span-2 min-[1700px]:max-h-[40rem] min-[1700px]:flex-1">
            <EquityCurve trades={trades} deposits={deposits} since={since} rangeLabel={RANGE_LABELS[range]} />
          </div>

          <div className="order-4 min-w-0 lg:col-span-3">
            <RecentTrades
              trades={trades}
              since={since}
              maxRiskPercent={parseFloat(appSettings.maxRiskPercent) || 0}
              onAddTrade={() => setIsModalOpen(true)}
            />
          </div>

          {pinnedNotes.length > 0 && (
            <div className={`order-5 rounded-card bg-surface p-4 shadow-elev-1 md:p-5 ${performanceIdentity ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-primary">
                <Pin size={14} className="text-warn" />
                Pinned Playbooks
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pinnedNotes.map(note => (
                  <div
                    key={note.id}
                    onClick={() => onNavigate?.('notebook')}
                    className="cursor-pointer rounded-lg border border-line-strong bg-surface-raised p-3 transition-colors hover:border-brand/50"
                  >
                    <p className="mb-1 truncate text-sm font-medium text-content-primary">{note.title}</p>
                    <p className="line-clamp-3 whitespace-pre-wrap text-xs text-content-secondary">
                      {String(note.content || '').replace(/[#*`_~\[\]]/g, '').trim().slice(0, 120)}
                      {(note.content || '').length > 120 ? '...' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {performanceIdentity && (
            <div className={`order-6 rounded-card bg-surface p-4 shadow-elev-1 md:p-5 ${pinnedNotes.length > 0 ? '' : 'lg:col-span-3'}`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Performance Identity</p>
              <div className="space-y-1.5">
                {performanceIdentity.map((line, i) => (
                  <p key={i} className="text-sm leading-relaxed text-content-secondary">{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="contents min-[1700px]:flex min-[1700px]:min-w-0 min-[1700px]:flex-[1_1_0%] min-[1700px]:flex-col min-[1700px]:gap-5">
          <div className="order-2 card-glow glow-brand space-y-4 rounded-card bg-surface p-4 shadow-elev-1 md:p-5">
            <CardLabel icon={Sun} className="text-brand">Today</CardLabel>

            {todaysFocus && (
              <div className="space-y-1">
                {todaysFocus.map((item, i) => (
                  <p key={i} className="text-sm text-content-primary">→ {item}</p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardCheck size={16} className={toReview.length ? 'text-warn' : 'text-profit'} aria-hidden="true" />
                <p className="truncate text-sm text-content-primary">
                  {toReview.length
                    ? `${toReview.length} trade${toReview.length === 1 ? '' : 's'} to review`
                    : 'All trades reviewed'}
                </p>
              </div>
              {toReview.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewIds(toReview.map((t) => t.id))}
                  className="flex-shrink-0 rounded-control bg-brand px-3 py-1.5 text-xs font-medium text-content-primary transition-colors hover:bg-brand-hover"
                >
                  Start review
                </button>
              )}
            </div>

            {routines.length > 0 && (
              <div className="space-y-1.5 border-t border-line pt-4">
                {routines.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onNavigate?.('routines')}
                    className="flex w-full items-center justify-between gap-3 rounded-control py-1 text-left hover:opacity-80"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ListChecks size={16} className={r.complete ? 'text-profit' : 'text-content-muted'} aria-hidden="true" />
                      <span className={`truncate text-sm ${r.complete ? 'text-content-muted line-through' : 'text-content-primary'}`}>{r.name}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2 text-xs tabular-nums">
                      <span className={r.complete ? 'text-profit' : 'text-content-muted'}>{r.doneCount}/{r.steps.length}</span>
                      <span className={`inline-flex items-center gap-0.5 ${r.streak > 0 ? 'text-warn' : 'text-content-muted'}`}>
                        <Flame size={12} aria-hidden="true" />{r.streak}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {lastTen.length > 0 && (
              <div className="border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-content-muted">Last {lastTen.length} trades</p>
                  <p className={`text-xs font-bold tabular-nums ${lastTenWins >= lastTenLosses ? 'text-profit' : 'text-loss'}`}>
                    {lastTenWins}W · {lastTenLosses}L{lastTenScratches > 0 ? ` · ${lastTenScratches}S` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5" role="list" aria-label="Last trades, oldest to newest">
                  {lastTen.map((t) => {
                    const pnl = Number(t.gainLoss) || 0;
                    const word = t.outcome === 'win' ? 'Win' : t.outcome === 'loss' ? 'Loss' : 'Scratch';
                    const label = `${getTradeDate(t).toLocaleDateString()} · ${word} · ${money(pnl, true)}`;
                    return (
                      <span
                        key={t.id}
                        role="listitem"
                        title={label}
                        aria-label={label}
                        className={`h-3.5 flex-1 rounded-full ${
                          t.outcome === 'win'
                            ? 'bg-profit shadow-[0_0_8px_rgba(52,211,153,0.35)]'
                            : t.outcome === 'loss' ? 'bg-loss/80' : 'bg-content-muted/50'
                        }`}
                      />
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-content-muted">Oldest → newest</p>
              </div>
            )}

            {dailyGoalProgress && (
              <div className="border-t border-line pt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs text-content-muted">
                    {dailyGoalProgress.mode === 'loss' ? 'Daily loss limit' : 'Daily goal'}
                  </p>
                  <p className={`text-xs font-bold tabular-nums ${
                    dailyGoalProgress.mode === 'loss' ? 'text-loss' : dailyGoalProgress.hit ? 'text-profit' : 'text-content-secondary'
                  }`}>
                    {dailyGoalProgress.dayPct >= 0 ? '+' : ''}{dailyGoalProgress.dayPct.toFixed(1)}%
                    {' / '}
                    {dailyGoalProgress.mode === 'loss' ? `-${dailyGoalProgress.limit}%` : `+${dailyGoalProgress.goal}%`}
                  </p>
                </div>
                <ProgressBar
                  value={dailyGoalProgress.progress}
                  tone={dailyGoalProgress.mode === 'loss' ? 'bg-loss' : dailyGoalProgress.hit ? 'bg-profit' : 'bg-brand'}
                />
                <p className={`mt-1 text-xs ${
                  dailyGoalProgress.hit ? (dailyGoalProgress.mode === 'loss' ? 'text-loss' : 'text-profit') : 'text-content-muted'
                }`}>
                  {dailyGoalProgress.mode === 'loss'
                    ? dailyGoalProgress.hit
                      ? 'Daily loss limit hit — done for today.'
                      : `${dailyGoalProgress.remaining.toFixed(1)}% of account left before your limit.`
                    : dailyGoalProgress.hit
                      ? '✓ Daily goal reached — protect your gains.'
                      : dailyGoalProgress.dayPct < 0
                        ? "Down on the day. Don't chase the goal."
                        : `${dailyGoalProgress.remaining.toFixed(1)}% to go to today's target`}
                </p>
              </div>
            )}

            {(aiCoachSummary || weekBanner) && (
              <div className="space-y-1.5 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">Daily coach</p>
                {aiCoachSummary && <p className="text-sm leading-relaxed text-content-primary">{aiCoachSummary}</p>}
                {weekBanner && <p className="text-xs text-content-muted">{weekBanner}</p>}
              </div>
            )}

            {dashGoal && (
              <div className="border-t border-line pt-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <p className="text-xs text-content-muted">Account goal</p>
                  <p className="text-xs tabular-nums text-content-secondary">${dashGoal.balance.toFixed(2)} / ${dashGoal.goalAmt.toFixed(2)}</p>
                </div>
                <ProgressBar value={dashGoal.progress} done={dashGoal.progress >= 100} />
                <div className="mt-1 flex justify-between text-xs text-content-muted">
                  <span>{dashGoal.progress.toFixed(1)}% complete</span>
                  {dashGoal.progress >= 100
                    ? <span className="text-profit">Goal reached!</span>
                    : <span>${dashGoal.remaining.toFixed(2)} to go</span>}
                </div>
              </div>
            )}
          </div>

          <div className="order-3 grid gap-4 md:grid-cols-2 lg:col-span-3 lg:gap-5 min-[1700px]:grid-cols-1">
            {/* Gross / fees / net for the calendar month, whatever the range.
                The net figure alone hides how much of the edge the costs eat. */}
            <div className={`card-glow ${monthMetrics.totalPnl >= 0 ? 'glow-profit' : 'glow-loss'} rounded-card bg-surface p-4 shadow-elev-1 md:p-5`}>
              <CardLabel icon={CalendarDays} right={<p className="text-xs text-content-muted">{monthLabel}</p>}>
                Monthly P&amp;L
              </CardLabel>
              <p className={`text-3xl font-bold tabular-nums leading-none ${toneOf(monthMetrics.totalPnl)}`}>
                {money(monthMetrics.totalPnl)}
              </p>
              <p className="mb-4 mt-1 text-sm text-content-muted">
                {monthMetrics.wins}W · {monthMetrics.losses}L{monthMetrics.scratches ? ` · ${monthMetrics.scratches} scratch` : ''}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-content-muted">Gross</span>
                  <span className={`tabular-nums font-medium ${toneOf(monthMetrics.grossPnl)}`}>{money(monthMetrics.grossPnl, true)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-content-muted">Fees</span>
                  <span className="tabular-nums font-medium text-loss">{money(-monthMetrics.fees)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-1.5 text-sm">
                  <span className="font-medium text-content-secondary">Net</span>
                  <span className={`tabular-nums font-bold ${toneOf(monthMetrics.totalPnl)}`}>{money(monthMetrics.totalPnl, true)}</span>
                </div>
                {monthFeeShare !== null && (
                  <p className={`pt-1 text-xs ${monthFeeShare >= 50 ? 'text-loss' : 'text-content-muted'}`}>
                    Costs are {monthFeeShare.toFixed(0)}% of gross edge.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-card bg-surface p-4 shadow-elev-1 md:p-5">
              <CardLabel icon={Percent}>Returns</CardLabel>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Day', value: percentSummary.day },
                  { label: 'Week', value: percentSummary.week },
                  { label: 'Month', value: percentSummary.month },
                  { label: 'Year', value: percentSummary.year },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className={`rounded-control px-3 py-2.5 ring-1 ${value >= 0 ? 'bg-profit-soft ring-profit/15' : 'bg-loss-soft ring-loss/15'}`}
                  >
                    <p className="mb-0.5 text-xs text-content-muted">{label}</p>
                    <p className={`text-lg font-bold tabular-nums ${toneOf(value)}`}>
                      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Modal — the FAB moved to the top bar's "New Trade" action; this
          instance still backs the empty-state CTA in RecentTrades. */}
      {isModalOpen && (
        <TradeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {reviewIds && (
        <ReviewQueue isOpen tradeIds={reviewIds} onClose={() => setReviewIds(null)} />
      )}

      {/* Closing a position reuses the same modal, prefilled — flipping the
          status toggle to Closed reveals the exit fields. */}
      {closingTrade && (
        <TradeModal
          isOpen
          editTrade={closingTrade}
          onClose={() => setClosingTrade(null)}
        />
      )}
    </Page>
  );
}

export default Dashboard;
