import { balancesBeforeTrades } from './accountMath';

/**
 * Scratch trades: a closed trade whose net P&L is within ±band% of the
 * account balance before it counts as a scratch rather than a win or a loss.
 *
 * Measured against the account, not pnlPercent — that figure is the leveraged
 * return on margin, so at 25x a tiny price wiggle reads as several percent.
 *
 * `result` on the trade is left exactly as entered. Stats read `outcome`
 * instead: 'win' | 'loss' | 'scratch'. Net P&L sums are unaffected — a
 * scratch's dollars still count; it just stays out of win rate and streaks.
 */
export const DEFAULT_BREAK_EVEN_PERCENT = 0.5;

export function withOutcomes(trades, deposits, bandPercent) {
  const band = Number(bandPercent);
  if (!(band > 0)) return trades.map((t) => ({ ...t, outcome: t.result }));

  const balances = balancesBeforeTrades(trades, deposits);
  return trades.map((t) => {
    if (t.result !== 'win' && t.result !== 'loss') return { ...t, outcome: t.result };
    const balance = balances.get(t.id);
    const pnl = Number(t.gainLoss) || 0;
    const scratch = balance > 0 && (Math.abs(pnl) / balance) * 100 <= band;
    return { ...t, outcome: scratch ? 'scratch' : t.result };
  });
}

/** Win rate over decided trades only — scratches are neither. */
export function decidedWinRate(wins, losses) {
  const decided = wins + losses;
  return decided > 0 ? (wins / decided) * 100 : 0;
}
