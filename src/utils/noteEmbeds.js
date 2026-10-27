import { getTradeDate } from './accountMath';
import { rMultiple } from './rMultiple';
import { emotionLabel } from './tradeTags';

/**
 * Markdown blocks the Notebook editor can drop into a note. Each is frozen at
 * the moment it is inserted — a stats snapshot records where you stood that
 * day, which is the point of keeping it in a journal — and stays editable
 * like any other text.
 */

const money = (v) => `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(2)}`;
const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function periodStart(id, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (id) {
    case 'week': {
      const dow = today.getDay();
      today.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      return today;
    }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    default: return null;
  }
}

function row(label, list) {
  const wins = list.filter((t) => t.outcome === 'win').length;
  const losses = list.filter((t) => t.outcome === 'loss').length;
  const scratches = list.length - wins - losses;
  const net = list.reduce((s, t) => s + (Number(t.gainLoss) || 0), 0);
  const fees = list.reduce((s, t) => s + (Number(t.fee) || 0), 0);
  const decided = wins + losses;
  const wr = decided ? `${((wins / decided) * 100).toFixed(0)}%` : '--';
  const record = `${wins}W / ${losses}L${scratches ? ` / ${scratches}S` : ''}`;
  return `| ${label} | ${list.length} | ${record} | ${wr} | ${money(net)} | -$${fees.toFixed(2)} |`;
}

/** Week, month, year-to-date and all-time numbers as they stand right now. */
export function statsSnapshot(trades, now = new Date()) {
  const closed = trades.filter((t) => t.result === 'win' || t.result === 'loss');
  const since = (id) => {
    const start = periodStart(id, now);
    return closed.filter((t) => !start || getTradeDate(t) >= start);
  };
  const lastTen = [...closed]
    .sort((a, b) => getTradeDate(a) - getTradeDate(b))
    .slice(-10)
    .map((t) => (t.outcome === 'win' ? 'W' : t.outcome === 'loss' ? 'L' : 'S'))
    .join(' ');

  return [
    `### Stats snapshot · ${fmtDate(now)}`,
    '',
    '| Period | Trades | Record | Win rate | Net P&L | Fees |',
    '| --- | ---: | --- | ---: | ---: | ---: |',
    row('This week', since('week')),
    row('This month', since('month')),
    row('Year to date', since('ytd')),
    row('All time', since('all')),
    '',
    `Last 10 trades (oldest → newest): **${lastTen || '--'}**`,
    '',
  ].join('\n');
}

/** One trade as a quoted card. */
export function tradeCard(trade) {
  const d = getTradeDate(trade);
  const pnl = Number(trade.gainLoss) || 0;
  const r = rMultiple(trade);
  const word = trade.outcome === 'scratch' ? 'Scratch' : trade.result === 'win' ? 'Win' : 'Loss';
  const pct = Number.isFinite(Number(trade.pnlPercent)) ? ` (${Number(trade.pnlPercent).toFixed(1)}%)` : '';
  const lines = [
    `> **${trade.ticker || 'BTC'} ${trade.direction === 'short' ? 'Short' : 'Long'} · ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}**`,
    `> ${word} ${money(pnl)}${pct} · fee $${(Number(trade.fee) || 0).toFixed(2)}${r !== null ? ` · ${r >= 0 ? '+' : ''}${r.toFixed(2)}R` : ''}`,
    `> Entry ${trade.entryPrice ?? '--'} → Exit ${trade.exitPrice ?? '--'}${trade.stopLoss ? ` · Stop ${trade.stopLoss}` : ''}`,
  ];
  const felt = emotionLabel(trade.emotion);
  const tags = Array.isArray(trade.tags) && trade.tags.length ? trade.tags.join(', ') : null;
  if (felt || tags) lines.push(`> ${[felt && `Felt: ${felt}`, tags && `Tags: ${tags}`].filter(Boolean).join(' · ')}`);
  if (trade.entryReason) lines.push(`> Why: ${trade.entryReason.replace(/\n+/g, ' ')}`);
  if (trade.reviewNote) lines.push(`> Lesson: ${trade.reviewNote.replace(/\n+/g, ' ')}`);
  return `${lines.join('\n')}\n\n`;
}

export const NOTE_TEMPLATES = [
  {
    id: 'premarket',
    label: 'Pre-market',
    title: (d) => `Pre-market · ${fmtDate(d)}`,
    body: [
      '## Market context',
      '- BTC bias (HTF):',
      '- Key levels above:',
      '- Key levels below:',
      '- News / events today:',
      '',
      '## Plan',
      '- Setups I will take:',
      '- What invalidates my bias:',
      '- Max trades today:',
      '',
      '## State of mind',
      '- Sleep / energy:',
      '- Anything pulling at my focus:',
      '',
    ].join('\n'),
  },
  {
    id: 'daily',
    label: 'Daily review',
    title: (d) => `Daily review · ${fmtDate(d)}`,
    body: [
      '## What happened',
      '',
      '## Did I follow my plan?',
      '',
      '## Best decision today',
      '',
      '## Worst decision today',
      '',
      '## One thing to do differently tomorrow',
      '',
    ].join('\n'),
  },
  {
    id: 'weekend',
    label: 'Weekend review',
    title: (d) => `Weekend review · ${fmtDate(d)}`,
    body: [
      '## The week in numbers',
      '_Insert a stats snapshot here._',
      '',
      '## Best trades and why they worked',
      '',
      '## Worst trades and what they had in common',
      '',
      '## Rules I broke',
      '',
      '## Focus for next week',
      '',
    ].join('\n'),
  },
];
