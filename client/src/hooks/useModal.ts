import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface UseModalOptions {
  onClose: () => void;
  // Focused once, on mount, via `requestAnimationFrame` — the caller decides
  // which element that is (it differs per modal: search input, first form
  // field, a specific button, ...).
  initialFocusRef: RefObject<HTMLElement | null>;
}

interface UseModalResult {
  visible: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  handleClose: () => void;
  handleBackdropMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

// Shared modal machinery: enter animation, initial focus, focus trap,
// Escape-to-close, backdrop-click-to-close, body-scroll-lock, and
// focus-return-to-trigger-on-close. Mirrors what `AddFoodModal`, `GoalsModal`,
// and `HealthScoreSettingsModal` each used to implement independently — the
// caller still owns all of the actual JSX (backdrop/panel classes, dialog
// aria attributes, and content).
export function useModal({ onClose, initialFocusRef }: UseModalOptions): UseModalResult {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Enter animation + initial focus, run once on mount.
  useEffect(() => {
    triggerRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => setVisible(true));
    const focusFrame = requestAnimationFrame(() => initialFocusRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while the modal is open, restoring whatever value was
  // there before (each modal only ever mounts while open, so this runs
  // exactly once per open/close cycle).
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Escape closes; Tab is trapped within the panel.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleClose() {
    (triggerRef.current as HTMLElement | null)?.focus?.();
    onClose();
  }

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) handleClose();
  }

  return { visible, panelRef, handleClose, handleBackdropMouseDown };
}
