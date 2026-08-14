import { auth } from '../config/firebase';
import { shrinkImageDataUrl } from './imageUpload';

export const MAX_REPORT_CHARTS = 6;

const toDate = (value) => {
  if (!value) return null;
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Stable per-week document id, e.g. "2026-07-27" for the Monday of that week. */
export const weekKeyFor = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dayLabel = (date) =>
  date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'unknown date';

const inRange = (date, start, end) => date && date >= start && date <= end;

const round = (value, places = 2) => {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(places)) : null;
};

/** Assigns short refs (T1, T2, …) in chronological order so the model can cite trades cheaply. */
export const buildTradeRefs = (trades) => {
  const sorted = [...trades].sort((a, b) => {
    const da = toDate(a.tradeDate);
    const db = toDate(b.tradeDate);
    return (da?.getTime() || 0) - (db?.getTime() || 0);
  });

  const byRef = new Map();
  const refById = new Map();

  sorted.forEach((trade, index) => {
    const ref = `T${index + 1}`;
    byRef.set(ref, trade);
    refById.set(trade.id, ref);
  });

  return { ordered: sorted, byRef, refById };
};

export function buildReportPayload({ week, strategies, journalEntries, mindsetEntries, priorReports }) {
  const { ordered, refById } = buildTradeRefs(week.trades);
  const weekEnd = new Date(week.endDate);
  weekEnd.setHours(23, 59, 59, 999);

  const usedStrategyIds = new Set(ordered.map((t) => t.strategyId).filter(Boolean));

  return {
    weekLabel: week.weekLabel,
    stats: {
      wins: week.wins,
      losses: week.losses,
      winRatePercent: round(week.winRate),
      netPnlUsd: round(week.pnl),
      weeklyReturnPercent: week.pnlPercent === null ? null : round(week.pnlPercent),
      feesUsd: round(week.fees),
      avgWinPercent: round(week.avgWin),
      avgLossPercent: round(week.avgLoss),
      expectancyPercent: round(week.expectancy),
      profitFactor: round(week.profitFactor)
    },
    trades: ordered.map((trade) => ({
      ref: refById.get(trade.id),
      day: dayLabel(toDate(trade.tradeDate)),
      ticker: trade.ticker || 'BTC',
      direction: trade.direction,
      result: trade.result,
      entryPrice: round(trade.entryPrice),
      exitPrice: round(trade.exitPrice),
      stopLoss: round(trade.stopLoss),
      plannedRR: round(trade.rr),
      leverage: trade.leverage,
      pnlPercent: round(trade.pnlPercent),
      netUsd: round(trade.gainLoss),
      feeUsd: round(trade.fee),
      selfRatedExecution: trade.executionScore ?? null,
      chartPattern: trade.chartPattern || null,
      strategy: trade.strategyName || null,
      comment: trade.comment || null,
      hasChartScreenshot: Boolean(trade.chartImageUrl)
    })),
    strategies: (strategies || [])
      .filter((s) => usedStrategyIds.has(s.id) || s.pinned)
      .map((s) => ({
        name: s.name,
        description: s.description || null,
        whatWorked: s.whatWorked || null,
        lessonsLearned: s.lessonsLearned || null
      })),
    journalEntries: (journalEntries || [])
      .filter((entry) => inRange(toDate(entry.tradeDate) || toDate(entry.createdAt), week.startDate, weekEnd))
      .map((entry) => ({
        day: dayLabel(toDate(entry.tradeDate) || toDate(entry.createdAt)),
        title: entry.title || null,
        ticker: entry.ticker || null,
        result: entry.result || null,
        setupType: entry.setupType || null,
        whyGoodIdea: entry.whyGoodIdea || null,
        whatWentWrong: entry.whatWentWrong || null,
        feedbackForFuture: entry.feedbackForFuture || null,
        nextAction: entry.nextAction || null,
        mistakeTag: entry.mistakeTag || null,
        ruleBroken: entry.ruleBroken || null,
        selfRatedExecution: entry.executionScore ?? null,
        confidence: entry.confidenceScore ?? null,
        mindsetRating: entry.mindsetRating ?? null
      })),
    mindsetEntries: (mindsetEntries || [])
      .filter((entry) => inRange(toDate(entry.createdAt), week.startDate, weekEnd))
      .map((entry) => ({
        day: dayLabel(toDate(entry.createdAt)),
        title: entry.title || null,
        type: entry.type || null,
        mood: entry.mood ?? null,
        confidence: entry.confidence ?? null,
        discipline: entry.discipline ?? null,
        reflection: entry.reflection || null,
        actionItem: entry.actionItem || null,
        checklist: entry.checklist || null
      })),
    priorCommitments: (priorReports || []).map((prior) => ({
      weekLabel: prior.weekLabel,
      commitments: prior.report?.commitments || []
    }))
  };
}

/**
 * Picks the charts worth spending vision tokens on: every loss first (biggest
 * first), then the largest wins, capped at MAX_REPORT_CHARTS.
 */
export async function buildChartPayload({ week }) {
  const { ordered, refById } = buildTradeRefs(week.trades);
  const withCharts = ordered.filter((t) => t.chartImageUrl);

  const losses = withCharts
    .filter((t) => t.result === 'loss')
    .sort((a, b) => (a.gainLoss || 0) - (b.gainLoss || 0));
  const wins = withCharts
    .filter((t) => t.result !== 'loss')
    .sort((a, b) => (b.gainLoss || 0) - (a.gainLoss || 0));

  const selected = [...losses, ...wins].slice(0, MAX_REPORT_CHARTS);

  const charts = [];
  for (const trade of selected) {
    const summary = [
      `${(trade.direction || '').toUpperCase()} ${trade.ticker || 'BTC'} at ${trade.leverage || 1}x`,
      `entry ${trade.entryPrice ?? '?'}`,
      `exit ${trade.exitPrice ?? '?'}`,
      `stop ${trade.stopLoss ?? 'none recorded'}`,
      `${trade.result === 'loss' ? 'LOSS' : 'WIN'} ${round(trade.pnlPercent) ?? '?'}%`,
      trade.comment ? `My note: "${trade.comment}"` : null
    ]
      .filter(Boolean)
      .join(', ');

    const chart = { ref: refById.get(trade.id), summary };

    if (trade.chartImageUrl.startsWith('data:')) {
      try {
        chart.dataUrl = await shrinkImageDataUrl(trade.chartImageUrl);
      } catch {
        continue;
      }
    } else {
      chart.url = trade.chartImageUrl;
    }

    charts.push(chart);
  }

  return { weekLabel: week.weekLabel, charts };
}

async function postJson(path, body) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You need to be signed in to generate a report.');
  }

  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

export const requestWeeklyReport = (payload) => postJson('/api/weekly-report', payload);
export const requestChartNotes = (payload) => postJson('/api/weekly-report-charts', payload);

const MARKDOWN_VERDICTS = {
  kept: 'Kept',
  partial: 'Partial',
  broken: 'Broken',
  no_data: 'Not tested'
};

function refLabels(refs, tradesByRef) {
  if (!refs?.length) return null;
  return refs
    .map((ref) => {
      const trade = tradesByRef?.get(ref);
      return trade ? `${ref} · ${trade.ticker || 'BTC'} ${(trade.direction || '').toUpperCase()}` : ref;
    })
    .join(', ');
}

/**
 * Flattens a stored report doc into Notion-friendly markdown. Indented bullets
 * paste as nested bullets, so detail lines stay attached to their claim.
 */
export function reportToMarkdown(reportDoc, tradesByRef) {
  const report = reportDoc?.report || {};
  const lines = [];

  lines.push(`# Coach Review — ${reportDoc?.weekLabel || 'Week'}`, '');

  if (report.grade || report.headline) {
    lines.push(`**Grade ${report.grade || '—'}** — ${report.headline || ''}`.trim());
    if (report.gradeReason) lines.push('', report.gradeReason);
    lines.push('');
  }

  if (report.lastWeekReview?.length) {
    lines.push('## Last week you committed to', '');
    report.lastWeekReview.forEach((item) => {
      lines.push(`- **${MARKDOWN_VERDICTS[item.verdict] || item.verdict}** — ${item.commitment}`);
      if (item.evidence) lines.push(`    - ${item.evidence}`);
    });
    lines.push('');
  }

  const claimSection = (title, items) => {
    if (!items?.length) return;
    lines.push(`## ${title}`, '');
    items.forEach((item) => {
      lines.push(`- **${item.claim}**${item.severity ? ` (${item.severity})` : ''}`);
      if (item.detail) lines.push(`    - ${item.detail}`);
      const refs = refLabels(item.tradeRefs, tradesByRef);
      if (refs) lines.push(`    - Trades: ${refs}`);
    });
    lines.push('');
  };

  claimSection('What broke', report.whatBroke);
  claimSection('What worked', report.whatWorked);

  if (reportDoc?.chartNotes?.length) {
    lines.push('## Chart review', '');
    reportDoc.chartNotes.forEach((note) => {
      const trade = tradesByRef?.get(note.ref);
      const label = trade
        ? `${note.ref} · ${trade.ticker || 'BTC'} ${(trade.direction || '').toUpperCase()}`
        : note.ref;
      lines.push(`- **${label}** — ${note.verdict}`);
      if (note.setup) lines.push(`    - Setup — ${note.setup}`);
      if (note.execution) lines.push(`    - Execution — ${note.execution}`);
    });
    lines.push('');
  }

  if (report.commitments?.length) {
    lines.push('## Commit to this next week', '');
    report.commitments.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.commitment}`);
      if (item.measurable) lines.push(`    - Checked by: ${item.measurable}`);
    });
    lines.push('');
  }

  const generatedAt = reportDoc?.generatedAt?.toDate?.();
  if (generatedAt) {
    lines.push('---', '');
    lines.push(
      `Generated ${generatedAt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}`
    );
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
