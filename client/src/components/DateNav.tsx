import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { addDays, formatDateLabel } from "../lib/date";

interface DateNavProps {
  date: string;
  onChange: (date: string) => void;
}

const NAV_BUTTON_CLASSES =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-ink transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export function DateNav({ date, onChange }: DateNavProps) {
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Day navigation">
      <button
        type="button"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
        className={NAV_BUTTON_CLASSES}
      >
        <CaretLeft size={20} weight="light" aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {formatDateLabel(date)}
        </h1>
        <label className="group relative cursor-pointer text-xs font-medium text-muted transition-colors hover:text-black/60">
          <span>Jump to date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) onChange(event.target.value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:opacity-100"
            aria-label="Jump to a specific date"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
        className={NAV_BUTTON_CLASSES}
      >
        <CaretRight size={20} weight="light" aria-hidden="true" />
      </button>
    </nav>
  );
}
