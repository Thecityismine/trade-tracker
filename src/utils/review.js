import { getTradeDate } from './accountMath';

/**
 * The review queue only covers trades from the day it was introduced. The
 * history before that stays as it is rather than becoming a backlog of
 * hundreds of trades to work through.
 */
export const REVIEW_QUEUE_START = new Date(2026, 9, 26);

/** A closed trade on or after the queue start that hasn't been marked reviewed. */
export function needsReview(trade) {
  if (trade.reviewedAt) return false;
  if (trade.result !== 'win' && trade.result !== 'loss') return false;
  const d = getTradeDate(trade);
  return !Number.isNaN(d.getTime()) && d >= REVIEW_QUEUE_START;
}

/** Trades waiting for review, oldest first so you review them in the order they happened. */
export function reviewQueue(trades) {
  return trades.filter(needsReview).sort((a, b) => getTradeDate(a) - getTradeDate(b));
}
