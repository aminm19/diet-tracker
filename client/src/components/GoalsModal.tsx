import { Target, WarningCircle, X } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Goals } from "shared";
import { ApiError, updateGoals } from "../lib/api";
import { useModal } from "../hooks/useModal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { IconButton } from "./ui/IconButton";

interface GoalsModalProps {
  goals: Goals | null;
  onClose: () => void;
  onSaved: (goals: Goals) => void;
}

interface FieldConfig {
  key: keyof Goals;
  label: string;
  unit: string;
}

const FIELDS: FieldConfig[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];

// Mounted by the parent only while open (`{goalsModalOpen && <GoalsModal ... />}`)
// so every open is a fresh mount — mirrors `AddFoodModal`'s conventions
// exactly (backdrop/panel styling, focus trap, Escape-to-close, scroll lock).
export function GoalsModal({ goals, onClose, onSaved }: GoalsModalProps) {
  const [values, setValues] = useState<Record<keyof Goals, string>>({
    calories: goals ? String(goals.calories) : "",
    protein: goals ? String(goals.protein) : "",
    carbs: goals ? String(goals.carbs) : "",
    fat: goals ? String(goals.fat) : "",
  });
  // Tracks whether the user has changed any field since mount — guards the
  // re-seed effect below so an in-flight `goals` fetch resolving late never
  // clobbers something the user already typed. A ref (not state) because the
  // re-seed is deferred a frame (see below) and must re-check the *latest*
  // touched status at that point, not the status when the frame was
  // scheduled.
  const touchedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Synchronous double-submit guard: `submitting` state only takes effect
  // once React flushes the re-render, so a second submit fired in the same
  // tick (double-click, Enter+click) could still slip through before the
  // Save button's `disabled` attribute updates. This ref is set immediately.
  const submittingRef = useRef(false);

  const firstInputRef = useRef<HTMLInputElement>(null);
  const { visible, panelRef, handleClose, handleBackdropMouseDown } = useModal({
    onClose,
    initialFocusRef: firstInputRef,
  });

  // `goals` is fetched once by `App` on mount and may still be in flight
  // (null) when this modal is opened. If it resolves to a real value while
  // the modal is still open, re-seed the fields from it — but only if the
  // user hasn't started editing yet, so an in-progress edit is never
  // silently overwritten.
  useEffect(() => {
    if (!goals || touchedRef.current) return;
    // Deferred via `requestAnimationFrame` (mirrors `useModal`'s own
    // post-mount effects) rather than calling `setValues` synchronously here.
    // Re-checks `touchedRef` at execution time, not just when scheduled — the
    // user could start editing during the deferred frame.
    const frame = requestAnimationFrame(() => {
      if (touchedRef.current) return;
      setValues({
        calories: String(goals.calories),
        protein: String(goals.protein),
        carbs: String(goals.carbs),
        fat: String(goals.fat),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [goals]);

  function setField(key: keyof Goals, value: string) {
    touchedRef.current = true;
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;

    const parsed: Partial<Record<keyof Goals, number>> = {};
    for (const field of FIELDS) {
      const raw = values[field.key];
      const num = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(num) || num < 0) {
        setSubmitError(`Enter a non-negative number for ${field.label.toLowerCase()}.`);
        return;
      }
      parsed[field.key] = num;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await updateGoals(parsed as Goals);
      onSaved(saved);
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't save goals. Try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xl transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={handleBackdropMouseDown}
    >
      <Card
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goals-modal-title"
        shadow="modal"
        className={`flex max-h-[85vh] w-full max-w-lg flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        innerClassName="flex min-h-0 flex-1 flex-col p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="goals-modal-title" className="font-display text-xl font-semibold text-ink">
            {goals ? "Edit goals" : "Set goals"}
          </h2>
          <IconButton variant="close" onClick={handleClose} aria-label="Close">
            <X size={18} weight="light" aria-hidden="true" />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-5 flex min-h-0 flex-1 flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((field, index) => (
              <label key={field.key} className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {field.label} ({field.unit})
                </span>
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  type="number"
                  min="0"
                  step="any"
                  value={values[field.key]}
                  onChange={(event) => setField(field.key, event.target.value)}
                  className="rounded-xl bg-black/[0.04] px-3 py-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                />
              </label>
            ))}
          </div>

          {submitError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
              <WarningCircle size={16} weight="light" aria-hidden="true" /> {submitError}
            </p>
          )}

          <div className="mt-auto flex items-center gap-3 pt-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save goals"}
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                <Target size={14} weight="light" aria-hidden="true" />
              </span>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
