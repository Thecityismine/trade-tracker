import { useEffect, useState } from 'react';

const isTypingTarget = (el) =>
  !!el &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Keyboard navigation for a large flat app:
 *   1–9        jump to the nth nav item
 *   g then <k> jump to the item with that shortcut letter
 *   [          toggle the sidebar rail
 * Returns whether the `g` prefix is armed so the UI can hint at it.
 */
export function useNavShortcuts(items, navigate, onToggleRail) {
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    if (!pendingG) return undefined;
    const timer = setTimeout(() => setPendingG(false), 1500);
    return () => clearTimeout(timer);
  }, [pendingG]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (pendingG) {
        setPendingG(false);
        const match = items.find((item) => item.key === key);
        if (match) {
          event.preventDefault();
          navigate(match.id);
        }
        return;
      }

      if (key === 'g') {
        setPendingG(true);
        return;
      }

      if (key === '[') {
        event.preventDefault();
        onToggleRail?.();
        return;
      }

      if (key >= '1' && key <= '9') {
        const target = items[Number(key) - 1];
        if (target) {
          event.preventDefault();
          navigate(target.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, navigate, onToggleRail, pendingG]);

  return pendingG;
}
