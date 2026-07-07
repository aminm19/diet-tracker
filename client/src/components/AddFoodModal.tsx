import { MagnifyingGlass, Plus, WarningCircle, X } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Food, LogEntry, LogUnit } from "shared";
import { ApiError, createLog, searchFoods } from "../lib/api";

interface AddFoodModalProps {
  date: string;
  onClose: () => void;
  onAdded: (entry: LogEntry, food: Food) => void;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Mounted by the parent only while open (`{modalOpen && <AddFoodModal ... />}`)
// so every open is a fresh mount — state starts at its initial values with
// no manual "reset on open" effect needed.
export function AddFoodModal({ date, onClose, onAdded }: AddFoodModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searchStatus, setSearchStatus] = useState<"loading" | "success" | "error">("success");
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState<LogUnit>("g");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [visible, setVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Enter animation + initial focus, run once on mount.
  useEffect(() => {
    triggerRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => setVisible(true));
    const focusFrame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
    };
  }, []);

  // Lock body scroll while the modal is open, restoring whatever value was
  // there before (this component only ever mounts while open, so this runs
  // exactly once per open/close cycle).
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Debounced search (~300ms). An empty query is treated as "nothing to
  // search yet" directly from `query` at render time below, rather than
  // stored in state, so this effect only needs to run the actual search.
  useEffect(() => {
    if (selectedFood) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchStatus("loading");
      searchFoods(trimmed, controller.signal)
        .then((foods) => {
          setResults(foods);
          setSearchStatus("success");
          setSearchError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSearchStatus("error");
          setSearchError(err instanceof ApiError ? err.message : "Search failed. Try again.");
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedFood]);

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

  function selectFood(food: Food) {
    setSelectedFood(food);
    setAmount(food.servingSize != null ? "1" : "100");
    setUnit(food.servingSize != null ? "serving" : "g");
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFood) return;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSubmitError("Enter an amount greater than 0.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const entry = await createLog({ foodId: selectedFood.id, loggedDate: date, amount: parsedAmount, unit });
      onAdded(entry, selectedFood);
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't log this food. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xl transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-food-modal-title"
        className={`flex max-h-[85vh] w-full max-w-lg flex-col rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-[calc(2rem-0.375rem)] bg-white p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 id="add-food-modal-title" className="font-display text-xl font-semibold text-ink">
              {selectedFood ? "Log this food" : "Add food"}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.1] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <X size={18} weight="light" aria-hidden="true" />
            </button>
          </div>

          {selectedFood ? (
            <form onSubmit={handleSubmit} noValidate className="mt-5 flex min-h-0 flex-1 flex-col gap-5">
              <div className="rounded-2xl bg-black/[0.03] p-4 ring-1 ring-black/5">
                <p className="font-display text-base font-semibold text-ink">{selectedFood.name}</p>
                {selectedFood.brand && <p className="text-sm text-muted">{selectedFood.brand}</p>}
                <p className="mt-1 text-xs font-medium text-muted">
                  {Math.round(selectedFood.caloriesPer100g)} kcal / 100g
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Amount</span>
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

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-muted">Unit</legend>
                  <div className="flex gap-1.5">
                    {(["g", "oz", "serving"] as const).map((option) => {
                      const disabled = option === "serving" && selectedFood.servingSize == null;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={disabled}
                          onClick={() => setUnit(option)}
                          aria-pressed={unit === option}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40 ${
                            unit === option ? "bg-ink text-white" : "bg-black/[0.05] text-ink hover:bg-black/[0.08]"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              {selectedFood.servingSize == null && (
                <p className="-mt-2 text-xs text-muted">
                  No serving size on record for this food — log it by weight (g/oz) instead.
                </p>
              )}

              {submitError && (
                <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <WarningCircle size={16} weight="light" aria-hidden="true" /> {submitError}
                </p>
              )}

              <div className="mt-auto flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="rounded-full bg-black/[0.05] px-5 py-2.5 text-sm font-semibold text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="group flex items-center gap-2 rounded-full bg-ink py-2.5 pl-5 pr-2.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  {submitting ? "Logging…" : "Log it"}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                    <Plus size={14} weight="light" aria-hidden="true" />
                  </span>
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4">
              <label className="relative">
                <span className="sr-only">Search foods</span>
                <MagnifyingGlass
                  size={18}
                  weight="light"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search for a food…"
                  className="w-full rounded-full bg-black/[0.04] py-3 pl-11 pr-4 text-sm font-medium text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                />
              </label>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {query.trim().length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted">Start typing to search foods.</p>
                ) : searchStatus === "loading" ? (
                  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Searching">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-2xl bg-black/[0.04]" style={{ animationDelay: `${i * 100}ms` }} />
                    ))}
                  </div>
                ) : searchStatus === "error" ? (
                  <p role="alert" className="rounded-2xl bg-red-600/5 p-4 text-sm font-medium text-red-600">
                    {searchError}
                  </p>
                ) : results.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted">No foods found for "{query.trim()}".</p>
                ) : (
                  results.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => selectFood(food)}
                    className="rounded-2xl bg-black/[0.03] p-1.5 text-left ring-1 ring-black/5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <div className="flex items-center justify-between gap-3 rounded-[calc(1rem-0.25rem)] bg-white px-4 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold text-ink">{food.name}</p>
                        <p className="truncate text-xs text-muted">
                          {food.brand ? `${food.brand} · ` : ""}
                          {food.source === "usda" ? "USDA" : "Open Food Facts"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-muted">
                        {Math.round(food.caloriesPer100g)} kcal/100g
                      </span>
                    </div>
                  </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
