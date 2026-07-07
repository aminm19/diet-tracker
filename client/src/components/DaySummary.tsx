import type { Goals, LogTotals } from "shared";
import { DateNav } from "./DateNav";
import { MacroProgress } from "./MacroProgress";
import { Card } from "./ui/Card";

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
    <Card as="section" aria-label="Daily summary" innerClassName="p-6 sm:p-8">
      {/* Announces the running calorie total to screen readers whenever it
          changes (add/edit/delete) — visually hidden since the number is
          already shown via `MacroProgress` below. */}
      <span aria-live="polite" className="sr-only">
        {Math.round(totals.calories).toLocaleString()} calories logged
      </span>

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
    </Card>
  );
}
