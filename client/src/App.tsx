import { PencilSimple, Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Goals } from "shared";
import { AddFoodModal } from "./components/AddFoodModal";
import { DaySummary } from "./components/DaySummary";
import { EntryList } from "./components/EntryList";
import { GoalsModal } from "./components/GoalsModal";
import { useDailyLog } from "./hooks/useDailyLog";
import { getGoals } from "./lib/api";
import { todayString } from "./lib/date";

function App() {
  const [date, setDate] = useState(todayString());
  const [modalOpen, setModalOpen] = useState(false);
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);

  const { status, entries, totals, error, reload, addEntryLocally, updateEntryLocally, removeEntryLocally } =
    useDailyLog(date);

  const [goals, setGoals] = useState<Goals | null>(null);

  // Fetched once on mount — goals aren't scoped to `date`, unlike the daily
  // log. Saving in `GoalsModal` updates this locally (no refetch needed),
  // mirroring `useDailyLog`'s optimistic-update pattern for log entries.
  useEffect(() => {
    const controller = new AbortController();
    getGoals(controller.signal)
      .then(setGoals)
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

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setGoalsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-1 text-xs font-medium text-muted transition-colors hover:text-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <PencilSimple size={13} weight="light" aria-hidden="true" />
            {goals ? "Edit goals" : "Set goals"}
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">Logged foods</h2>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="group flex items-center gap-2 rounded-full bg-ink py-3 pl-6 pr-3 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Add food
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
              <Plus size={16} weight="light" aria-hidden="true" />
            </span>
          </button>
        </div>

        <EntryList
          status={status}
          entries={entries}
          error={error}
          onRetry={reload}
          onUpdated={updateEntryLocally}
          onDeleted={removeEntryLocally}
        />
      </section>

      {modalOpen && (
        <AddFoodModal date={date} onClose={() => setModalOpen(false)} onAdded={addEntryLocally} />
      )}

      {goalsModalOpen && (
        <GoalsModal goals={goals} onClose={() => setGoalsModalOpen(false)} onSaved={setGoals} />
      )}
    </main>
  );
}

export default App;
