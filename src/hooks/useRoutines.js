import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { periodKey, runId, streakFor } from '../utils/routines';

/**
 * Live routines with this period's progress and streak, plus `toggleStep`.
 * Used by the Routines page and the dashboard's Today panel.
 */
export function useRoutines() {
  const [routines, setRoutines] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => onSnapshot(collection(db, 'routines'), (snap) => {
    setRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoaded(true);
  }, (err) => {
    console.error('Routines listener failed:', err);
    setLoaded(true);
  }), []);

  useEffect(() => onSnapshot(collection(db, 'routineRuns'), (snap) => {
    setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('Routine runs listener failed:', err)), []);

  const withProgress = useMemo(() => {
    const now = new Date();
    return [...routines]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)))
      .map((r) => {
        const steps = Array.isArray(r.steps) ? r.steps : [];
        const key = periodKey(r.cadence, now);
        const current = runs.find((run) => run.id === runId(r.id, key));
        const completedKeys = new Set(
          runs.filter((run) => run.routineId === r.id && run.completedAt).map((run) => run.periodKey)
        );
        const doneSteps = new Set((current?.doneSteps || []).filter((id) => steps.some((s) => s.id === id)));
        return {
          ...r,
          steps,
          periodKey: key,
          doneSteps,
          doneCount: doneSteps.size,
          complete: steps.length > 0 && doneSteps.size === steps.length,
          streak: streakFor(r, completedKeys, now),
        };
      });
  }, [routines, runs]);

  /** Tick or untick a step in this period's run; completion follows the last step. */
  const toggleStep = async (routine, stepId) => {
    const next = new Set(routine.doneSteps);
    if (next.has(stepId)) next.delete(stepId);
    else next.add(stepId);
    const complete = routine.steps.length > 0 && routine.steps.every((s) => next.has(s.id));
    await setDoc(doc(db, 'routineRuns', runId(routine.id, routine.periodKey)), {
      routineId: routine.id,
      periodKey: routine.periodKey,
      doneSteps: [...next],
      // Client time, not serverTimestamp(): a pending server timestamp reads
      // back as null, which would drop the streak until the write confirms.
      completedAt: complete ? new Date() : null,
    }, { merge: true });
  };

  return { routines: withProgress, loaded, toggleStep };
}
