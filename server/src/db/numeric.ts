// Round-tripping helpers for Drizzle `numeric` columns. Postgres `numeric`
// values come back from (and must be written to) the driver as strings, to
// avoid floating-point precision loss — Drizzle doesn't convert these to/from
// `number` for us. This is a server/DB concern (the `shared` package's Zod
// schemas model the wire/domain shape as plain `number`s), so it lives here
// rather than in `shared/`.
export function numericToString(value: number | null): string | null {
  return value === null ? null : value.toString();
}

export function stringToNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}
