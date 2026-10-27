/**
 * Emotion and free-form tags on a trade, and the per-group performance
 * breakdown Analytics builds from them.
 *
 * Emotion is how you felt going INTO the trade — part of the plan, recorded
 * before the outcome is known — so it is locked once a position is opened.
 */

export const EMOTIONS = [
  { id: 'calm', label: 'Calm' },
  { id: 'confident', label: 'Confident' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'fomo', label: 'FOMO' },
  { id: 'revenge', label: 'Revenge' },
  { id: 'bored', label: 'Bored' },
];

export const emotionLabel = (id) => EMOTIONS.find((e) => e.id === id)?.label || null;

/** Trim, collapse inner whitespace and lowercase, so "News  Catalyst" and "news catalyst" are one tag. */
export const normalizeTag = (raw) => String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Every tag used across `trades`, most used first. */
export function collectTags(trades) {
  const counts = new Map();
  trades.forEach((t) => {
    (Array.isArray(t.tags) ? t.tags : []).forEach((tag) => {
      const key = normalizeTag(tag);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

/**
 * Group closed trades by `keysOf(trade)` (an array — a trade with three tags
 * counts in all three groups) and summarise each group. Trades with no key
 * fall into `untaggedLabel` when one is given.
 *
 * Sorted worst net P&L first: the point of the table is to find what is
 * costing money.
 */
export function performanceBy(trades, keysOf, { untaggedLabel = null } = {}) {
  const groups = new Map();
  const add = (key, t) => {
    if (!groups.has(key)) groups.set(key, { key, trades: 0, wins: 0, losses: 0, net: 0, fees: 0 });
    const g = groups.get(key);
    g.trades++;
    // `outcome` (set in TradesContext) so scratches stay out of win rate.
    const outcome = t.outcome || t.result;
    if (outcome === 'win') g.wins++;
    else if (outcome === 'loss') g.losses++;
    g.net += Number(t.gainLoss) || 0;
    g.fees += Number(t.fee) || 0;
  };

  trades
    .filter((t) => t.result === 'win' || t.result === 'loss')
    .forEach((t) => {
      const keys = keysOf(t).filter(Boolean);
      if (keys.length === 0) {
        if (untaggedLabel) add(untaggedLabel, t);
        return;
      }
      keys.forEach((k) => add(k, t));
    });

  return [...groups.values()]
    .map((g) => ({
      ...g,
      winRate: (g.wins + g.losses) > 0 ? (g.wins / (g.wins + g.losses)) * 100 : 0,
      avg: g.trades > 0 ? g.net / g.trades : 0,
      isUntagged: g.key === untaggedLabel,
    }))
    .sort((a, b) => (a.isUntagged - b.isUntagged) || (a.net - b.net));
}
