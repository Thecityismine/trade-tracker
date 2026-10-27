import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { ArrowUpRight, Check, Flame, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../config/firebase';
import Page from '../components/ui/Page';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useRoutines } from '../hooks/useRoutines';
import { NAV_GROUPS } from '../config/nav';
import { STARTER_ROUTINES, newStepId } from '../utils/routines';

const PAGES = NAV_GROUPS.flatMap((g) => g.items).filter((p) => p.id !== 'routines');
const PAGE_OPTIONS = [{ value: '', label: 'No link' }, ...PAGES.map((p) => ({ value: p.id, label: p.label }))];
const pageLabel = (id) => PAGES.find((p) => p.id === id)?.label;

function RoutineCard({ routine, onToggle, onEdit, onNavigate }) {
  const pct = routine.steps.length ? (routine.doneCount / routine.steps.length) * 100 : 0;
  return (
    <div className={`card-glow ${routine.complete ? 'glow-profit' : 'glow-brand'} rounded-card bg-surface p-5 shadow-elev-1`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-content-primary">{routine.name}</h3>
          <p className="text-xs text-content-muted">
            {routine.cadence === 'weekly' ? 'Weekly' : 'Daily'} · {routine.doneCount}/{routine.steps.length} done
            {routine.cadence === 'weekly' ? ' this week' : ' today'}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              routine.streak > 0 ? 'bg-warn-soft text-warn' : 'bg-white/[0.04] text-content-muted'
            }`}
            title={`${routine.streak} ${routine.cadence === 'weekly' ? 'week' : 'day'}${routine.streak === 1 ? '' : 's'} in a row`}
          >
            <Flame size={13} aria-hidden="true" /> {routine.streak}
          </span>
          <button
            type="button"
            onClick={() => onEdit(routine)}
            className="rounded-control p-1.5 text-content-muted hover:bg-surface-hover hover:text-content-primary"
            aria-label={`Edit ${routine.name}`}
          >
            <Pencil size={15} />
          </button>
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${routine.complete ? 'bg-profit' : 'bg-brand'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-1">
        {routine.steps.map((step) => {
          const done = routine.doneSteps.has(step.id);
          return (
            <li key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                onClick={() => onToggle(routine, step.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-hover"
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                    done ? 'border-profit bg-profit text-canvas' : 'border-line-strong'
                  }`}
                >
                  {done && <Check size={13} strokeWidth={3} />}
                </span>
                <span className={`text-sm ${done ? 'text-content-muted line-through' : 'text-content-primary'}`}>{step.text}</span>
              </button>
              {step.page && pageLabel(step.page) && (
                <button
                  type="button"
                  onClick={() => onNavigate?.(step.page)}
                  className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-control px-2 py-1 text-xs text-brand-hover hover:bg-brand-muted"
                >
                  {pageLabel(step.page)} <ArrowUpRight size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {routine.complete && (
        <p className="mt-3 text-xs text-profit">
          Done {routine.cadence === 'weekly' ? 'for this week' : 'for today'}. Streak: {routine.streak}.
        </p>
      )}
    </div>
  );
}

function RoutineEditor({ routine, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(routine?.name || '');
  const [cadence, setCadence] = useState(routine?.cadence || 'daily');
  const [steps, setSteps] = useState(
    routine?.steps?.length ? routine.steps : [{ id: newStepId(), text: '', page: '' }]
  );
  const [saving, setSaving] = useState(false);
  const isNew = !routine?.id;

  const updateStep = (id, patch) => setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const cleanSteps = steps.map((s) => ({ id: s.id, text: s.text.trim(), page: s.page || '' })).filter((s) => s.text);

  const save = async () => {
    if (!name.trim() || cleanSteps.length === 0) {
      toast.error('Give the routine a name and at least one step.');
      return;
    }
    setSaving(true);
    try {
      const data = { name: name.trim(), cadence, steps: cleanSteps };
      if (isNew) await addDoc(collection(db, 'routines'), { ...data, order: Date.now() });
      else await updateDoc(doc(db, 'routines', routine.id), data);
      onClose();
    } catch (err) {
      console.error('Error saving routine:', err);
      toast.error('Could not save the routine.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${routine.name}"? Its streak history stays but won't show.`)) return;
    await deleteDoc(doc(db, 'routines', routine.id));
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isNew ? 'New routine' : 'Edit routine'}
      size="lg"
      footer={
        <>
          {!isNew && (
            <Button variant="destructive" icon={Trash2} onClick={remove} className="mr-auto">Delete</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <div>
            <label htmlFor="routine-name" className="mb-1 block text-xs text-content-secondary">Name</label>
            <input
              id="routine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily review"
              className="w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-content-primary focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-content-secondary">Repeats</label>
            <Select
              value={cadence}
              onChange={setCadence}
              options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }]}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-content-secondary">Steps</p>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={step.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="w-5 text-right text-xs text-content-muted">{i + 1}.</span>
                <input
                  value={step.text}
                  onChange={(e) => updateStep(step.id, { text: e.target.value })}
                  placeholder="Review today's trades"
                  aria-label={`Step ${i + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content-primary focus:border-brand focus:outline-none"
                />
                <Select
                  className="w-36"
                  value={step.page || ''}
                  onChange={(page) => updateStep(step.id, { page })}
                  options={PAGE_OPTIONS}
                />
                <button
                  type="button"
                  onClick={() => setSteps((list) => list.filter((s) => s.id !== step.id))}
                  className="rounded-control p-2 text-content-muted hover:bg-surface-hover hover:text-loss"
                  aria-label={`Remove step ${i + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            className="mt-2"
            onClick={() => setSteps((list) => [...list, { id: newStepId(), text: '', page: '' }])}
          >
            Add step
          </Button>
          <p className="mt-1 text-xs text-content-muted">Link a step to a page to jump straight there from the checklist.</p>
        </div>
      </div>
    </Modal>
  );
}

function Routines({ onNavigate }) {
  const { routines, loaded, toggleStep } = useRoutines();
  const toast = useToast();
  const [editing, setEditing] = useState(null); // null | {} (new) | routine
  const [adding, setAdding] = useState(false);

  const addStarters = async () => {
    setAdding(true);
    try {
      await Promise.all(STARTER_ROUTINES.map((r, i) => addDoc(collection(db, 'routines'), {
        name: r.name,
        cadence: r.cadence,
        steps: r.steps.map((s) => ({ ...s, id: newStepId() })),
        order: i,
      })));
    } catch (err) {
      console.error('Error adding starter routines:', err);
      toast.error('Could not add the starter routines.');
    } finally {
      setAdding(false);
    }
  };

  const onToggle = (routine, stepId) => toggleStep(routine, stepId).catch((err) => {
    console.error('Error updating routine:', err);
    toast.error('Could not save that. Check your connection.');
  });

  return (
    <Page actions={<Button icon={Plus} onClick={() => setEditing({})}>New routine</Button>}>
      {!loaded ? (
        <p className="text-sm text-content-muted">Loading routines…</p>
      ) : routines.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Build the review habit"
          description="A routine is a short checklist you run every day or week. Finish every step to keep its streak alive."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={addStarters} disabled={adding}>{adding ? 'Adding…' : 'Add starter routines'}</Button>
              <Button variant="secondary" onClick={() => setEditing({})}>Start from scratch</Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5 2xl:grid-cols-3">
          {routines.map((r) => (
            <RoutineCard key={r.id} routine={r} onToggle={onToggle} onEdit={setEditing} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {editing && <RoutineEditor routine={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </Page>
  );
}

export default Routines;
