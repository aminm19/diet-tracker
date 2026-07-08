// Health-score settings (singleton row) + the composite score computation.
//
// Settings CRUD mirrors `server/src/services/goals.ts`'s "select-then-insert-
// or-update in JS" pattern (the table has no unique constraint to `ON
// CONFLICT` against). One difference from `goals`: `getHealthScoreSettings`
// creates a default row (the schema's column defaults — all factors
// enabled, weight 0.25 each) rather than returning `null`, since "no
// settings row yet" and "health score disabled" would otherwise be
// indistinguishable to callers — the health score should be on by default
// until the user explicitly turns it off.
import { eq } from "drizzle-orm";
import type {
  Goals,
  HealthScoreFactorKey,
  HealthScoreResult,
  HealthScoreSettings,
  LogEntry,
  LogTotals,
} from "shared";
import { computeLogTotals, healthScoreSettings } from "shared";
import { db } from "../db/client.js";
import { numericToString, stringToNumber } from "../db/numeric.js";
import { getFoodById } from "./foodSearch.js";
import { getGoals } from "./goals.js";
import { getLogsByDate } from "./logs.js";

function rowToSettings(row: typeof healthScoreSettings.$inferSelect): HealthScoreSettings {
  return {
    enabled: row.enabled,
    processingEnabled: row.processingEnabled,
    processingWeight: stringToNumber(row.processingWeight)!,
    macroFitEnabled: row.macroFitEnabled,
    macroFitWeight: stringToNumber(row.macroFitWeight)!,
    sugarSodiumEnabled: row.sugarSodiumEnabled,
    sugarSodiumWeight: stringToNumber(row.sugarSodiumWeight)!,
    varietyEnabled: row.varietyEnabled,
    varietyWeight: stringToNumber(row.varietyWeight)!,
  };
}

// Returns the existing settings row, or creates one using the schema's
// column defaults if none exists yet (rather than returning `null` — see
// module doc comment).
export async function getHealthScoreSettings(): Promise<HealthScoreSettings> {
  const [existing] = await db.select().from(healthScoreSettings);
  if (existing) return rowToSettings(existing);

  const [row] = await db.insert(healthScoreSettings).values({}).returning();
  if (!row) {
    throw new Error("Insert into health_score_settings returned no row");
  }
  return rowToSettings(row);
}

// Inserts a new row if none exists yet, otherwise updates the existing one.
export async function upsertHealthScoreSettings(
  input: HealthScoreSettings,
): Promise<HealthScoreSettings> {
  const [existing] = await db.select().from(healthScoreSettings);

  const values = {
    enabled: input.enabled,
    processingEnabled: input.processingEnabled,
    processingWeight: numericToString(input.processingWeight)!,
    macroFitEnabled: input.macroFitEnabled,
    macroFitWeight: numericToString(input.macroFitWeight)!,
    sugarSodiumEnabled: input.sugarSodiumEnabled,
    sugarSodiumWeight: numericToString(input.sugarSodiumWeight)!,
    varietyEnabled: input.varietyEnabled,
    varietyWeight: numericToString(input.varietyWeight)!,
    updatedAt: new Date(),
  };

  if (!existing) {
    const [row] = await db.insert(healthScoreSettings).values(values).returning();
    if (!row) {
      throw new Error("Insert into health_score_settings returned no row");
    }
    return rowToSettings(row);
  }

  const [row] = await db
    .update(healthScoreSettings)
    .set(values)
    .where(eq(healthScoreSettings.id, existing.id))
    .returning();
  if (!row) {
    throw new Error("Update to health_score_settings returned no row");
  }
  return rowToSettings(row);
}

// --- Sub-score formulas ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const NOVA_SUB_SCORE: Record<number, number> = { 1: 100, 2: 75, 3: 40, 4: 10 };

// Averages the NOVA-group-derived sub-score across entries whose resolved
// food has a non-null `novaGroup`. Entries with an unclassified NOVA group
// are excluded from the average, not penalized. Returns `null` (no
// computable data) if zero entries have a NOVA group.
async function computeProcessingScore(entries: LogEntry[]): Promise<number | null> {
  const scores: number[] = [];
  for (const entry of entries) {
    const food = await getFoodById(entry.foodId);
    if (food?.novaGroup != null) {
      scores.push(NOVA_SUB_SCORE[food.novaGroup] ?? 0);
    }
  }
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

// Only computable if goals are set AND at least one log entry exists for the
// day. Averages the relative error (|dailyTotal - goal| / goal) across the
// four macros, skipping any macro whose goal is 0 (avoids divide-by-zero).
// If every goal happens to be 0, there's nothing to average — also excluded.
// `goals`/`totals` are passed in (rather than fetched here) so
// `computeHealthScore` can share the single `getGoals()` call with the
// plain-language diet message.
function computeMacroFitScore(
  entries: LogEntry[],
  totals: LogTotals,
  goals: Goals | null,
): number | null {
  if (entries.length === 0) return null;
  if (!goals) return null;

  const macros = ["calories", "protein", "carbs", "fat"] as const;

  const relativeErrors = macros
    .filter((macro) => goals[macro] !== 0)
    .map((macro) => Math.abs(totals[macro] - goals[macro]) / goals[macro]);

  if (relativeErrors.length === 0) return null;

  const avgRelativeError = relativeErrors.reduce((sum, e) => sum + e, 0) / relativeErrors.length;
  return clamp(100 - avgRelativeError * 100, 0, 100);
}

// `hit` = within 15% relative error of goal, same threshold style as
// `computeMacroFitScore` but collapsed to a boolean. Only computable under
// the same conditions as macro-fit (goals set, at least one entry that day)
// plus both the calorie and protein goals being non-zero — otherwise there's
// nothing meaningful to compare, so `null` (same spirit as macro-fit's
// zero-goal handling). Deliberately independent of
// `settings.macroFitEnabled`: a user can disable the macro-fit *score* while
// still wanting this plain-language message.
function hit(actual: number, goal: number): boolean {
  return Math.abs(actual - goal) / goal <= 0.15;
}

function computeDietMessage(entries: LogEntry[], totals: LogTotals, goals: Goals | null): string | null {
  if (!goals) return null;
  if (entries.length === 0) return null;
  if (goals.calories === 0 || goals.protein === 0) return null;

  const caloriesHit = hit(totals.calories, goals.calories);
  const proteinHit = hit(totals.protein, goals.protein);

  if (!caloriesHit && !proteinHit) return "Get in some more protein today!";
  if (caloriesHit && !proteinHit) return "Your diet was a little light on protein today.";
  if (caloriesHit && proteinHit) return "Solid day — you hit both your calorie and protein goals!";
  return "Good protein today — keep an eye on your calorie goal.";
}

const SUGAR_LIMIT_G = 50;
const SODIUM_LIMIT_MG = 2300;

// 100 at or below the daily reference limit, linearly decreasing to 0 at
// 2x the limit, clamped at 0 beyond that.
function scoreAgainstLimit(total: number, limit: number): number {
  if (total <= limit) return 100;
  return clamp(100 * (1 - (total - limit) / limit), 0, 100);
}

// Sums sugar/sodium directly across the day's entries (nulls treated as 0 —
// an entry with no sugar/sodium data still counts toward the day's totals,
// it's just a 0 contribution, not a reason to drop the whole day). Excluded
// only when there are zero log entries for the day.
function computeSugarSodiumScore(entries: LogEntry[]): number | null {
  if (entries.length === 0) return null;

  const totalSugar = entries.reduce((sum, e) => sum + (e.sugar ?? 0), 0);
  const totalSodium = entries.reduce((sum, e) => sum + (e.sodium ?? 0), 0);

  const sugarScore = scoreAgainstLimit(totalSugar, SUGAR_LIMIT_G);
  const sodiumScore = scoreAgainstLimit(totalSodium, SODIUM_LIMIT_MG);
  return (sugarScore + sodiumScore) / 2;
}

// A single day's 2-4 logged foods is too small a sample for a meaningful
// variety signal, so this factor looks at a rolling 7-day window ending on
// the requested date instead of just that day (a judgment call, documented
// in `plan.md`'s Unit 7 section — flagged for reconsideration once it's
// running against real data).
const VARIETY_WINDOW_DAYS = 7;
// protein, vegetable, fruit, grain, dairy, fat — "other" doesn't count
// toward variety.
const MEANINGFUL_FOOD_GROUP_COUNT = 6;

// YYYY-MM-DD arithmetic via local-date components (mirrors the
// rollover-safe parsing `dateStringSchema` validates against).
function subtractDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() - days);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function windowDates(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => subtractDays(endDate, days - 1 - i));
}

// Distinct food-group count (excluding null/"other") among all foods logged
// across the rolling 7-day window ending on `date`, scored as a fraction of
// the 6 meaningful groups. Excluded if there are zero log entries anywhere
// in the window. Reuses `getLogsByDate` per day in the window (same
// per-day query the other three factors use) rather than a bespoke
// multi-day range query.
async function computeVarietyScore(date: string): Promise<number | null> {
  const dates = windowDates(date, VARIETY_WINDOW_DAYS);
  const entriesPerDay = await Promise.all(dates.map((d) => getLogsByDate(d)));
  const windowEntries = entriesPerDay.flatMap((day) => day.entries);

  if (windowEntries.length === 0) return null;

  const foodGroups = new Set<string>();
  const resolvedFoodIds = new Set<number>();
  for (const entry of windowEntries) {
    if (resolvedFoodIds.has(entry.foodId)) continue;
    resolvedFoodIds.add(entry.foodId);

    const food = await getFoodById(entry.foodId);
    if (food?.foodGroup && food.foodGroup !== "other") {
      foodGroups.add(food.foodGroup);
    }
  }

  return Math.min(100, (foodGroups.size / MEANINGFUL_FOOD_GROUP_COUNT) * 100);
}

// --- Composite ---

interface FactorInput {
  key: HealthScoreFactorKey;
  score: number | null;
  weight: number;
}

// Returns `{ status: "hidden" }` if the master `enabled` toggle is off.
// Otherwise computes each individually-enabled factor's sub-score (`null`
// if that factor has no computable data for `date`) and combines the
// enabled-and-computable ones into a weighted average, renormalizing their
// weights to sum to 1. Returns `{ status: "insufficient_data" }` if zero
// factors end up enabled and computable.
//
// `goals` is fetched once here (rather than inside `computeMacroFitScore`)
// so it can be shared with `computeDietMessage` without a second DB
// round-trip; both consume the same `entries`/`totals` fetched up front too.
export async function computeHealthScore(date: string): Promise<HealthScoreResult> {
  const settings = await getHealthScoreSettings();
  if (!settings.enabled) {
    return { status: "hidden" };
  }

  const { entries } = await getLogsByDate(date);
  const goals = await getGoals();
  const totals = computeLogTotals(entries);

  const [processingScore, macroFitScore, sugarSodiumScore, varietyScore] = await Promise.all([
    settings.processingEnabled ? computeProcessingScore(entries) : Promise.resolve(null),
    settings.macroFitEnabled
      ? Promise.resolve(computeMacroFitScore(entries, totals, goals))
      : Promise.resolve(null),
    settings.sugarSodiumEnabled
      ? Promise.resolve(computeSugarSodiumScore(entries))
      : Promise.resolve(null),
    settings.varietyEnabled ? computeVarietyScore(date) : Promise.resolve(null),
  ]);

  const message = computeDietMessage(entries, totals, goals);

  const factorInputs: FactorInput[] = [
    { key: "processing", score: processingScore, weight: settings.processingWeight },
    { key: "macroFit", score: macroFitScore, weight: settings.macroFitWeight },
    { key: "sugarSodium", score: sugarSodiumScore, weight: settings.sugarSodiumWeight },
    { key: "variety", score: varietyScore, weight: settings.varietyWeight },
  ];

  const computable = factorInputs.filter(
    (f): f is FactorInput & { score: number } => f.score !== null,
  );

  if (computable.length === 0) {
    return { status: "insufficient_data" };
  }

  const totalWeight = computable.reduce((sum, f) => sum + f.weight, 0);

  const factors: Record<HealthScoreFactorKey, { score: number; weight: number } | null> = {
    processing: null,
    macroFit: null,
    sugarSodium: null,
    variety: null,
  };

  let compositeScore = 0;
  for (const f of computable) {
    // Guards a pathological all-zero-weight edge case (every enabled,
    // computable factor has weight 0) rather than dividing by zero.
    const renormalizedWeight = totalWeight === 0 ? 1 / computable.length : f.weight / totalWeight;
    factors[f.key] = { score: f.score, weight: renormalizedWeight };
    compositeScore += f.score * renormalizedWeight;
  }

  return { status: "ok", score: compositeScore, factors, message };
}
