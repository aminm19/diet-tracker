import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { addDays, formatDateLabel } from "../lib/date";
import { IconButton } from "./ui/IconButton";

interface DateNavProps {
  date: string;
  onChange: (date: string) => void;
}

export function DateNav({ date, onChange }: DateNavProps) {
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Day navigation">
      <IconButton variant="nav" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
        <CaretLeft size={20} weight="light" aria-hidden="true" />
      </IconButton>

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

      <IconButton variant="nav" onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
        <CaretRight size={20} weight="light" aria-hidden="true" />
      </IconButton>
    </nav>
  );
}
