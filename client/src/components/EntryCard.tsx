import { CaretDown, PencilSimple, Trash, X } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import type { LogEntry, LogUnit } from "shared";
import { ApiError, deleteLog, updateLog } from "../lib/api";
import type { EnrichedEntry } from "../hooks/useDailyLog";

interface EntryCardProps {
  entry: EnrichedEntry;
  index: number;
  onUpdated: (entry: LogEntry) => void;
  onDeleted: (id: number) => void;
}

type Mode = "view" | "edit" | "confirm-delete";

const ICON_BUTTON_CLASSES =
  "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const PILL_BUTTON_CLASSES =
  "rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50";

export function EntryCard({ entry, index, onUpdated, onDeleted }: EntryCardProps) {
  const [mounted, setMounted] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [amount, setAmount] = useState(String(entry.amount));
  const [unit, setUnit] = useState<LogUnit>(entry.unit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const canUseServing = entry.food?.servingSize != null;

  function startEdit() {
    setAmount(String(entry.amount));
    setUnit(entry.unit);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setError(null);
    setMode("view");
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateLog(entry.id, { amount: parsedAmount, unit });
      onUpdated(updated);
      setMode("view");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteLog(entry.id);
      setRemoving(true);
    } catch (err) {
      setDeleting(false);
      setError(err instanceof ApiError ? err.message : "Couldn't delete this entry. Try again.");
      setMode("view");
    }
  }

  const foodName = entry.food?.name ?? "Unknown food";
  const brand = entry.food?.brand;

  return (
    <div
      className={`transition-all ease-[cubic-bezier(0.32,0.72,0,1)] ${
        removing ? "duration-[400ms] opacity-0 scale-95" : "duration-500"
      } ${mounted && !removing ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
      style={{ transitionDelay: mounted && !removing ? `${Math.min(index, 10) * 50}ms` : "0ms" }}
      onTransitionEnd={(event) => {
        if (removing && event.propertyName === "opacity") onDeleted(entry.id);
      }}
    >
      <div className="rounded-2xl bg-black/[0.03] p-1.5 ring-1 ring-black/5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)]">
        <div className="rounded-[calc(1rem-0.25rem)] bg-white p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:p-5">
          {mode === "edit" ? (
            <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-lg font-semibold text-ink">{foodName}</p>
                {brand && <p className="text-sm text-muted">{brand}</p>}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Amount
                  </span>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-28 rounded-xl bg-black/[0.04] px-3 py-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    autoFocus
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Unit
                  </span>
                  <div className="relative">
                    <select
                      value={unit}
                      onChange={(event) => setUnit(event.target.value as LogUnit)}
                      className="appearance-none rounded-xl bg-black/[0.04] py-2 pl-3 pr-8 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    >
                      <option value="g">g</option>
                      <option value="oz">oz</option>
                      <option value="serving" disabled={!canUseServing}>
                        serving
                      </option>
                    </select>
                    <CaretDown
                      size={12}
                      weight="light"
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                  </div>
                </label>

                <button type="submit" disabled={saving} className={`${PILL_BUTTON_CLASSES} bg-ink text-white`}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className={`${PILL_BUTTON_CLASSES} bg-black/[0.05] text-ink hover:bg-black/[0.08]`}
                >
                  Cancel
                </button>
              </div>

              {!canUseServing && (
                <p className="text-xs text-muted">This food has no serving size on record.</p>
              )}
              {error && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="truncate font-display text-lg font-semibold text-ink">{foodName}</p>
                  {brand && <p className="truncate text-sm text-muted">{brand}</p>}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {entry.amount} {entry.unit}
                  {entry.unit === "serving" ? (entry.amount === 1 ? "" : "s") : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted">
                  <span>{Math.round(entry.calories)} kcal</span>
                  <span>{Math.round(entry.protein)}g protein</span>
                  <span>{Math.round(entry.carbs)}g carbs</span>
                  <span>{Math.round(entry.fat)}g fat</span>
                </div>
                {error && (
                  <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {mode === "confirm-delete" ? (
                  <>
                    <span className="mr-1 text-xs font-medium text-muted">Delete?</span>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={deleting}
                      aria-label="Confirm delete"
                      className={`${ICON_BUTTON_CLASSES} bg-red-600/10 text-red-600 hover:bg-red-600/15`}
                    >
                      <Trash size={18} weight="fill" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("view")}
                      disabled={deleting}
                      aria-label="Cancel delete"
                      className={`${ICON_BUTTON_CLASSES} bg-black/[0.05] text-ink hover:bg-black/[0.08]`}
                    >
                      <X size={18} weight="light" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={startEdit}
                      aria-label={`Edit ${foodName}`}
                      className={`${ICON_BUTTON_CLASSES} bg-black/[0.05] text-ink hover:bg-black/[0.08]`}
                    >
                      <PencilSimple size={18} weight="light" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("confirm-delete")}
                      aria-label={`Delete ${foodName}`}
                      className={`${ICON_BUTTON_CLASSES} bg-black/[0.05] text-ink hover:bg-red-600/10 hover:text-red-600`}
                    >
                      <Trash size={18} weight="light" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
