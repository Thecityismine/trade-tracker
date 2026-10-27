/**
 * Routines: recurring checklists (a daily review, a weekend review) with a
 * streak for how many periods in a row they were finished.
 *
 * Firestore:
 *   routines/{id}      { name, cadence: 'daily' | 'weekly', steps: [{ id, text, page }], order }
 *   routineRuns/{routineId}_{periodKey}
 *                      { routineId, periodKey, doneSteps: [stepId], completedAt | null }
 *
 * A run is keyed by period, so ticking a step on Tuesday and another on
 * Thursday of the same week lands on the same weekly run.
 */

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday of the date's week, local time. */
function weekStart(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = s.getDay();
  s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
  return s;
}

export function periodKey(cadence, date = new Date()) {
  return cadence === 'weekly' ? `W${dayKey(weekStart(date))}` : dayKey(date);
}

function previousPeriod(cadence, date) {
  const d = new Date(date);
  d.setDate(d.getDate() - (cadence === 'weekly' ? 7 : 1));
  return d;
}

export const runId = (routineId, key) => `${routineId}_${key}`;

/**
 * Periods in a row with the routine completed. The current period counts if
 * it's done; if it isn't done yet the streak still stands from the period
 * before — it only breaks once a whole period passes unfinished.
 */
export function streakFor(routine, completedKeys, now = new Date()) {
  let cursor = now;
  let streak = 0;
  if (!completedKeys.has(periodKey(routine.cadence, cursor))) cursor = previousPeriod(routine.cadence, cursor);
  while (completedKeys.has(periodKey(routine.cadence, cursor))) {
    streak++;
    cursor = previousPeriod(routine.cadence, cursor);
  }
  return streak;
}

export const newStepId = () => Math.random().toString(36).slice(2, 10);

/** Offered from the empty state — nothing is written until you add them. */
export const STARTER_ROUTINES = [
  {
    name: 'Daily review',
    cadence: 'daily',
    steps: [
      { text: "Review today's trades (emotion, tags, lesson)", page: 'dashboard' },
      { text: 'Write a daily review note', page: 'notebook' },
      { text: "Check today's coach line and trades left", page: 'dashboard' },
    ],
  },
  {
    name: 'Weekend review',
    cadence: 'weekly',
    steps: [
      { text: "Read the week's AI coach review", page: 'weekly' },
      { text: 'Write a weekend review note with a stats snapshot', page: 'notebook' },
      { text: 'Check performance by emotion and tag', page: 'analytics' },
      { text: 'Update the Playbook with the best trade of the week', page: 'playbook' },
    ],
  },
];
