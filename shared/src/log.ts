// Request/response shapes for the log CRUD API (`/api/logs/*`). Shared
// between server route validation and (later) the client.
import { z } from "zod";

export const logUnitSchema = z.enum(["g", "oz", "serving"]);
export type LogUnit = z.infer<typeof logUnitSchema>;

// YYYY-MM-DD, and must actually parse as a real calendar date (rejects
// things like "2024-13-45"). Deliberately does NOT rely on `Date.parse` —
// it silently rolls invalid day-of-month values over into the next month
// (e.g. `Date.parse("2024-02-30")` normalizes to March 1st) instead of
// rejecting them. Instead, reparse the y/m/d components and confirm
// `new Date(y, m-1, d)` round-trips to the same components, which catches
// rollover (Feb 30, Feb 29 in a non-leap year, Apr 31, etc.).
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine(
    (value) => {
      const [year, month, day] = value.split("-").map(Number) as [number, number, number];
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    },
    { message: "Date must be a valid calendar date" },
  );

// A single logged entry — mirrors the `food_logs` table (numeric columns
// converted to `number`, nullable snapshot fields stay nullable).
export const logEntrySchema = z.object({
  id: z.number().int().positive(),
  loggedDate: z.string(),
  foodId: z.number().int().positive(),
  amount: z.number(),
  unit: logUnitSchema,
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  sugar: z.number().nullable(),
  sodium: z.number().nullable(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const createLogRequestSchema = z.object({
  foodId: z.number().int().positive(),
  loggedDate: dateStringSchema,
  amount: z.number().positive(),
  unit: logUnitSchema,
});
export type CreateLogRequest = z.infer<typeof createLogRequestSchema>;

export const getLogsQuerySchema = z.object({
  date: dateStringSchema,
});
export type GetLogsQuery = z.infer<typeof getLogsQuerySchema>;

export const logTotalsSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});
export type LogTotals = z.infer<typeof logTotalsSchema>;

// Reduces a day's log entries into calorie/macro totals. Shared by the
// server (`getLogsByDate`) and the client (`useDailyLog`'s optimistic
// add/update/delete recompute) so both sides sum the same way.
export function computeLogTotals(entries: LogEntry[]): LogTotals {
  return entries.reduce<LogTotals>(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export const getLogsResponseSchema = z.object({
  entries: z.array(logEntrySchema),
  totals: logTotalsSchema,
});
export type GetLogsResponse = z.infer<typeof getLogsResponseSchema>;

export const updateLogRequestSchema = z
  .object({
    amount: z.number().positive().optional(),
    unit: logUnitSchema.optional(),
    loggedDate: dateStringSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (amount, unit, loggedDate) must be provided",
  });
export type UpdateLogRequest = z.infer<typeof updateLogRequestSchema>;

export const logIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
