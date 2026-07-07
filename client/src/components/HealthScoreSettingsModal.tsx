import { ArrowClockwise, Gauge, ToggleLeft, ToggleRight, WarningCircle, X } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { HealthScoreFactorKey, HealthScoreSettings } from "shared";
import { ApiError, getHealthScoreSettings, updateHealthScoreSettings } from "../lib/api";

interface HealthScoreSettingsModalProps {
  onClose: () => void;
  onSaved: (settings: HealthScoreSettings) => void;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface FactorConfig {
  key: HealthScoreFactorKey;
  label: string;
  description: string;
}

const FACTORS: FactorConfig[] = [
  {
    key: "processing",
    label: "Whole-food vs. processed",
    description: "Based on NOVA classification.",
  },
  {
    key: "macroFit",
    label: "Macro fit vs. goals",
    description: "How close the day's macros land to your goals.",
  },
  {
    key: "sugarSodium",
    label: "Sugar / sodium levels",
    description: "Penalizes high sugar and sodium intake.",
  },
  {
    key: "variety",
    label: "Food-group variety",
    description: "Rewards eating from a range of food groups.",
  },
];

interface FormState {
  masterEnabled: boolean;
  factorEnabled: Record<HealthScoreFactorKey, boolean>;
  // Weights are edited as 0-100 percentages and converted to the server's
  // 0-1 fractions on submit — reads more naturally to a user than typing
  // "0.25".
  factorWeightPct: Record<HealthScoreFactorKey, string>;
}

function toFormState(settings: HealthScoreSettings): FormState {
  return {
    masterEnabled: settings.enabled,
    factorEnabled: {
      processing: settings.processingEnabled,
      macroFit: settings.macroFitEnabled,
      sugarSodium: settings.sugarSodiumEnabled,
      variety: settings.varietyEnabled,
    },
    factorWeightPct: {
      processing: String(Math.round(settings.processingWeight * 100)),
      macroFit: String(Math.round(settings.macroFitWeight * 100)),
      sugarSodium: String(Math.round(settings.sugarSodiumWeight * 100)),
      variety: String(Math.round(settings.varietyWeight * 100)),
    },
  };
}

// Mounted by the parent only while open (`{healthScoreSettingsOpen && <...>}`)
// so every open is a fresh mount and re-fetches current settings — mirrors
// `GoalsModal`'s shell (backdrop/panel styling, focus trap, Escape-to-close,
// scroll lock) exactly. Unlike `GoalsModal`, the settings this form edits
// aren't already loaded by the parent (goals are; health-score settings
// aren't fetched anywhere else in the app yet), so this component owns its
// own initial fetch and a loading/error state for it.
export function HealthScoreSettingsModal({ onClose, onSaved }: HealthScoreSettingsModalProps) {
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  function loadSettings() {
    // Wrapped in a nested async IIFE (mirrors `useDailyLog`/`HealthScoreBadge`)
    // so the synchronous `setLoadStatus("loading")` below doesn't run
    // directly in the calling effect's body.
    void (async () => {
      setLoadStatus("loading");
      setLoadError(null);
      try {
        const settings = await getHealthScoreSettings();
        setForm(toFormState(settings));
        setLoadStatus("success");
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load health score settings.");
        setLoadStatus("error");
      }
    })();
  }

  useEffect(() => {
    loadSettings();
  }, []);

  // Enter animation + initial focus, run once on mount.
  useEffect(() => {
    triggerRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => setVisible(true));
    const focusFrame = requestAnimationFrame(() => firstFocusableRef.current?.focus());
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

  function setMasterEnabled(value: boolean) {
    setForm((prev) => (prev ? { ...prev, masterEnabled: value } : prev));
  }

  function setFactorEnabled(key: HealthScoreFactorKey, value: boolean) {
    setForm((prev) => (prev ? { ...prev, factorEnabled: { ...prev.factorEnabled, [key]: value } } : prev));
  }

  function setFactorWeightPct(key: HealthScoreFactorKey, value: string) {
    setForm((prev) => (prev ? { ...prev, factorWeightPct: { ...prev.factorWeightPct, [key]: value } } : prev));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    const parsedWeights: Partial<Record<HealthScoreFactorKey, number>> = {};
    for (const factor of FACTORS) {
      const raw = form.factorWeightPct[factor.key];
      const num = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(num) || num < 0 || num > 100) {
        setSubmitError(`Enter a weight between 0 and 100 for "${factor.label}".`);
        return;
      }
      parsedWeights[factor.key] = num;
    }

    const payload: HealthScoreSettings = {
      enabled: form.masterEnabled,
      processingEnabled: form.factorEnabled.processing,
      processingWeight: parsedWeights.processing! / 100,
      macroFitEnabled: form.factorEnabled.macroFit,
      macroFitWeight: parsedWeights.macroFit! / 100,
      sugarSodiumEnabled: form.factorEnabled.sugarSodium,
      sugarSodiumWeight: parsedWeights.sugarSodium! / 100,
      varietyEnabled: form.factorEnabled.variety,
      varietyWeight: parsedWeights.variety! / 100,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await updateHealthScoreSettings(payload);
      onSaved(saved);
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't save health score settings. Try again.");
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
        aria-labelledby="health-score-settings-title"
        className={`flex max-h-[85vh] w-full max-w-lg flex-col rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-[calc(2rem-0.375rem)] bg-white p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2
              id="health-score-settings-title"
              className="font-display text-xl font-semibold text-ink"
            >
              Health score settings
            </h2>
            <button
              ref={loadStatus !== "success" ? firstFocusableRef : undefined}
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.1] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <X size={18} weight="light" aria-hidden="true" />
            </button>
          </div>

          {loadStatus === "loading" && (
            <div className="mt-5 flex flex-col gap-3" aria-busy="true" aria-label="Loading settings">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-2xl bg-black/[0.04]"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          )}

          {loadStatus === "error" && (
            <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl bg-black/[0.03] p-8 text-center ring-1 ring-black/5">
              <WarningCircle size={28} weight="light" className="text-muted" aria-hidden="true" />
              <p className="text-sm text-muted">{loadError ?? "Something went wrong."}</p>
              <button
                type="button"
                onClick={loadSettings}
                className="group flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <ArrowClockwise
                  size={16}
                  weight="light"
                  aria-hidden="true"
                  className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-rotate-45"
                />
                Retry
              </button>
            </div>
          )}

          {loadStatus === "success" && form && (
            <form onSubmit={handleSubmit} noValidate className="mt-5 flex min-h-0 flex-1 flex-col gap-5">
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/[0.03] p-4 ring-1 ring-black/5">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-ink">Show health score</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {form.masterEnabled
                      ? "Visible on the daily log view."
                      : "Hidden everywhere — no badge, no score."}
                  </p>
                </div>
                <button
                  ref={firstFocusableRef}
                  type="button"
                  onClick={() => setMasterEnabled(!form.masterEnabled)}
                  aria-pressed={form.masterEnabled}
                  aria-label={form.masterEnabled ? "Turn off health score" : "Turn on health score"}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                    form.masterEnabled ? "bg-ink text-white" : "bg-black/[0.05] text-ink hover:bg-black/[0.08]"
                  }`}
                >
                  {form.masterEnabled ? (
                    <ToggleRight size={16} weight="fill" aria-hidden="true" />
                  ) : (
                    <ToggleLeft size={16} weight="light" aria-hidden="true" />
                  )}
                  {form.masterEnabled ? "On" : "Off"}
                </button>
              </div>

              <div
                className={`flex flex-col gap-3 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  form.masterEnabled ? "opacity-100" : "pointer-events-none opacity-40"
                }`}
              >
                {FACTORS.map((factor) => {
                  const enabled = form.factorEnabled[factor.key];
                  return (
                    <div
                      key={factor.key}
                      className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4 ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{factor.label}</p>
                        <p className="mt-0.5 text-xs text-muted">{factor.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="flex items-center gap-1.5">
                          <span className="sr-only">{factor.label} weight (percent)</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            disabled={!enabled || !form.masterEnabled}
                            value={form.factorWeightPct[factor.key]}
                            onChange={(event) => setFactorWeightPct(factor.key, event.target.value)}
                            className="w-16 rounded-xl bg-white px-2.5 py-1.5 text-right text-sm font-medium text-ink ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
                          />
                          <span className="text-xs font-medium text-muted">%</span>
                        </label>
                        <button
                          type="button"
                          disabled={!form.masterEnabled}
                          onClick={() => setFactorEnabled(factor.key, !enabled)}
                          aria-pressed={enabled}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${factor.label}`}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed ${
                            enabled ? "bg-ink text-white" : "bg-black/[0.05] text-ink hover:bg-black/[0.08]"
                          }`}
                        >
                          {enabled ? (
                            <ToggleRight size={16} weight="fill" aria-hidden="true" />
                          ) : (
                            <ToggleLeft size={16} weight="light" aria-hidden="true" />
                          )}
                          {enabled ? "On" : "Off"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="-mt-1 text-xs text-muted">
                Weights are shares of the composite score. They're automatically rescaled across
                whichever factors are enabled and have data for a given day, so they don't need to
                add up to 100.
              </p>

              {submitError && (
                <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <WarningCircle size={16} weight="light" aria-hidden="true" /> {submitError}
                </p>
              )}

              <div className="mt-auto flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full bg-black/[0.05] px-5 py-2.5 text-sm font-semibold text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="group flex items-center gap-2 rounded-full bg-ink py-2.5 pl-5 pr-2.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  {submitting ? "Saving…" : "Save settings"}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                    <Gauge size={14} weight="light" aria-hidden="true" />
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
