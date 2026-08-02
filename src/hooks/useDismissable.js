import { useEffect } from 'react';

/**
 * Escape-to-close for overlays that are not yet built on <Modal>.
 *
 * Registers on keyup so a Select or DateField popover — which closes on keydown
 * and stops propagation — gets first refusal on the same Escape press, rather
 * than one keystroke closing both the dropdown and the dialog behind it.
 *
 * Deliberately does NOT lock body scroll: every page using this already owns a
 * scroll-lock effect covering its modal and lightbox, and a second one would
 * capture `hidden` as the value to restore and leave the page unscrollable.
 */
export function useDismissable(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyUp = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keyup', onKeyUp);
    return () => document.removeEventListener('keyup', onKeyUp);
  }, [isOpen, onClose]);
}

/**
 * Backdrop click handler: closes only when the press starts and ends on the
 * backdrop itself, so a drag that begins inside the panel never dismisses.
 */
export function backdropProps(onClose) {
  return {
    onMouseDown: (e) => {
      if (e.target === e.currentTarget) e.currentTarget.dataset.backdropPress = '1';
    },
    onMouseUp: (e) => {
      const armed = e.currentTarget.dataset.backdropPress === '1';
      delete e.currentTarget.dataset.backdropPress;
      if (armed && e.target === e.currentTarget) onClose?.();
    },
  };
}
