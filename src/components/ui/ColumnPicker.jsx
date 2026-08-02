import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Columns } from 'lucide-react';
import { usePopoverPosition } from './usePopoverPosition';

/**
 * Show/hide toggles for a dense table's secondary columns. Weekly carries
 * eleven numeric columns; most sessions only need four or five.
 *
 * `columns` is [{ id, label, locked? }] — locked columns cannot be hidden.
 * Selection is persisted per `storageKey`.
 */
export function useVisibleColumns(storageKey, columns, defaultHidden = []) {
  const [hidden, setHidden] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved));
    } catch {
      /* fall through to defaults */
    }
    return new Set(defaultHidden);
  });

  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — selection is session-only */
      }
      return next;
    });

  const reset = () => {
    setHidden(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* no-op */
    }
  };

  return { hidden, isVisible: (id) => !hidden.has(id), toggle, reset };
}

function ColumnPicker({ columns, hidden, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const style = usePopoverPosition(triggerRef, open, { width: 220, estimatedHeight: 320 });

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hiddenCount = hidden.size;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
      >
        <Columns size={14} />
        Columns
        {hiddenCount > 0 && (
          <span className="rounded-chip bg-brand-muted px-1.5 text-[10px] text-brand">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open && style && createPortal(
        <div
          ref={panelRef}
          style={style}
          className="z-[90] overflow-y-auto rounded-control bg-surface-overlay p-2 shadow-elev-3"
        >
          {columns.map((col) => {
            const visible = !hidden.has(col.id);
            return (
              <label
                key={col.id}
                className={`flex items-center gap-2 rounded-chip px-2 py-1.5 text-sm ${
                  col.locked
                    ? 'cursor-not-allowed text-content-muted'
                    : 'cursor-pointer text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={col.locked}
                  onChange={() => onToggle(col.id)}
                  className="accent-brand"
                />
                <span className="truncate">{col.label}</span>
              </label>
            );
          })}
          <button
            type="button"
            onClick={onReset}
            className="mt-1 w-full rounded-chip border-t border-line px-2 py-1.5 text-left text-xs text-brand transition-colors hover:bg-surface-hover"
          >
            Show all
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default ColumnPicker;
