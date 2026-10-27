import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getTradeDate } from './accountMath';
import { rMultiple } from './rMultiple';
import { emotionLabel } from './tradeTags';
import { PLAYBOOK_COLLECTION } from './playbook';
import { postJson } from './weeklyReport';

/**
 * Data the AI coach reads: what you've written down as rules, and a compact
 * copy of your trades. Built in the browser and sent with each request; the
 * server keeps nothing.
 */

const round = (v, dp = 2) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10 ** dp) / 10 ** dp : null);
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > n ? `${t.slice(0, n)}…` : t) : null;
};

/** Live strategies, notes, Playbook entries and settings — the sources of your written rules. */
export function useCoachSources() {
  const [strategies, setStrategies] = useState([]);
  const [notes, setNotes] = useState([]);
  const [playbook, setPlaybook] = useState([]);
  const [settings, setSettings] = useState({});

  useEffect(() => onSnapshot(collection(db, 'strategies'), (s) => setStrategies(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => onSnapshot(collection(db, 'notebookEntries'), (s) => setNotes(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => onSnapshot(collection(db, PLAYBOOK_COLLECTION), (s) => setPlaybook(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => onSnapshot(doc(db, 'settings', 'user'), (s) => setSettings(s.exists() ? s.data() : {})), []);

  return { strategies, notes, playbook, settings };
}

/** Everything you've written that reads as a rule. */
export function buildRules({ strategies, notes, playbook, settings }) {
  return {
    riskSettings: {
      maxRiskPerTradePercentOfAccount: settings.maxRiskPercent ?? null,
      maxTradesPerDay: settings.maxTradesPerDay ?? null,
      maxDailyLossPercent: settings.maxDailyLossPercent ?? null,
    },
    strategies: strategies.map((s) => ({
      name: s.name,
      description: clip(s.description, 1500),
      whatWorked: clip(s.whatWorked, 800),
      lessonsLearned: clip(s.lessonsLearned, 800),
    })),
    // Notes filed as rules, plus anything pinned (pinned notes are the ones
    // shown on the dashboard as "Pinned Playbooks").
    ruleNotes: notes
      .filter((n) => n.category === 'rule' || n.pinned)
      .map((n) => ({ title: n.title, content: clip(n.content, 1500) })),
    playbookSetups: playbook.map((p) => ({
      setup: p.setupName || null,
      grade: p.grade || null,
      entryTrigger: clip(p.entry, 400),
      stopAndRisk: clip(p.risk, 400),
      exits: clip(p.exits, 400),
      whenISeeThisAgain: clip(p.rules, 600),
    })),
  };
}

/** One trade, compact. `ref` is stable per trade so answers can cite it. */
export function compactTrade(t, ref) {
  const r = rMultiple(t);
  return {
    ref,
    date: getTradeDate(t).toISOString().slice(0, 16),
    direction: t.direction,
    outcome: t.outcome || t.result,
    netUsd: round(t.gainLoss),
    pnlPercentOnMargin: round(t.pnlPercent, 1),
    feeUsd: round(t.fee),
    leverage: t.leverage ?? null,
    entry: round(t.entryPrice),
    exit: round(t.exitPrice),
    stop: round(t.stopLoss),
    target: round(t.targetPrice),
    rMultiple: r === null ? null : round(r),
    emotionGoingIn: emotionLabel(t.emotion),
    tags: Array.isArray(t.tags) && t.tags.length ? t.tags : undefined,
    strategy: t.strategyName || undefined,
    pattern: t.chartPattern || undefined,
    executionScore: t.executionScore ?? undefined,
    followedPlan: t.followedPlan || undefined,
    whyEntered: clip(t.entryReason, 200) || undefined,
    comment: clip(t.comment, 200) || undefined,
    lesson: clip(t.reviewNote, 200) || undefined,
  };
}

/**
 * Closed trades oldest → newest with refs T1, T2, …, plus summary figures.
 * Capped at the most recent 600 to keep the request a sensible size.
 */
export function buildCoachContext(trades, sources) {
  const closed = trades
    .filter((t) => t.result === 'win' || t.result === 'loss')
    .sort((a, b) => getTradeDate(a) - getTradeDate(b));
  const refs = closed.map((t, i) => [t, `T${i + 1}`]);
  const recent = refs.slice(-600);

  const wins = closed.filter((t) => t.outcome === 'win').length;
  const losses = closed.filter((t) => t.outcome === 'loss').length;
  const net = closed.reduce((s, t) => s + (Number(t.gainLoss) || 0), 0);
  const fees = closed.reduce((s, t) => s + (Number(t.fee) || 0), 0);

  return {
    today: new Date().toISOString().slice(0, 10),
    stats: {
      closedTrades: closed.length,
      wins,
      losses,
      scratches: closed.length - wins - losses,
      winRatePercent: wins + losses ? round((wins / (wins + losses)) * 100, 1) : null,
      netPnlUsd: round(net),
      totalFeesUsd: round(fees),
      grossBeforeFeesUsd: round(net + fees),
      tradesIncluded: recent.length,
    },
    rules: buildRules(sources),
    trades: recent.map(([t, ref]) => compactTrade(t, ref)),
  };
}

export const askCoach = ({ context, history, question }) => postJson('/api/coach-ask', { context, history, question });
export const checkTradeRules = ({ trade, rules }) => postJson('/api/coach-rule-check', { trade, rules });
