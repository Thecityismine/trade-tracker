import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: Check,
  error: AlertTriangle,
  info: Info,
};

const TONES = {
  success: 'text-profit',
  error: 'text-loss',
  info: 'text-brand',
};

/**
 * Save/delete confirmations. Replaces the inline `statusMessage` green strips
 * that pushed page content down when they appeared.
 *
 * `toast.success('Saved')` from anywhere under the provider.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((message, type = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list, { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    show: push,
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d ?? 6000),
    info: (m, d) => push(m, 'info', d),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
        >
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <div
                key={t.id}
                className="toast-in pointer-events-auto flex items-start gap-2.5 rounded-control bg-surface-overlay px-3.5 py-3 shadow-elev-3"
              >
                <Icon size={16} className={`mt-0.5 shrink-0 ${TONES[t.type] || TONES.info}`} />
                <p className="flex-1 text-sm text-content-primary">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="-mr-1 -mt-0.5 rounded-chip p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/**
 * Safe to call outside a provider — returns no-ops rather than throwing, so a
 * component can be rendered in isolation without wiring one up.
 */
export function useToast() {
  return useContext(ToastContext) ?? {
    show: () => {},
    success: () => {},
    error: () => {},
    info: () => {},
    dismiss: () => {},
  };
}
