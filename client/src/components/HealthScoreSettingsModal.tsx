import { ArrowClockwise, Gauge, ToggleLeft, ToggleRight, WarningCircle, X } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { HealthScoreFactorKey, HealthScoreSettings } from "shared";
import { ApiError, getHealthScoreSettings, updateHealthScoreSettings } from "../lib/api";
import { useModal } from "../hooks/useModal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { IconButton } from "./ui/IconButton";

interface HealthScoreSettingsModalProps {
  onClose: () => void;
  onSaved: (settings: HealthScoreSettings) => void;
}

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

  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const { visible, panelRef, handleClose, handleBackdropMouseDown } = useModal({
    onClose,
    initialFocusRef: firstFocusableRef,
  });

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

  // `useModal`'s initial-focus effect fires once, on mount, via
  // `requestAnimationFrame` — at that point `loadStatus` is still "loading"
  // (the fetch above hasn't resolved yet), so it focuses whatever's
  // focusable then (the Close button, shown during loading) rather than the
  // master toggle this modal actually wants focused once settings are ready.
  // Re-focus once loading transitions to success, when `firstFocusableRef`
  // has been reassigned to the toggle button by the JSX below.
  useEffect(() => {
    if (loadStatus === "success") {
      firstFocusableRef.current?.focus();
    }
  }, [loadStatus]);

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
      onMouseDown={handleBackdropMouseDown}
    >
      <Card
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-score-settings-title"
        shadow="modal"
        className={`flex max-h-[85vh] w-full max-w-lg flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        innerClassName="flex min-h-0 flex-1 flex-col p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="health-score-settings-title"
            className="font-display text-xl font-semibold text-ink"
          >
            Health score settings
          </h2>
          <IconButton
            ref={loadStatus !== "success" ? firstFocusableRef : undefined}
            variant="close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={18} weight="light" aria-hidden="true" />
          </IconButton>
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
            <Button variant="retryModal" onClick={loadSettings}>
              <ArrowClockwise
                size={16}
                weight="light"
                aria-hidden="true"
                className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-rotate-45"
              />
              Retry
            </Button>
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
                <Button variant="secondary" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? "Saving…" : "Save settings"}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                    <Gauge size={14} weight="light" aria-hidden="true" />
                  </span>
                </Button>
              </div>
            </form>
          )}
      </Card>
    </div>
  );
}
