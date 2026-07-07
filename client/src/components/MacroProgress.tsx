// Renders a single macro's progress. When `goal` is omitted/null (goals not
// set yet), falls back to a clean raw-number display with an unfilled track
// instead of a progress bar with nothing to fill against.
interface MacroProgressProps {
  label: string;
  value: number;
  unit: string;
  goal?: number | null;
  size?: "lg" | "sm";
}

export function MacroProgress({ label, value, unit, goal, size = "sm" }: MacroProgressProps) {
  const hasGoal = goal != null && goal > 0;
  const pct = hasGoal ? Math.min(100, (value / goal) * 100) : 0;
  const isOverGoal = hasGoal && value > goal;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        <span
          className={`font-display font-semibold text-ink ${size === "lg" ? "text-2xl" : "text-base"}`}
        >
          {Math.round(value).toLocaleString()}
          {hasGoal && (
            <span className="text-muted"> / {Math.round(goal).toLocaleString()}</span>
          )}
          <span className="ml-1 text-xs font-medium text-muted">{unit}</span>
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]"
        role={hasGoal ? "progressbar" : undefined}
        aria-valuenow={hasGoal ? Math.round(pct) : undefined}
        aria-valuemin={hasGoal ? 0 : undefined}
        aria-valuemax={hasGoal ? 100 : undefined}
        aria-label={hasGoal ? `${label} progress` : undefined}
      >
        {hasGoal && (
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isOverGoal ? "bg-[var(--color-warning)]" : "bg-ink"
            }`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
