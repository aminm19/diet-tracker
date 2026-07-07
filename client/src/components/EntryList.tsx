import { ArrowClockwise, ForkKnife, WarningCircle } from "@phosphor-icons/react";
import type { LogEntry } from "shared";
import type { EnrichedEntry } from "../hooks/useDailyLog";
import { EntryCard } from "./EntryCard";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface EntryListProps {
  status: "loading" | "success" | "error";
  entries: EnrichedEntry[];
  error: string | null;
  onRetry: () => void;
  onUpdated: (entry: LogEntry) => void;
  onDeleted: (id: number) => void;
}

function EntrySkeletonRow({ index }: { index: number }) {
  return (
    <div
      className="animate-pulse rounded-2xl bg-black/[0.03] p-1.5 ring-1 ring-black/5"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="rounded-[calc(1rem-0.25rem)] bg-white p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded-full bg-black/[0.08]" />
            <div className="h-3 w-1/4 rounded-full bg-black/[0.05]" />
            <div className="h-3 w-1/2 rounded-full bg-black/[0.05]" />
          </div>
          <div className="h-9 w-20 rounded-full bg-black/[0.05]" />
        </div>
      </div>
    </div>
  );
}

export function EntryList({ status, entries, error, onRetry, onUpdated, onDeleted }: EntryListProps) {
  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading entries">
        <EntrySkeletonRow index={0} />
        <EntrySkeletonRow index={1} />
        <EntrySkeletonRow index={2} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card innerClassName="flex flex-col items-center gap-4 p-10 text-center">
        <WarningCircle size={32} weight="light" className="text-muted" aria-hidden="true" />
        <div>
          <p className="font-display text-lg font-semibold text-ink">Couldn't load this day's log</p>
          <p className="mt-1 text-sm text-muted">{error ?? "Something went wrong."}</p>
        </div>
        <Button variant="retry" onClick={onRetry}>
          <ArrowClockwise
            size={16}
            weight="light"
            aria-hidden="true"
            className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-rotate-45"
          />
          Retry
        </Button>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card innerClassName="flex flex-col items-center gap-3 p-10 text-center">
        <ForkKnife size={32} weight="light" className="text-muted" aria-hidden="true" />
        <div>
          <p className="font-display text-lg font-semibold text-ink">Nothing logged yet</p>
          <p className="mt-1 text-sm text-muted">Add the first food for this day to see it here.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => (
        <EntryCard key={entry.id} entry={entry} index={index} onUpdated={onUpdated} onDeleted={onDeleted} />
      ))}
    </div>
  );
}
