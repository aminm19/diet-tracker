import { Gear, PencilSimple, Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Goals } from "shared";
import { AddFoodModal } from "./components/AddFoodModal";
import { DaySummary } from "./components/DaySummary";
import { EntryList } from "./components/EntryList";
import { GoalsModal } from "./components/GoalsModal";
import { HealthScoreBadge } from "./components/HealthScoreBadge";
import { HealthScoreSettingsModal } from "./components/HealthScoreSettingsModal";
import { Button } from "./components/ui/Button";
import { IconButton } from "./components/ui/IconButton";
import { useDailyLog } from "./hooks/useDailyLog";
import { getGoals } from "./lib/api";
import { todayString } from "./lib/date";

// Starting-point goals for a visitor who hasn't set their own yet — roughly
// a 30/40/30 protein/carb/fat split of 2000 kcal (150g protein = 600 kcal,
// 200g carbs = 800 kcal, 65g fat = 585 kcal).
const DEFAULT_GOALS: Goals = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

function App() {
  const [date, setDate] = useState(todayString());
  const [modalOpen, setModalOpen] = useState(false);
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [healthScoreSettingsOpen, setHealthScoreSettingsOpen] = useState(false);
  // Bumped after a health-score settings save so `HealthScoreBadge` re-fetches
  // the current date's score immediately, instead of waiting for a date change.
  const [healthScoreRefreshKey, setHealthScoreRefreshKey] = useState(0);

  const { status, entries, totals, error, reload, addEntryLocally, updateEntryLocally, removeEntryLocally } =
    useDailyLog(date);

  const [goals, setGoals] = useState<Goals | null>(null);

  // Focus anchor for `EntryList`'s post-delete focus restoration: when a
  // delete empties the log, focus lands here rather than nowhere.
  const addFoodButtonRef = useRef<HTMLButtonElement>(null);

  // Fetched once on mount — goals aren't scoped to `date`, unlike the daily
  // log. Saving in `GoalsModal` updates this locally (no refetch needed),
  // mirroring `useDailyLog`'s optimistic-update pattern for log entries.
  useEffect(() => {
    const controller = new AbortController();
    getGoals(controller.signal)
      // A new visitor has no goals row yet (`getGoals` returns `null`) — fall
      // back to a sensible starting point (roughly a 30/40/30
      // protein/carb/fat split of 2000 kcal) rather than an empty progress
      // bar, so logging food is immediately visible as progress. Purely a
      // local default: nothing is written to the server until the user
      // actually saves via `GoalsModal`, at which point it's their own.
      .then((fetchedGoals) => setGoals(fetchedGoals ?? DEFAULT_GOALS))
      .catch(() => {
        // Goals are a soft-fail feature (DaySummary already renders a "no
        // goals" fallback) — silently keep `goals` at its initial `null`
        // rather than surfacing a page-level error for this.
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Diet Tracker
      </p>

      <div className="flex flex-col gap-3">
        <DaySummary date={date} onDateChange={setDate} totals={totals} goals={goals} />

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5">
            <HealthScoreBadge date={date} refreshKey={healthScoreRefreshKey} totals={totals} />
            <IconButton
              variant="ghost"
              onClick={() => setHealthScoreSettingsOpen(true)}
              aria-label="Health score settings"
            >
              <Gear size={14} weight="light" aria-hidden="true" />
            </IconButton>
          </div>

          <button
            type="button"
            onClick={() => setGoalsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <PencilSimple size={13} weight="light" aria-hidden="true" />
            {goals ? "Edit goals" : "Set goals"}
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">Logged foods</h2>
          <Button ref={addFoodButtonRef} variant="primaryLarge" onClick={() => setModalOpen(true)}>
            Add food
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
              <Plus size={16} weight="light" aria-hidden="true" />
            </span>
          </Button>
        </div>

        <EntryList
          status={status}
          entries={entries}
          error={error}
          onRetry={reload}
          onUpdated={updateEntryLocally}
          onDeleted={removeEntryLocally}
          onEmptyAfterDelete={() => addFoodButtonRef.current?.focus()}
        />
      </section>

      {modalOpen && (
        <AddFoodModal date={date} onClose={() => setModalOpen(false)} onAdded={addEntryLocally} />
      )}

      {goalsModalOpen && (
        <GoalsModal goals={goals} onClose={() => setGoalsModalOpen(false)} onSaved={setGoals} />
      )}

      {healthScoreSettingsOpen && (
        <HealthScoreSettingsModal
          onClose={() => setHealthScoreSettingsOpen(false)}
          onSaved={() => setHealthScoreRefreshKey((key) => key + 1)}
        />
      )}
    </main>
  );
}

export default App;
