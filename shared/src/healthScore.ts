// Health-score settings + computed-result shapes — mirrors
// `health_score_settings` (settings) and defines the `/api/health-score`
// route's response contract (result). Shared between server route
// validation and (later) the client's settings UI + score badge.
import { z } from "zod";
import { dateStringSchema } from "./log.js";

// Master + per-factor toggles and weights. Weights are fractions of the
// composite (matching the `numeric().default("0.25")` columns) — the four
// enabled factors' weights aren't required to sum to 1 at the settings
// layer; `computeHealthScore` renormalizes across whichever factors end up
// enabled *and* computable for a given date.
export const healthScoreSettingsSchema = z.object({
  enabled: z.boolean(),
  processingEnabled: z.boolean(),
  processingWeight: z.number().min(0).max(1),
  macroFitEnabled: z.boolean(),
  macroFitWeight: z.number().min(0).max(1),
  sugarSodiumEnabled: z.boolean(),
  sugarSodiumWeight: z.number().min(0).max(1),
  varietyEnabled: z.boolean(),
  varietyWeight: z.number().min(0).max(1),
});
export type HealthScoreSettings = z.infer<typeof healthScoreSettingsSchema>;

export const getHealthScoreQuerySchema = z.object({
  date: dateStringSchema,
});
export type GetHealthScoreQuery = z.infer<typeof getHealthScoreQuerySchema>;

export const healthScoreFactorKeys = [
  "processing",
  "macroFit",
  "sugarSodium",
  "variety",
] as const;
export type HealthScoreFactorKey = (typeof healthScoreFactorKeys)[number];

// A single factor's 0-100 sub-score, plus the *renormalized* share of the
// composite it actually contributed (the weights of only the
// enabled-and-computable factors are rescaled to sum to 1).
export const healthScoreFactorResultSchema = z.object({
  score: z.number(),
  weight: z.number(),
});
export type HealthScoreFactorResult = z.infer<typeof healthScoreFactorResultSchema>;

// Discriminated union covering the three shapes the client needs to tell
// apart:
// - "hidden": the master `enabled` toggle is off. The client should hide the
//   whole health-score feature (no badge, no score), not render a 0 or an
//   error state.
// - "insufficient_data": the feature is on, but zero factors ended up both
//   individually enabled *and* computable for the requested date (e.g. no
//   logs at all that day, or in the variety factor's 7-day window). The
//   client should show an explicit "not enough data yet" state rather than a
//   misleading 0 or 100.
// - "ok": a real composite `score` (0-100), plus a per-factor breakdown.
//   Any factor that was disabled or not computable for this date is `null`
//   in `factors`. `message` is a short, hardcoded diet message derived
//   directly from the day's calorie/protein totals vs. goals — independent
//   of the four scored factors (and of `settings.macroFitEnabled`), so it's
//   `null` whenever goals aren't set, there are no log entries that day, or
//   either the calorie or protein goal is 0.
export const healthScoreResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("hidden") }),
  z.object({ status: z.literal("insufficient_data") }),
  z.object({
    status: z.literal("ok"),
    score: z.number().min(0).max(100),
    factors: z.object({
      processing: healthScoreFactorResultSchema.nullable(),
      macroFit: healthScoreFactorResultSchema.nullable(),
      sugarSodium: healthScoreFactorResultSchema.nullable(),
      variety: healthScoreFactorResultSchema.nullable(),
    }),
    message: z.string().nullable(),
  }),
]);
export type HealthScoreResult = z.infer<typeof healthScoreResultSchema>;
