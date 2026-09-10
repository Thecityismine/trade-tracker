import { round } from './serialize.js';

const time = (isoString) => {
  if (!isoString) return 0;
  const parsed = new Date(isoString).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

/**
 * Named windows so a caller can ask for "this month" without doing calendar
 * arithmetic. `all` is the default everywhere.
 */
export function resolvePeriod({ period, from, to } = {}) {
  const now = new Date();
  const end = to ? new Date(to) : null;
  const start = from ? new Date(from) : null;

  if (start && !Number.isNaN(start.getTime())) {
    return {
      label: `${start.toISOString().slice(0, 10)} to ${(end && !Number.isNaN(end.getTime()) ? end : now).toISOString().slice(0, 10)}`,
      start,
      end: end && !Number.isNaN(end.getTime()) ? end : now
    };
  }

  const startOf = (date) => {
    date.setHours(0, 0, 0, 0);
    return date;
  };

  switch ((period || 'all').toLowerCase()) {
    case 'today':
      return { label: 'today', start: startOf(new Date()), end: now };
    case 'week': {
      // Monday-anchored, matching the weekly tracker.
      const monday = new Date();
      const offset = (monday.getDay() + 6) % 7;
      monday.setDate(monday.getDate() - offset);
      return { label: 'this week', start: startOf(monday), end: now };
    }
    case 'month':
      return { label: 'this month', start: startOf(new Date(now.getFullYear(), now.getMonth(), 1)), end: now };
    case '30d':
      return { label: 'last 30 days', start: startOf(new Date(now.getTime() - 30 * 86_400_000)), end: now };
    case '90d':
      return { label: 'last 90 days', start: startOf(new Date(now.getTime() - 90 * 86_400_000)), end: now };
    case 'ytd':
      return { label: 'year to date', start: startOf(new Date(now.getFullYear(), 0, 1)), end: now };
    case 'all':
    default:
      return { label: 'all time', start: null, end: null };
  }
}

export function withinPeriod(isoString, { start, end }) {
  if (!start && !end) return true;
  if (!isoString) return false;

  const at = new Date(isoString).getTime();
  if (Number.isNaN(at)) return false;
  if (start && at < start.getTime()) return false;
  if (end && at > end.getTime()) return false;
  return true;
}

/**
 * Win rate, expectancy and profit factor over a set of closed trades, using the
 * same definitions the Dashboard renders so the API and the UI never disagree.
 * All figures are realized USD.
 */
export function tradeStats(closedTrades) {
  const wins = closedTrades.filter((t) => t.result === 'win');
  const losses = closedTrades.filter((t) => t.result === 'loss');

  const netPnlUsd = sum(closedTrades.map((t) => t.realizedPnlUsd));
  const grossWinUsd = sum(wins.map((t) => t.realizedPnlUsd));
  const grossLossUsd = Math.abs(sum(losses.map((t) => t.realizedPnlUsd)));

  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const avgWinUsd = wins.length > 0 ? grossWinUsd / wins.length : 0;
  const avgLossUsd = losses.length > 0 ? grossLossUsd / losses.length : 0;

  return {
    tradeCount: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePercent: round(winRate),
    netPnlUsd: round(netPnlUsd),
    grossWinUsd: round(grossWinUsd),
    grossLossUsd: round(grossLossUsd),
    feesUsd: round(sum(closedTrades.map((t) => t.feesUsd))),
    avgWinUsd: round(avgWinUsd),
    avgLossUsd: round(avgLossUsd),
    expectancyUsd: round((winRate / 100) * avgWinUsd - (1 - winRate / 100) * avgLossUsd),
    // null, not 0: a stretch with no losing trades has an undefined profit
    // factor, and 0.00 would read as the worst possible score.
    profitFactor: grossLossUsd > 0 ? round(grossWinUsd / grossLossUsd) : null,
    avgExecutionScore: round(
      closedTrades.filter((t) => typeof t.executionScore === 'number').length > 0
        ? sum(closedTrades.map((t) => t.executionScore)) /
            closedTrades.filter((t) => typeof t.executionScore === 'number').length
        : null
    ),
    currency: 'USD'
  };
}

/** Consecutive wins or losses ending at the most recent closed trade. */
function currentStreak(closedTrades) {
  const chronological = [...closedTrades].sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
  const latest = chronological[chronological.length - 1];
  if (!latest?.result) return { type: null, length: 0 };

  let length = 0;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    if (chronological[i].result !== latest.result) break;
    length += 1;
  }
  return { type: latest.result, length };
}

/**
 * Peak-to-trough on the realized equity curve. Funding events move the balance
 * without counting as drawdown — a withdrawal is not a losing trade.
 */
function drawdown(closedTrades, deposits) {
  const events = [
    ...deposits.map((d) => ({ at: time(d.occurredAt), delta: d.signedAmountUsd || 0, funding: true })),
    ...closedTrades.map((t) => ({ at: time(t.occurredAt), delta: t.realizedPnlUsd || 0, funding: false }))
  ].sort((a, b) => a.at - b.at);

  let balance = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  let maxDrawdownPercent = 0;

  events.forEach((event) => {
    balance += event.delta;
    if (event.funding) {
      // Funding raises the high-water mark rather than counting as recovery.
      peak = Math.max(peak, balance);
      return;
    }
    peak = Math.max(peak, balance);
    const gap = peak - balance;
    if (gap > maxDrawdownUsd) {
      maxDrawdownUsd = gap;
      maxDrawdownPercent = peak > 0 ? (gap / peak) * 100 : 0;
    }
  });

  return {
    maxDrawdownUsd: round(maxDrawdownUsd),
    maxDrawdownPercent: round(maxDrawdownPercent),
    currentDrawdownUsd: round(Math.max(0, peak - balance)),
    peakBalanceUsd: round(peak)
  };
}

export function accountSummary({ trades, openTrades, deposits, period }) {
  const closed = trades.filter((t) => withinPeriod(t.occurredAt, period));
  const funding = deposits.filter((d) => withinPeriod(d.occurredAt, period));

  // Balance is an all-time figure regardless of the requested window: an
  // account does not reset its balance because you asked about last week.
  const totalFundedUsd = sum(deposits.map((d) => d.signedAmountUsd));
  const allTimePnlUsd = sum(trades.map((t) => t.realizedPnlUsd));

  const best = [...closed].sort((a, b) => (b.realizedPnlUsd || 0) - (a.realizedPnlUsd || 0))[0] || null;
  const worst = [...closed].sort((a, b) => (a.realizedPnlUsd || 0) - (b.realizedPnlUsd || 0))[0] || null;
  const streak = currentStreak(closed);

  return {
    period: period.label,
    periodStart: period.start ? period.start.toISOString() : null,
    periodEnd: period.end ? period.end.toISOString() : null,

    account: {
      currentBalanceUsd: round(totalFundedUsd + allTimePnlUsd),
      totalFundedUsd: round(totalFundedUsd),
      allTimeRealizedPnlUsd: round(allTimePnlUsd),
      openPositionCount: openTrades.length,
      currency: 'USD'
    },

    performance: tradeStats(closed),
    risk: drawdown(trades, deposits),
    fundingInPeriodUsd: round(sum(funding.map((d) => d.signedAmountUsd))),

    currentStreak: { type: streak.type, length: streak.length },
    bestTrade: best ? { id: best.id, title: best.title, realizedPnlUsd: best.realizedPnlUsd, occurredAt: best.occurredAt } : null,
    worstTrade: worst ? { id: worst.id, title: worst.title, realizedPnlUsd: worst.realizedPnlUsd, occurredAt: worst.occurredAt } : null
  };
}

/** Groups closed trades by a key and runs tradeStats over each bucket. */
export function groupPerformance(closedTrades, keyOf, labelOf) {
  const buckets = new Map();

  closedTrades.forEach((trade) => {
    const key = keyOf(trade);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(trade);
  });

  return [...buckets.entries()]
    .map(([key, group]) => ({ key, label: labelOf(key, group), ...tradeStats(group) }))
    .sort((a, b) => (b.netPnlUsd || 0) - (a.netPnlUsd || 0));
}
