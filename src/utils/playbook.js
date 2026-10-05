import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const PLAYBOOK_COLLECTION = 'playbookTrades';

/**
 * The PlayBook template: the variables a trade is broken down into at the
 * close. Adapted from the SMB PlayBook for BTC. Stick with it until the habit
 * is built, then individualize it here — every form, card and completeness
 * count reads from this list.
 */
export const PLAYBOOK_SECTIONS = [
  {
    title: 'Why it was in play',
    fields: [
      { id: 'bigPicture', label: 'Big Picture', placeholder: 'HTF trend, risk-on/off, dominance, funding, where BTC sat in the bigger move…' },
      { id: 'catalyst', label: 'Catalyst', placeholder: 'News, data release, ETF flows, liquidation cascade — why this was the move to trade…' },
    ],
  },
  {
    title: 'What you saw',
    fields: [
      { id: 'technicals', label: 'Technical Analysis', placeholder: 'Key levels, structure, pattern, timeframe confluence…' },
      { id: 'tape', label: 'Tape / Order Flow', placeholder: 'Volume, order book, delta, how price acted at the level…' },
      { id: 'intuition', label: 'Intuition', placeholder: 'What experience or gut told you that the chart did not…' },
    ],
  },
  {
    title: 'How it was traded',
    fields: [
      { id: 'entry', label: 'Entry Trigger', placeholder: 'The exact thing that got you in…' },
      { id: 'risk', label: 'Stop / Risk', placeholder: 'Where the idea was wrong, and size relative to that stop…' },
      { id: 'exits', label: 'Exits & Adds', placeholder: 'Reasons to take profit, scale, add or get out…' },
    ],
  },
  {
    title: 'Next time',
    fields: [
      { id: 'improve', label: 'How to Trade It Better', placeholder: 'What would have made this bigger, cleaner or an A+…' },
      { id: 'rules', label: 'When I See This Again', placeholder: 'The variables you will look for in real time, and how you will trade it…' },
    ],
  },
];

export const PLAYBOOK_FIELDS = PLAYBOOK_SECTIONS.flatMap((section) => section.fields);

export const GRADES = ['A+', 'A', 'B', 'C'];

export const completedFieldCount = (entry) =>
  PLAYBOOK_FIELDS.filter((field) => String(entry?.[field.id] || '').trim()).length;

const emptyTemplate = () => Object.fromEntries(PLAYBOOK_FIELDS.map((field) => [field.id, '']));

// The trade's numbers at the time it was added. The live trade wins whenever it
// still exists; this keeps the entry readable if the trade is later deleted.
const tradeSnapshot = (trade) => ({
  ticker: trade.ticker || 'BTC',
  direction: trade.direction || 'long',
  tradeDate: trade.tradeDate || null,
  entryPrice: trade.entryPrice ?? null,
  exitPrice: trade.exitPrice ?? null,
  stopLoss: trade.stopLoss ?? null,
  gainLoss: trade.gainLoss ?? null,
  pnlPercent: trade.pnlPercent ?? null,
  rr: trade.rr ?? null,
  result: trade.result || '',
});

/**
 * A trade you took is keyed by its own id, so it can only be in the playbook
 * once and "is this trade in the playbook" is a single lookup.
 */
export function addTradeToPlaybook(trade) {
  return setDoc(doc(db, PLAYBOOK_COLLECTION, trade.id), {
    source: 'mine',
    tradeId: trade.id,
    trade: tradeSnapshot(trade),
    setupName: trade.strategyName || trade.chartPattern || '',
    grade: '',
    imageUrl: trade.chartImageUrl || '',
    ...emptyTemplate(),
    createdAt: serverTimestamp(),
  });
}

/** A trade you spotted but were not in. */
export function addSpottedTrade(data) {
  return addDoc(collection(db, PLAYBOOK_COLLECTION), {
    source: 'spotted',
    tradeId: null,
    ...emptyTemplate(),
    ...data,
    createdAt: serverTimestamp(),
  });
}

export function updatePlaybookEntry(id, data) {
  return updateDoc(doc(db, PLAYBOOK_COLLECTION, id), { ...data, updatedAt: serverTimestamp() });
}

export function removeFromPlaybook(id) {
  return deleteDoc(doc(db, PLAYBOOK_COLLECTION, id));
}
