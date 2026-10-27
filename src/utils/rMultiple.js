/**
 * R-multiple: how many times the planned risk a trade made or lost.
 *
 * R = signed price move ÷ stop distance. Leverage scales both sides equally,
 * so it cancels out, and the figure is the same one the trade form shows as
 * R:R. It is price-based — before fees — so a +1R trade can still be a net
 * loss once fees are taken out. Null when the trade has no usable stop.
 */
export function rMultiple(trade) {
  const entry = Number(trade.entryPrice);
  const exit = Number(trade.exitPrice);
  const stop = Number(trade.stopLoss);
  if (![entry, exit, stop].every((n) => Number.isFinite(n) && n > 0) || stop === entry) return null;
  const move = trade.direction === 'short' ? entry - exit : exit - entry;
  return move / Math.abs(entry - stop);
}

// Bucket edges in R. The open-ended ends catch the tails.
const BUCKETS = [
  { label: '≤ -2R', min: -Infinity, max: -2 },
  { label: '-2 to -1R', min: -2, max: -1 },
  { label: '-1 to 0R', min: -1, max: 0 },
  { label: '0 to 1R', min: 0, max: 1 },
  { label: '1 to 2R', min: 1, max: 2 },
  { label: '2 to 3R', min: 2, max: 3 },
  { label: '≥ 3R', min: 3, max: Infinity },
];

/**
 * Histogram and summary over closed trades that have a stop.
 *
 * `beyondStop` counts losses worse than -1R by more than a rounding hair —
 * trades that lost more than the plan allowed (slippage, a moved stop, or no
 * stop honoured at all).
 */
export function rDistribution(trades) {
  const rs = trades
    .filter((t) => t.result === 'win' || t.result === 'loss')
    .map(rMultiple)
    .filter((r) => r !== null && Number.isFinite(r));

  const buckets = BUCKETS.map((b) => ({
    ...b,
    count: rs.filter((r) => r >= b.min && r < b.max).length,
    positive: b.min >= 0,
  }));

  const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
  return {
    buckets,
    count: rs.length,
    avgR,
    atLeast2R: rs.filter((r) => r >= 2).length,
    beyondStop: rs.filter((r) => r < -1.05).length,
  };
}
