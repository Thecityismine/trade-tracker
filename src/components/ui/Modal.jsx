import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Dialog shell for the whole app.
 *
 * Fixes the things the old inline modals got wrong: there is always a titled
 * header with a close button, Escape and backdrop clicks dismiss, the body is
 * capped at 85vh and scrolls internally, and the footer is sticky so the
 * primary action is never pushed below the fold.
 */
function Modal({
  isOpen,
  onClose,
  title,
  description,
  footer,
  children,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  // Move focus into the dialog so Escape and tabbing work immediately.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidth = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-card bg-surface-overlay shadow-elev-3 outline-none sm:max-h-[85vh] sm:rounded-card ${maxWidth}`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-content-primary">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-content-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-control p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Sticky footer */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface-overlay px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
