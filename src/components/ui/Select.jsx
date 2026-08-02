import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { usePopoverPosition } from './usePopoverPosition';

/**
 * Themed dropdown replacing native <select>, whose light OS chrome broke the
 * dark theme on every page it appeared.
 *
 * Keyboard model matches a native select closely enough to be unsurprising:
 * Enter/Space/Arrow opens, arrows move the highlight, Enter commits, Escape
 * cancels, Home/End jump, and typing a letter jumps to the next match.
 *
 * `options` is [{ value, label, disabled? }]. Values are compared as strings so
 * numeric option values behave like the native element's.
 */
function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  name,
  className = '',
  buttonClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ term: '', at: 0 });
  const listId = useId();
  const popoverStyle = usePopoverPosition(triggerRef, open);

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return; // list is portalled out
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const openList = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const commit = (index) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
  };

  const step = (from, delta) => {
    const n = options.length;
    if (n === 0) return -1;
    let i = from;
    for (let hops = 0; hops < n; hops += 1) {
      i = (i + delta + n) % n;
      if (!options[i].disabled) return i;
    }
    return from;
  };

  const onKeyDown = (e) => {
    if (disabled) return;

    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // don't also close a surrounding modal
        setOpen(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => step(i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => step(i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(step(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(step(0, -1));
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          const t = typeahead.current;
          t.term = now - t.at > 700 ? e.key : t.term + e.key;
          t.at = now;
          const term = t.term.toLowerCase();
          const found = options.findIndex(
            (o) => !o.disabled && String(o.label).toLowerCase().startsWith(term)
          );
          if (found >= 0) setActiveIndex(found);
        }
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Keeps the value in the DOM for forms that read by name. */}
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface-raised px-3 py-2 text-left text-sm text-content-primary transition-colors hover:border-brand/50 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${buttonClassName}`}
      >
        <span className={`truncate ${selected ? '' : 'text-content-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-content-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && popoverStyle && createPortal(
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          style={popoverStyle}
          className="z-[90] overflow-y-auto rounded-control bg-surface-overlay py-1 shadow-elev-3"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-content-muted">No options</li>
          )}
          {options.map((option, i) => {
            const isSelected = String(option.value) === String(value);
            return (
              <li
                key={`${option.value}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(i);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
                  option.disabled
                    ? 'cursor-not-allowed text-content-muted opacity-50'
                    : i === activeIndex
                      ? 'bg-surface-hover text-content-primary'
                      : 'text-content-secondary'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check size={14} className="shrink-0 text-brand" />}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}

export default Select;
