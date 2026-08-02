import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePopoverPosition } from './usePopoverPosition';

/**
 * Themed date picker replacing <input type="date">, whose native popup renders
 * in the OS light theme and broke the dark surfaces wherever it appeared.
 *
 * Value is an ISO `YYYY-MM-DD` string, same as the native element, so callers
 * keep working unchanged. Dates are built in local time — parsing "2026-08-02"
 * with `new Date()` would treat it as UTC and can land on the previous day.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fromISO = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function DateField({ value, onChange, name, disabled = false, className = '', placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => fromISO(value), [value]);
  const [cursor, setCursor] = useState(() => selected || new Date());
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  // Portalled to <body> so the calendar is not clipped by the modal's scroll area.
  const popoverStyle = usePopoverPosition(triggerRef, open, { width: 268, estimatedHeight: 320 });

  useEffect(() => {
    if (selected) setCursor(selected);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // don't also close a surrounding modal
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const today = new Date();

  // Leading blanks so the 1st lands under the right weekday.
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out = Array.from({ length: firstWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) out.push(new Date(year, month, d));
    return out;
  }, [cursor]);

  const pick = (date) => {
    onChange?.(toISO(date));
    setOpen(false);
  };

  const shiftMonth = (delta) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const label = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface-raised px-3 py-2 text-left text-sm text-content-primary transition-colors hover:border-brand/50 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? '' : 'text-content-muted'}>{label}</span>
        <CalendarDays size={15} className="shrink-0 text-content-muted" />
      </button>

      {open && popoverStyle && createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="z-[90] overflow-y-auto rounded-control bg-surface-overlay p-3 shadow-elev-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-chip p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-content-primary">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-chip p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="py-1 text-center text-[11px] font-medium text-content-muted">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((date, i) =>
              date ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(date)}
                  className={`tabular h-8 rounded-chip text-sm transition-colors ${
                    sameDay(date, selected)
                      ? 'bg-brand font-medium text-white'
                      : sameDay(date, today)
                        ? 'text-brand hover:bg-surface-hover'
                        : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                  }`}
                >
                  {date.getDate()}
                </button>
              ) : (
                <div key={i} />
              )
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="rounded-chip px-2 py-1 text-xs text-brand transition-colors hover:bg-surface-hover"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-chip px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default DateField;
