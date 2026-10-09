// Account-level figures that depend on deposits and trades sharing one
// timeline. Kept in one place so the Dashboard, Analytics and the risk flags
// cannot drift apart — they used to compute drawdown three different ways.

export const getTradeDate = (trade) => trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
export const getDepositDate = (deposit) => deposit.date?.toDate?.() || new Date(deposit.date);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fundingDelta = (deposit) =>
  deposit.type === 'deposit' ? toNumber(deposit.amount) : -toNumber(deposit.amount);

/**
 * Deposits and trades merged into one chronological list. Funding sorts ahead
 * of a trade at the same instant, so a top-up is in the balance before the
 * trade it paid for.
 */
export function buildTimeline(trades, deposits) {
  const events = [];
  deposits.forEach((d) => {
    const date = getDepositDate(d);
    if (!Number.isNaN(date.getTime())) events.push({ date, delta: fundingDelta(d), funding: true });
  });
  trades.forEach((t) => {
    if (!t.tradeDate) return;
    const date = getTradeDate(t);
    if (!Number.isNaN(date.getTime())) events.push({ date, delta: toNumber(t.gainLoss), funding: false, trade: t });
  });
  return events.sort((a, b) => (a.date - b.date) || (Number(b.funding) - Number(a.funding)));
}

/**
 * A time-weighted return index over deposits and trades on one timeline.
 *
 * Deposits move the balance without being performance, which is what breaks
 * every simpler approach: divide by the opening balance and a year that
 * received deposits reads as a catastrophic loss; let funding raise the
 * high-water mark and topping up a losing account manufactures drawdown.
 *
 * Compounding each trade's return on the balance that was actually at risk
 * when it was taken, and letting funding move the balance without touching
 * the index, is the one model where Year (which spans deposits) stays
 * comparable to Day (which does not).
 */
export function buildReturnIndex(trades, deposits) {
  let balance = 0;
  let index = 1;
  return buildTimeline(trades, deposits).map((e) => {
    // Clamp at 0: a manually-entered loss larger than the balance would
    // otherwise drive the factor negative and flip the index's sign, which
    // makes every downstream return and drawdown meaningless.
    if (!e.funding && balance > 0) index *= Math.max(0, 1 + e.delta / balance);
    balance += e.delta;
    return { date: e.date, index };
  });
}

// All-time drawdown of the return index, so funding never registers as either
// a loss or a recovery.
export function maxDrawdownPercent(returnIndex) {
  let peak = 0;
  let maxDD = 0;
  for (const p of returnIndex) {
    if (p.index > peak) peak = p.index;
    if (peak > 0 && p.index < peak) maxDD = Math.max(maxDD, ((peak - p.index) / peak) * 100);
  }
  return maxDD;
}

// Account balance just before `date`: all funding and trades strictly earlier.
export function balanceBefore(trades, deposits, date) {
  let balance = 0;
  for (const e of buildTimeline(trades, deposits)) {
    if (e.date >= date) break;
    balance += e.delta;
  }
  return balance;
}

// trade id → account balance immediately before that trade was taken.
export function balancesBeforeTrades(trades, deposits) {
  const map = new Map();
  let balance = 0;
  for (const e of buildTimeline(trades, deposits)) {
    if (!e.funding && e.trade.id) map.set(e.trade.id, balance);
    balance += e.delta;
  }
  return map;
}

/**
 * How much of the account a trade lost, as a percent of the balance before it.
 *
 * This is what a "max risk per trade" limit means. pnlPercent is the leveraged
 * return on margin — at 40x a 0.5% move is -20% — and comparing it to an
 * account-risk limit flagged most losses as over-risk when they were not.
 * Null when the balance is unknown (no deposits logged yet).
 */
export function accountLossPercent(trade, balanceMap) {
  if (trade.result !== 'loss') return null;
  const balance = balanceMap.get(trade.id);
  if (!(balance > 0)) return null;
  return (Math.abs(toNumber(trade.gainLoss)) / balance) * 100;
}

export function isOverRisk(trade, maxRiskPercent, balanceMap) {
  if (!(maxRiskPercent > 0)) return false;
  const lossPercent = accountLossPercent(trade, balanceMap);
  return lossPercent !== null && lossPercent > maxRiskPercent;
}
