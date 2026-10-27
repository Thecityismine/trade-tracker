import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTrades } from '../context/TradesContext';
import { EMOTIONS, collectTags, normalizeTag } from '../utils/tradeTags';

/** One-pick "how did you feel going in" row. Clicking the selected pill clears it. */
export function EmotionPicker({ value, onChange, locked = false }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Emotion going into the trade">
        {EMOTIONS.map((e) => {
          const selected = value === e.id;
          return (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked && !selected}
              onClick={() => !locked && onChange(selected ? '' : e.id)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                selected
                  ? 'bg-brand text-content-primary'
                  : 'bg-surface-raised border border-line-strong text-content-secondary hover:text-content-primary disabled:opacity-40 disabled:hover:text-content-secondary'
              }`}
            >
              {e.label}
            </button>
          );
        })}
      </div>
      {locked && (
        <p className="text-xs text-content-muted mt-1">Recorded when you opened this position.</p>
      )}
    </div>
  );
}

/**
 * Chip input for free-form tags. Enter or a comma adds one; pasted "a, b, c"
 * becomes three. Tags already used on other trades are offered as one-click
 * suggestions.
 */
export function TagInput({ value, onChange }) {
  const { trades } = useTrades();
  const knownTags = useMemo(() => collectTags(trades), [trades]);
  const [draft, setDraft] = useState('');

  const add = (raw) => {
    const tag = normalizeTag(raw);
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  const addMany = (raws) => {
    const next = [...value];
    raws.map(normalizeTag).forEach((t) => { if (t && !next.includes(t)) next.push(t); });
    if (next.length !== value.length) onChange(next);
  };
  const remove = (tag) => onChange(value.filter((t) => t !== tag));

  const suggestions = knownTags
    .filter((t) => !value.includes(t) && (!draft || t.includes(normalizeTag(draft))))
    .slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-surface-raised px-2 py-2 focus-within:border-brand">
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-full bg-brand-muted px-2.5 py-1 text-xs text-brand-hover">
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove tag ${tag}`}
              className="text-brand-hover/70 hover:text-content-primary"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            // Split on commas here rather than on the keypress, so pasted
            // text splits too.
            const parts = e.target.value.split(',');
            if (parts.length > 1) addMany(parts.slice(0, -1));
            setDraft(parts[parts.length - 1]);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : 'news catalyst, london open, oversized…'}
          aria-label="Add tag"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-content-primary focus:outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs text-content-muted hover:border-line-strong hover:text-content-primary"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-content-muted mt-1">Press Enter or comma to add.</p>
    </div>
  );
}
