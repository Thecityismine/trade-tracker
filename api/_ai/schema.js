import { compact, list, num, plain, preview, round, text, toIso, SOURCE_APP } from './serialize.js';

/**
 * The SPA routes on window.location.hash and carries no per-record route, so
 * the deepest honest link is the page that lists the record.
 */
export function appBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

  const host = req?.headers?.host;
  return host ? `https://${host}` : '';
}

const money = (value) => {
  const parsed = num(value);
  if (parsed === null) return null;
  const sign = parsed > 0 ? '+' : parsed < 0 ? '-' : '';
  return `${sign}$${Math.abs(parsed).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function envelope(record, ctx) {
  return {
    id: record.id,
    recordType: COLLECTIONS[ctx.collection].recordType,
    sourceApp: SOURCE_APP,
    collection: ctx.collection,
    url: ctx.base ? `${ctx.base}/#${ctx.page}` : null
  };
}

const trade = (doc, ctx) => {
  const isOpen = doc.status === 'open';
  const result = text(doc.result);
  const pnl = num(doc.gainLoss);
  const ticker = text(doc.ticker) || 'BTC';
  const direction = text(doc.direction) || 'long';

  return compact({
    ...envelope(doc, ctx),
    title: isOpen
      ? `${ticker} ${direction} — open position`
      : `${ticker} ${direction} ${result ? `(${result})` : ''} ${money(pnl) || ''}`.replace(/\s+/g, ' ').trim(),
    status: isOpen ? 'open' : 'closed',
    occurredAt: toIso(doc.tradeDate),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    closedAt: toIso(doc.closedAt),

    ticker,
    direction,
    entryPrice: num(doc.entryPrice),
    exitPrice: num(doc.exitPrice),
    stopLoss: num(doc.stopLoss),
    targetPrice: num(doc.targetPrice),
    leverage: num(doc.leverage),
    result,
    realizedPnlUsd: pnl,
    feesUsd: num(doc.fee),
    pnlPercent: round(doc.pnlPercent),
    riskRewardRatio: round(doc.rr),
    plannedRiskRewardRatio: round(doc.plannedRR),
    executionScore: num(doc.executionScore),
    // Recorded at close against a plan fixed at entry. `planLockedAt` is only
    // present on trades that were opened first, so its absence marks a trade
    // logged after the fact, where any process field was written knowing the
    // outcome.
    followedPlan: text(doc.followedPlan),
    planDeviationNote: text(doc.planDeviationNote),
    planLockedAt: toIso(doc.planLockedAt),
    hadPlanBeforeOutcome: Boolean(doc.planLockedAt),
    currency: 'USD',

    entryReason: text(doc.entryReason),
    comment: text(doc.comment),
    chartPattern: text(doc.chartPattern),
    chartImageUrl: text(doc.chartImageUrl),

    related: compact({ strategyId: text(doc.strategyId), strategyName: text(doc.strategyName) }),
    summary: isOpen
      ? `Open ${direction} on ${ticker} from ${num(doc.entryPrice) ?? 'an unrecorded entry'}${doc.stopLoss ? `, stop ${num(doc.stopLoss)}` : ''}.`
      : `${direction} ${ticker} closed ${result || 'flat'} for ${money(pnl) || 'an unrecorded amount'}${doc.strategyName ? ` on the ${doc.strategyName} setup` : ''}.`
  });
};

const deposit = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: `${doc.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'} ${money(doc.amount) || ''}`.trim(),
    status: 'recorded',
    occurredAt: toIso(doc.date),
    type: text(doc.type) || 'deposit',
    amountUsd: num(doc.amount),
    signedAmountUsd: doc.type === 'withdrawal' ? -Math.abs(num(doc.amount) ?? 0) : num(doc.amount),
    currency: 'USD',
    note: text(doc.note),
    summary: `${doc.type === 'withdrawal' ? 'Withdrew' : 'Deposited'} ${money(Math.abs(num(doc.amount) ?? 0))}.`
  });

const strategy = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: text(doc.name) || 'Untitled strategy',
    status: doc.pinned ? 'pinned' : 'active',
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    name: text(doc.name),
    description: text(doc.description),
    whatWorked: text(doc.whatWorked),
    lessonsLearned: text(doc.lessonsLearned),
    tags: list(doc.tags),
    pinned: Boolean(doc.pinned),
    imageUrls: list(doc.imageUrls),
    summary: preview(doc.description)
  });

const strategyEntry = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: text(doc.title) || 'Untitled entry',
    status: 'recorded',
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    content: text(doc.content),
    imageUrls: list(doc.imageUrls),
    related: compact({ strategyId: text(doc.strategyId) }),
    summary: preview(doc.content)
  });

const journalEntry = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: text(doc.title) || 'Untitled journal entry',
    status: text(doc.result) || 'recorded',
    occurredAt: toIso(doc.tradeDate),
    createdAt: toIso(doc.createdAt),
    ticker: text(doc.ticker),
    result: text(doc.result),
    setupType: text(doc.setupType),
    whyGoodIdea: text(doc.whyGoodIdea),
    whatWentWrong: text(doc.whatWentWrong),
    feedbackForFuture: text(doc.feedbackForFuture),
    nextAction: text(doc.nextAction),
    executionScore: num(doc.executionScore),
    confidenceScore: num(doc.confidenceScore),
    mindsetRating: num(doc.mindsetRating),
    mistakeTag: text(doc.mistakeTag),
    ruleBroken: text(doc.ruleBroken),
    tags: list(doc.tags),
    imageUrl: text(doc.imageUrl),
    summary: preview(doc.whyGoodIdea || doc.whatWentWrong || doc.feedbackForFuture)
  });

const mindsetEntry = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: text(doc.title) || 'Untitled mindset entry',
    status: text(doc.type) || 'recorded',
    createdAt: toIso(doc.createdAt),
    type: text(doc.type),
    session: text(doc.session),
    moodScore: num(doc.mood),
    confidenceScore: num(doc.confidence),
    disciplineScore: num(doc.discipline),
    reflection: text(doc.reflection),
    actionItem: text(doc.actionItem),
    checklist: plain(doc.checklist),
    tags: list(doc.tags),
    summary: preview(doc.reflection)
  });

const notebookEntry = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: text(doc.title) || 'Untitled note',
    status: doc.pinned ? 'pinned' : 'active',
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    category: text(doc.category),
    content: text(doc.content),
    mistakeType: text(doc.mistakeType || doc.mistake_type),
    tags: list(doc.tags),
    pinned: Boolean(doc.pinned),
    imageUrls: list(doc.imageUrls),
    summary: preview(doc.content)
  });

const chartPattern = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: text(doc.name) || 'Untitled pattern',
    status: text(doc.setupQuality) || 'active',
    createdAt: toIso(doc.dateAdded),
    updatedAt: toIso(doc.updatedAt),
    name: text(doc.name),
    description: text(doc.description),
    tradeType: text(doc.tradeType),
    timeframe: text(doc.timeframe),
    setupQuality: text(doc.setupQuality),
    patternBias: text(doc.patternBias),
    checklistItems: list(doc.checklistItems),
    avoidIf: list(doc.avoidIf),
    tags: list(doc.tags),
    imageUrl: text(doc.imageUrl),
    summary: preview(doc.summary || doc.description)
  });

const alarm = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: `${text(doc.label) || 'Alarm'} at ${text(doc.time) || 'unset time'}`,
    status: doc.enabled === false ? 'disabled' : 'enabled',
    label: text(doc.label),
    timeOfDay: text(doc.time),
    days: list(doc.days),
    sound: text(doc.sound),
    enabled: doc.enabled !== false,
    summary: `${text(doc.label) || 'Alarm'} — ${text(doc.time) || 'no time set'}${list(doc.days).length ? ` on ${list(doc.days).join(', ')}` : ''}.`
  });

const weeklyReport = (doc, ctx) =>
  compact({
    ...envelope(doc, ctx),
    title: `Weekly review — ${text(doc.weekLabel) || doc.id}`,
    status: doc.chartError ? 'generated_with_chart_error' : 'generated',
    occurredAt: toIso(doc.generatedAt),
    createdAt: toIso(doc.generatedAt),
    weekKey: text(doc.weekKey) || doc.id,
    weekLabel: text(doc.weekLabel),
    model: text(doc.model),
    report: text(doc.report),
    chartNotes: plain(doc.chartNotes),
    chartError: text(doc.chartError),
    related: compact({ tradeIds: list(doc.tradeIds) }),
    summary: preview(doc.report, 400)
  });

/**
 * The one place that knows what lives in this app. Adding a collection here
 * exposes it through the REST endpoints, the universal search and the MCP
 * tools at once.
 */
export const COLLECTIONS = {
  trades: {
    recordType: 'trade',
    page: 'journal',
    describes:
      'Every logged trade, closed and open. Closed trades carry realized P&L; open positions have no exit price or result yet. realizedPnlUsd is net of fees. hadPlanBeforeOutcome marks trades opened before they were closed, whose stop, target, thesis and planned R:R were fixed in advance — only those support process analysis; on the rest, executionScore was recorded knowing the result.',
    dateField: 'tradeDate',
    searchFields: ['comment', 'entryReason', 'chartPattern', 'strategyName', 'ticker', 'planDeviationNote'],
    map: trade
  },
  deposits: {
    recordType: 'deposit',
    page: 'settings',
    describes:
      'Account funding events. Deposits and withdrawals move the balance without being trading performance.',
    dateField: 'date',
    searchFields: ['note', 'type'],
    map: deposit
  },
  strategies: {
    recordType: 'strategy',
    page: 'strategies',
    describes:
      'Documented setups with their rules, what has worked and lessons learned. Trades link back by strategyId.',
    dateField: 'createdAt',
    searchFields: ['name', 'description', 'whatWorked', 'lessonsLearned', 'tags'],
    map: strategy
  },
  strategyEntries: {
    recordType: 'strategy_entry',
    page: 'strategies',
    describes: 'Long-form notes attached to a strategy, linked by strategyId.',
    dateField: 'createdAt',
    searchFields: ['title', 'content'],
    map: strategyEntry
  },
  tradeJournalEntries: {
    recordType: 'journal_entry',
    page: 'journal',
    describes:
      'Written post-trade reviews: why the idea was good, what went wrong, the mistake tag and the next action.',
    dateField: 'tradeDate',
    searchFields: [
      'title',
      'whyGoodIdea',
      'whatWentWrong',
      'feedbackForFuture',
      'nextAction',
      'mistakeTag',
      'ruleBroken',
      'setupType',
      'tags'
    ],
    map: journalEntry
  },
  mindsetEntries: {
    recordType: 'mindset_entry',
    page: 'mindset',
    describes:
      'Psychological state logs scoring mood, confidence and discipline alongside a written reflection.',
    dateField: 'createdAt',
    searchFields: ['title', 'reflection', 'actionItem', 'session', 'type', 'tags'],
    map: mindsetEntry
  },
  notebookEntries: {
    recordType: 'note',
    page: 'notebook',
    describes: 'Free-form notes, playbooks and recurring-mistake write-ups.',
    dateField: 'createdAt',
    searchFields: ['title', 'content', 'category', 'mistakeType', 'tags'],
    map: notebookEntry
  },
  chartPatterns: {
    recordType: 'chart_pattern',
    page: 'patterns',
    describes:
      'The pattern library: each setup with its checklist, timeframe, bias and the conditions to avoid it.',
    dateField: 'dateAdded',
    searchFields: ['name', 'summary', 'description', 'tradeType', 'timeframe', 'checklistItems', 'avoidIf', 'tags'],
    map: chartPattern
  },
  alarms: {
    recordType: 'alarm',
    page: 'alarms',
    describes: 'Session and routine reminders with their schedule.',
    dateField: null,
    searchFields: ['label'],
    map: alarm
  },
  weeklyReports: {
    recordType: 'weekly_report',
    page: 'weekly',
    describes:
      'AI-generated weekly performance reviews, keyed by the Monday of the week (e.g. "2026-07-27").',
    dateField: 'generatedAt',
    searchFields: ['weekLabel', 'report'],
    map: weeklyReport
  }
};

export const COLLECTION_NAMES = Object.keys(COLLECTIONS);

export function mapRecord(collection, doc, req) {
  const spec = COLLECTIONS[collection];
  const ctx = { collection, page: spec.page, base: appBaseUrl(req) };
  return spec.map(doc, ctx);
}

/** Flattens a record's searchable fields into one lowercase haystack. */
export function searchableText(collection, doc) {
  const fields = COLLECTIONS[collection].searchFields || [];
  return fields
    .map((field) => doc[field])
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'string')
    .join(' \n ')
    .toLowerCase();
}
