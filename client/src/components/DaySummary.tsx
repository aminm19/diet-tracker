import type { Goals, LogTotals } from "shared";
import { DateNav } from "./DateNav";
import { MacroProgress } from "./MacroProgress";

// `goals` is `null` until the user has set any (see `App.tsx`'s `getGoals()`
// fetch) — components below degrade to a no-goal display in that case.
interface DaySummaryProps {
  date: string;
  onDateChange: (date: string) => void;
  totals: LogTotals;
  goals: Goals | null;
}

export function DaySummary({ date, onDateChange, totals, goals }: DaySummaryProps) {
  return (
    <section
      aria-label="Daily summary"
      className="rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)]"
    >
      <div className="rounded-[calc(2rem-0.375rem)] bg-white p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:p-8">
        <DateNav date={date} onChange={onDateChange} />

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[1.2fr_1fr] md:gap-8">
          <MacroProgress label="Calories" value={totals.calories} unit="kcal" goal={goals?.calories} size="lg" />

          <div className="grid grid-cols-3 gap-4 md:gap-6">
            <MacroProgress label="Protein" value={totals.protein} unit="g" goal={goals?.protein} />
            <MacroProgress label="Carbs" value={totals.carbs} unit="g" goal={goals?.carbs} />
            <MacroProgress label="Fat" value={totals.fat} unit="g" goal={goals?.fat} />
          </div>
        </div>

        {!goals && (
          <p className="mt-6 text-sm text-muted">Set goals to track progress →</p>
        )}
      </div>
    </section>
  );
}
