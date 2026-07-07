// Local-timezone date helpers. Deliberately avoid
// `new Date().toISOString().slice(0, 10)` for "today" — `toISOString`
// converts to UTC first, which can land on the wrong calendar day near
// midnight in most timezones. Every string here is built from
// `getFullYear`/`getMonth`/`getDate` (local) instead.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

function parseDateString(date: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export function addDays(date: string, delta: number): string {
  const parsed = parseDateString(date);
  parsed.setDate(parsed.getDate() + delta);
  return toDateString(parsed);
}

// "Today" / "Yesterday" for those two days, otherwise a formatted date like
// "Wed, Jul 8".
export function formatDateLabel(date: string): string {
  const today = todayString();
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";

  const parsed = parseDateString(date);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
