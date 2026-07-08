// Tests for the health-score settings CRUD + composite score computation.
// Settings CRUD follows goals.test.ts's DB-mocking style (a small in-memory
// fake `health_score_settings` table that interprets real `eq()` conditions
// from drizzle-orm). `computeHealthScore`'s dependencies (`getLogsByDate`,
// `getFoodById`, `getGoals`) are mocked directly, mirroring logs.test.ts's
// approach to `getFoodById` — the composite logic is exercised against
// concrete inputs, not against a fake DB.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Food, Goals, LogEntry } from "shared";
import type { LogsForDate } from "./logs.js";

// --- Fake DB (in-memory `health_score_settings` table, singleton in practice) ---

interface FakeSettingsRow {
  id: number;
  enabled: boolean;
  processingEnabled: boolean;
  processingWeight: string;
  macroFitEnabled: boolean;
  macroFitWeight: string;
  sugarSodiumEnabled: boolean;
  sugarSodiumWeight: string;
  varietyEnabled: boolean;
  varietyWeight: string;
  updatedAt: Date;
}

const DEFAULTS = {
  enabled: true,
  processingEnabled: true,
  processingWeight: "0.25",
  macroFitEnabled: true,
  macroFitWeight: "0.25",
  sugarSodiumEnabled: true,
  sugarSodiumWeight: "0.25",
  varietyEnabled: true,
  varietyWeight: "0.25",
};

function extractEqCondition(condition: unknown): { key: string; value: unknown } {
  const chunks = (condition as { queryChunks: unknown[] }).queryChunks;
  const columnChunk = chunks.find(
    (c): c is { name: string } =>
      typeof c === "object" && c !== null && "name" in c && "columnType" in c,
  );
  const paramChunk = chunks.find(
    (c): c is { value: unknown } =>
      typeof c === "object" && c !== null && "value" in c && "encoder" in c,
  );
  if (!columnChunk || !paramChunk) {
    throw new Error("Fake db: could not parse eq() condition");
  }
  return { key: columnChunk.name, value: paramChunk.value };
}

let store: FakeSettingsRow[];
let nextId: number;

vi.mock("../db/client.js", () => {
  return {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            const row: FakeSettingsRow = {
              id: nextId++,
              enabled: (values.enabled as boolean) ?? DEFAULTS.enabled,
              processingEnabled: (values.processingEnabled as boolean) ?? DEFAULTS.processingEnabled,
              processingWeight: (values.processingWeight as string) ?? DEFAULTS.processingWeight,
              macroFitEnabled: (values.macroFitEnabled as boolean) ?? DEFAULTS.macroFitEnabled,
              macroFitWeight: (values.macroFitWeight as string) ?? DEFAULTS.macroFitWeight,
              sugarSodiumEnabled:
                (values.sugarSodiumEnabled as boolean) ?? DEFAULTS.sugarSodiumEnabled,
              sugarSodiumWeight: (values.sugarSodiumWeight as string) ?? DEFAULTS.sugarSodiumWeight,
              varietyEnabled: (values.varietyEnabled as boolean) ?? DEFAULTS.varietyEnabled,
              varietyWeight: (values.varietyWeight as string) ?? DEFAULTS.varietyWeight,
              updatedAt: (values.updatedAt as Date) ?? new Date(),
            };
            store.push(row);
            return [row];
          },
        }),
      }),
      select: () => ({
        from: async () => store,
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (condition: unknown) => ({
            returning: async () => {
              const { value } = extractEqCondition(condition);
              const row = store.find((r) => r.id === value);
              if (!row) return [];
              Object.assign(row, patch);
              return [row];
            },
          }),
        }),
      }),
    },
  };
});

const getLogsByDate = vi.fn<(date: string) => Promise<LogsForDate>>();
vi.mock("./logs.js", () => ({
  getLogsByDate: (date: string) => getLogsByDate(date),
}));

const getFoodById = vi.fn<(id: number) => Promise<Food | null>>();
vi.mock("./foodSearch.js", () => ({
  getFoodById: (id: number) => getFoodById(id),
}));

const getGoals = vi.fn<() => Promise<Goals | null>>();
vi.mock("./goals.js", () => ({
  getGoals: () => getGoals(),
}));

const {
  computeHealthScore,
  getHealthScoreSettings,
  upsertHealthScoreSettings,
} = await import("./healthScore.js");
const { healthScoreRoute } = await import("../routes/healthScore.js");

beforeEach(() => {
  store = [];
  nextId = 1;
  getLogsByDate.mockReset();
  getFoodById.mockReset();
  getGoals.mockReset();
});

// --- Fixtures ---

const fullSettings = {
  enabled: true,
  processingEnabled: true,
  processingWeight: 0.25,
  macroFitEnabled: true,
  macroFitWeight: 0.25,
  sugarSodiumEnabled: true,
  sugarSodiumWeight: 0.25,
  varietyEnabled: true,
  varietyWeight: 0.25,
};

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 1,
    source: "usda",
    externalId: "ext-1",
    name: "Test Food",
    brand: null,
    servingSize: null,
    servingUnit: null,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 5,
    sugarPer100g: null,
    sodiumPer100g: null,
    novaGroup: null,
    foodGroup: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    loggedDate: "2026-07-06",
    foodId: 1,
    amount: 100,
    unit: "g",
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    sugar: null,
    sodium: null,
    ...overrides,
  };
}

function emptyLogsForDate(): LogsForDate {
  return { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
}

// --- Settings get/upsert ---

describe("getHealthScoreSettings", () => {
  it("creates and returns a default row (all enabled, 0.25 each) when none exists yet", async () => {
    const result = await getHealthScoreSettings();

    expect(result).toEqual(fullSettings);
    expect(store).toHaveLength(1);
  });

  it("returns the existing row on a second call rather than creating another", async () => {
    const first = await getHealthScoreSettings();
    const second = await getHealthScoreSettings();

    expect(second).toEqual(first);
    expect(store).toHaveLength(1);
  });
});

describe("upsertHealthScoreSettings", () => {
  it("round-trips a full settings object", async () => {
    const input = {
      enabled: false,
      processingEnabled: true,
      processingWeight: 0.4,
      macroFitEnabled: false,
      macroFitWeight: 0.1,
      sugarSodiumEnabled: true,
      sugarSodiumWeight: 0.3,
      varietyEnabled: true,
      varietyWeight: 0.2,
    };

    const result = await upsertHealthScoreSettings(input);
    expect(result).toEqual(input);

    const fetched = await getHealthScoreSettings();
    expect(fetched).toEqual(input);
  });

  it("updates the existing row on a second call, rather than inserting a second row", async () => {
    await upsertHealthScoreSettings(fullSettings);
    const updated = await upsertHealthScoreSettings({ ...fullSettings, enabled: false });

    expect(updated.enabled).toBe(false);
    expect(store).toHaveLength(1);
  });
});

describe("PUT /api/health-score/settings — route-level Zod validation", () => {
  const app = new Hono();
  app.route("/api/health-score", healthScoreRoute);

  it("returns 200 with the saved settings for a valid body", async () => {
    const res = await app.request("/api/health-score/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullSettings),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fullSettings);
  });

  it("returns 400 when a weight is outside [0, 1]", async () => {
    const res = await app.request("/api/health-score/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fullSettings, processingWeight: 1.5 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });
});

// --- Sub-score formulas ---

describe("computeHealthScore — master toggle", () => {
  it("returns { status: 'hidden' } when the master enabled toggle is off", async () => {
    await upsertHealthScoreSettings({ ...fullSettings, enabled: false });

    const result = await computeHealthScore("2026-07-06");

    expect(result).toEqual({ status: "hidden" });
    expect(getLogsByDate).not.toHaveBeenCalled();
  });
});

describe("computeHealthScore — processing (NOVA) factor", () => {
  it("averages NOVA-derived scores across entries with a non-null novaGroup", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ id: 1, foodId: 1 }), makeEntry({ id: 2, foodId: 2 })],
      totals: { calories: 200, protein: 20, carbs: 20, fat: 10 },
    });
    getFoodById.mockImplementation(async (id) =>
      id === 1 ? makeFood({ id: 1, novaGroup: 1 }) : makeFood({ id: 2, novaGroup: 4 }),
    );

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      // (100 + 10) / 2 = 55
      expect(result.score).toBeCloseTo(55);
      expect(result.factors.processing).toEqual({ score: 55, weight: 1 });
    }
  });

  it("excludes entries with a null novaGroup from the average rather than penalizing them", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ id: 1, foodId: 1 }), makeEntry({ id: 2, foodId: 2 })],
      totals: { calories: 200, protein: 20, carbs: 20, fat: 10 },
    });
    getFoodById.mockImplementation(async (id) =>
      id === 1 ? makeFood({ id: 1, novaGroup: 2 }) : makeFood({ id: 2, novaGroup: null }),
    );

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      // only entry 1 (novaGroup 2 -> 75) counts.
      expect(result.score).toBeCloseTo(75);
    }
  });

  it("is excluded from the composite (renormalized weights) when no entry has a novaGroup", async () => {
    await upsertHealthScoreSettings(fullSettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ id: 1, foodId: 1 })],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    getFoodById.mockResolvedValue(makeFood({ novaGroup: null }));
    getGoals.mockResolvedValue(null);

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.factors.processing).toBeNull();
    }
  });
});

describe("computeHealthScore — macro-fit factor", () => {
  it("computes the average relative-error-based score against goals", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    // `computeMacroFitScore` derives the day's totals via `computeLogTotals`
    // over these entries directly — the mock's `totals` field is unused by
    // that path, so the entry itself must carry the intended daily totals.
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1800, protein: 90, carbs: 200, fat: 60 })],
      totals: { calories: 1800, protein: 90, carbs: 200, fat: 60 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    // relative errors: calories |1800-2000|/2000=0.1, protein |90-100|/100=0.1,
    // carbs |200-200|/200=0, fat |60-50|/50=0.2 -> avg = 0.1 -> score = 90
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(90);
    }
  });

  it("is excluded when goals are unset", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry()],
      totals: { calories: 1800, protein: 90, carbs: 200, fat: 60 },
    });
    getGoals.mockResolvedValue(null);

    const result = await computeHealthScore("2026-07-06");

    expect(result).toEqual({ status: "insufficient_data" });
  });

  it("is excluded when there are no log entries, even with goals set", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue(emptyLogsForDate());
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    expect(result).toEqual({ status: "insufficient_data" });
  });

  it("skips a macro whose goal is 0 to avoid divide-by-zero", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 2000, protein: 100, carbs: 200, fat: 50 })],
      totals: { calories: 2000, protein: 100, carbs: 200, fat: 50 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 0 });

    const result = await computeHealthScore("2026-07-06");

    // fat goal is 0 -> skipped; the other three macros match exactly -> avg
    // relative error 0 -> score 100.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(100);
    }
  });
});

describe("computeHealthScore — diet message", () => {
  // Isolate the message logic from the four scored factors by enabling only
  // sugarSodium (always computable once there's at least one entry,
  // regardless of goals) so `result.status` is "ok" without macroFit's own
  // goal-gating interfering.
  const messageOnlySettings = {
    ...fullSettings,
    processingEnabled: false,
    macroFitEnabled: false,
    sugarSodiumEnabled: true,
    varietyEnabled: false,
  };

  it("neither hit -> 'Get in some more protein today!'", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1000, protein: 50, carbs: 100, fat: 30, sugar: 0, sodium: 0 })],
      totals: { calories: 1000, protein: 50, carbs: 100, fat: 30 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    // calories: |1000-2000|/2000=0.5 (not hit), protein: |50-100|/100=0.5 (not hit)
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBe("Get in some more protein today!");
    }
  });

  it("calories hit, protein missed -> 'Your diet was a little light on protein today.'", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1900, protein: 50, carbs: 100, fat: 30, sugar: 0, sodium: 0 })],
      totals: { calories: 1900, protein: 50, carbs: 100, fat: 30 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    // calories: |1900-2000|/2000=0.05 (hit), protein: |50-100|/100=0.5 (not hit)
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBe("Your diet was a little light on protein today.");
    }
  });

  it("both hit -> 'Solid day — you hit both your calorie and protein goals!'", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1900, protein: 95, carbs: 100, fat: 30, sugar: 0, sodium: 0 })],
      totals: { calories: 1900, protein: 95, carbs: 100, fat: 30 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    // calories: |1900-2000|/2000=0.05 (hit), protein: |95-100|/100=0.05 (hit)
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBe("Solid day — you hit both your calorie and protein goals!");
    }
  });

  it("calories missed, protein hit -> 'Good protein today — keep an eye on your calorie goal.'", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1000, protein: 95, carbs: 100, fat: 30, sugar: 0, sodium: 0 })],
      totals: { calories: 1000, protein: 95, carbs: 100, fat: 30 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    // calories: |1000-2000|/2000=0.5 (not hit), protein: |95-100|/100=0.05 (hit)
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBe("Good protein today — keep an eye on your calorie goal.");
    }
  });

  it("is null when goals aren't set", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: 0, sodium: 0 })],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    getGoals.mockResolvedValue(null);

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBeNull();
    }
  });

  it("is null when there are no log entries that day, even with goals set", async () => {
    // Isolate via variety instead of sugarSodium here, since sugarSodium
    // requires entries on the requested day to be computable at all — using
    // it would collapse straight to "insufficient_data" rather than
    // exercising the message's own entries-empty branch. Variety's 7-day
    // window lets another day carry an entry so the composite is still
    // computable while the requested day itself has none.
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: true,
    });
    getLogsByDate.mockImplementation(async (date) => {
      if (date === "2026-07-06") return emptyLogsForDate();
      if (date === "2026-06-30") {
        return {
          entries: [makeEntry({ foodId: 1 })],
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        };
      }
      return emptyLogsForDate();
    });
    getFoodById.mockResolvedValue(makeFood({ id: 1, foodGroup: "protein" }));
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBeNull();
    }
  });

  it("is null when the calorie goal is 0", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1900, protein: 95, sugar: 0, sodium: 0 })],
      totals: { calories: 1900, protein: 95, carbs: 10, fat: 5 },
    });
    getGoals.mockResolvedValue({ calories: 0, protein: 100, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBeNull();
    }
  });

  it("is null when the protein goal is 0", async () => {
    await upsertHealthScoreSettings(messageOnlySettings);
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 1900, protein: 95, sugar: 0, sodium: 0 })],
      totals: { calories: 1900, protein: 95, carbs: 10, fat: 5 },
    });
    getGoals.mockResolvedValue({ calories: 2000, protein: 0, carbs: 200, fat: 50 });

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.message).toBeNull();
    }
  });
});

describe("computeHealthScore — sugar/sodium factor", () => {
  it("averages the sugar and sodium sub-scores against their reference limits", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: 50, sodium: 3450 })], // sugar at limit, sodium 1.5x limit
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });

    const result = await computeHealthScore("2026-07-06");

    // sugar 50 <= 50 -> 100. sodium 3450 = 1.5x 2300 -> 100*(1-0.5) = 50.
    // avg = 75.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(75);
    }
  });

  it("treats null sugar/sodium on an entry as 0, not as a reason to skip the day", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: null, sodium: null })],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(100);
    }
  });

  it("clamps at 0 once totals reach or exceed 2x the limit", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: 200, sodium: 5000 })],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(0);
    }
  });

  it("is excluded when there are no log entries", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue(emptyLogsForDate());

    const result = await computeHealthScore("2026-07-06");

    expect(result).toEqual({ status: "insufficient_data" });
  });
});

describe("computeHealthScore — variety factor", () => {
  it("scores distinct food groups across the rolling 7-day window as a fraction of 6", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
    });

    // Requested date 2026-07-06 -> window is 2026-06-30..2026-07-06.
    getLogsByDate.mockImplementation(async (date) => {
      if (date === "2026-06-30") {
        return { entries: [makeEntry({ foodId: 1 })], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
      }
      if (date === "2026-07-06") {
        return {
          entries: [makeEntry({ foodId: 2 }), makeEntry({ foodId: 3 })],
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        };
      }
      return emptyLogsForDate();
    });
    getFoodById.mockImplementation(async (id) => {
      if (id === 1) return makeFood({ id: 1, foodGroup: "protein" });
      if (id === 2) return makeFood({ id: 2, foodGroup: "vegetable" });
      return makeFood({ id: 3, foodGroup: "other" }); // excluded from the count
    });

    const result = await computeHealthScore("2026-07-06");

    // distinct meaningful groups: protein, vegetable (not "other") -> 2/6 * 100
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo((2 / 6) * 100);
    }
  });

  it("is excluded when the whole 7-day window has zero log entries", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
    });
    getLogsByDate.mockResolvedValue(emptyLogsForDate());

    const result = await computeHealthScore("2026-07-06");

    expect(result).toEqual({ status: "insufficient_data" });
  });
});

describe("computeHealthScore — renormalization + composite", () => {
  it("renormalizes weights across only enabled+computable factors (2 of 4 excluded)", async () => {
    await upsertHealthScoreSettings(fullSettings); // all enabled, 0.25 each
    // Same entries/food resolve for every date the variety window queries,
    // so the log entry present "today" is also present in the 7-day window
    // — meaning variety is computable here (score 0, no meaningful food
    // group found), not excluded outright. Only processing (no NOVA) and
    // macroFit (no goals) end up excluded.
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: 0, sodium: 0 })],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    getFoodById.mockResolvedValue(makeFood({ novaGroup: null, foodGroup: null }));
    getGoals.mockResolvedValue(null);

    const result = await computeHealthScore("2026-07-06");

    // sugarSodium=100 (sugar=0, sodium=0), variety=0 (no meaningful food
    // group among entries) -> equal 0.25 weights renormalized to 0.5 each.
    // composite = (100*0.5 + 0*0.5) = 50.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(50);
      expect(result.factors.sugarSodium).toEqual({ score: 100, weight: 0.5 });
      expect(result.factors.variety).toEqual({ score: 0, weight: 0.5 });
      expect(result.factors.processing).toBeNull();
      expect(result.factors.macroFit).toBeNull();
    }
  });

  it("weights unequal per-factor settings correctly in the composite", async () => {
    await upsertHealthScoreSettings({
      enabled: true,
      processingEnabled: true,
      processingWeight: 0.5,
      macroFitEnabled: false,
      macroFitWeight: 0.25,
      sugarSodiumEnabled: true,
      sugarSodiumWeight: 0.5,
      varietyEnabled: false,
      varietyWeight: 0.25,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ foodId: 1, sugar: 0, sodium: 0 })],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    getFoodById.mockResolvedValue(makeFood({ novaGroup: 1 })); // processing -> 100

    const result = await computeHealthScore("2026-07-06");

    // processing weight 0.5, sugarSodium weight 0.5 -> already sum to 1, no
    // renormalization needed. processing=100, sugarSodium=100 -> composite 100.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(100);
      expect(result.factors.processing).toEqual({ score: 100, weight: 0.5 });
      expect(result.factors.sugarSodium).toEqual({ score: 100, weight: 0.5 });
    }
  });

  it("returns { status: 'insufficient_data' } when zero factors are enabled+computable", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry()],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });

    const result = await computeHealthScore("2026-07-06");

    expect(result).toEqual({ status: "insufficient_data" });
  });
});

describe("GET /api/health-score — route", () => {
  const app = new Hono();
  app.route("/api/health-score", healthScoreRoute);

  it("returns 400 for an invalid date", async () => {
    const res = await app.request("/api/health-score?date=not-a-date");
    expect(res.status).toBe(400);
  });

  it("returns 200 with { status: 'hidden' } when the master toggle is off", async () => {
    await upsertHealthScoreSettings({ ...fullSettings, enabled: false });

    const res = await app.request("/api/health-score?date=2026-07-06");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "hidden" });
  });

  it("returns 400 when the date query param is missing entirely", async () => {
    const res = await app.request("/api/health-score");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a date that rolls over (Feb 30 doesn't exist)", async () => {
    const res = await app.request("/api/health-score?date=2024-02-30");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/health-score/settings — route", () => {
  const app = new Hono();
  app.route("/api/health-score", healthScoreRoute);

  it("returns 200 with default settings when none exist yet", async () => {
    const res = await app.request("/api/health-score/settings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fullSettings);
  });
});

// --- Adversarial / edge-case tests (tester pass) ---

describe("PUT /api/health-score/settings — additional adversarial validation", () => {
  const app = new Hono();
  app.route("/api/health-score", healthScoreRoute);

  it("returns 400 when a required field is missing", async () => {
    const bodyWithoutVarietyWeight: Record<string, unknown> = { ...fullSettings };
    delete bodyWithoutVarietyWeight.varietyWeight;

    const res = await app.request("/api/health-score/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyWithoutVarietyWeight),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });

  it("returns 400 when a field has the wrong type", async () => {
    const res = await app.request("/api/health-score/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fullSettings, enabled: "yes" }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });

  it("returns 400 when a weight is negative", async () => {
    const res = await app.request("/api/health-score/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fullSettings, macroFitWeight: -0.1 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });
});

describe("computeHealthScore — 3-factor renormalization with uneven, non-summing weights", () => {
  it("renormalizes 3 enabled+computable factors whose raw weights don't sum to 1", async () => {
    await upsertHealthScoreSettings({
      enabled: true,
      processingEnabled: true,
      processingWeight: 0.4,
      macroFitEnabled: true,
      macroFitWeight: 0.3,
      sugarSodiumEnabled: true,
      sugarSodiumWeight: 0.2,
      varietyEnabled: false,
      varietyWeight: 0.1,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ foodId: 1, calories: 1800, protein: 90, carbs: 200, fat: 60, sugar: 50, sodium: 3450 })],
      totals: { calories: 1800, protein: 90, carbs: 200, fat: 60 },
    });
    getFoodById.mockResolvedValue(makeFood({ novaGroup: 1 })); // processing -> 100
    getGoals.mockResolvedValue({ calories: 2000, protein: 100, carbs: 200, fat: 50 }); // macroFit -> 90 (see earlier test)

    const result = await computeHealthScore("2026-07-06");

    // processing=100 (weight 0.4/0.9), macroFit=90 (weight 0.3/0.9),
    // sugarSodium=75 (weight 0.2/0.9; sugar at limit=100, sodium 1.5x=50 -> avg 75).
    // composite = 100*(4/9) + 90*(1/3) + 75*(2/9) = 400/9 + 30 + 150/9 = 91.1111...
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(91.1111, 3);
      // Weights compared with toBeCloseTo rather than toEqual: 0.4 + 0.3 + 0.2
      // doesn't sum to exactly 0.9 in floating point, so the renormalized
      // weight isn't bit-exact 4/9 — that's expected float noise, not a bug.
      expect(result.factors.processing?.score).toBe(100);
      expect(result.factors.processing?.weight).toBeCloseTo(4 / 9, 10);
      expect(result.factors.macroFit?.score).toBe(90);
      expect(result.factors.macroFit?.weight).toBeCloseTo(1 / 3, 10);
      expect(result.factors.sugarSodium?.score).toBe(75);
      expect(result.factors.sugarSodium?.weight).toBeCloseTo(2 / 9, 10);
      expect(result.factors.variety).toBeNull();
    }
  });
});

describe("computeHealthScore — macro-fit adversarial edge cases", () => {
  it("returns null (excluded) when every goal is exactly 0", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry()],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    getGoals.mockResolvedValue({ calories: 0, protein: 0, carbs: 0, fat: 0 });

    const result = await computeHealthScore("2026-07-06");

    // macroFit is the only enabled factor and it's excluded -> insufficient_data.
    expect(result).toEqual({ status: "insufficient_data" });
  });

  it("clamps the score at 0 (not negative) when the daily total is far above goal", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ calories: 500, protein: 0, carbs: 0, fat: 0 })],
      totals: { calories: 500, protein: 0, carbs: 0, fat: 0 },
    });
    // Only calories has a nonzero goal, so it's the sole term in the average:
    // relative error = |500-100|/100 = 4 -> 100 - 400 = -300 -> clamps to 0.
    getGoals.mockResolvedValue({ calories: 100, protein: 0, carbs: 0, fat: 0 });

    const result = await computeHealthScore("2026-07-06");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBe(0);
    }
  });
});

describe("computeHealthScore — sugar/sodium adversarial edge cases", () => {
  it("scores exactly 0 when total is exactly 2x the limit (not beyond)", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: 100, sodium: 2300 })], // sugar exactly 2x limit, sodium exactly at limit
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });

    const result = await computeHealthScore("2026-07-06");

    // sugarScore = 0 (exactly 2x), sodiumScore = 100 (exactly at limit) -> avg 50.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBe(50);
    }
  });

  it("averages correctly when one nutrient is over the limit and the other is under", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ sugar: 25, sodium: 2875 })], // sugar half the limit, sodium 25% over
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });

    const result = await computeHealthScore("2026-07-06");

    // sugarScore = 100 (under limit), sodiumScore = 100*(1-0.25) = 75 -> avg 87.5.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo(87.5);
    }
  });
});

describe("computeHealthScore — NOVA adversarial edge cases", () => {
  it("averages exactly across a mix of all four NOVA groups", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [
        makeEntry({ id: 1, foodId: 1 }),
        makeEntry({ id: 2, foodId: 2 }),
        makeEntry({ id: 3, foodId: 3 }),
        makeEntry({ id: 4, foodId: 4 }),
      ],
      totals: { calories: 400, protein: 40, carbs: 40, fat: 20 },
    });
    getFoodById.mockImplementation(async (id) => makeFood({ id, novaGroup: id }));

    const result = await computeHealthScore("2026-07-06");

    // (100 + 75 + 40 + 10) / 4 = 56.25
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBe(56.25);
    }
  });

  // Documents current (not necessarily desired) behavior for an out-of-range
  // novaGroup value. The Zod schema (`foodSchema.novaGroup`, min 1 max 4)
  // prevents this from arising through any real write path, but the `Food`
  // TS type itself is just `number | null` (Zod doesn't narrow to a numeric
  // literal union), so nothing at the type level stops a test double (or a
  // future direct-DB-write bug) from producing one. Unlike a null novaGroup
  // (excluded from the average), `NOVA_SUB_SCORE[food.novaGroup] ?? 0` scores
  // an unmapped number as 0 and *includes* it in the average — silently
  // treating "unclassifiable" the same as "worst possible processing score."
  // Flagged as a fragility, not fixed here (unreachable via the actual schema
  // today).
  it("scores an out-of-range novaGroup as 0 and includes it in the average, rather than excluding it like null", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
      varietyEnabled: false,
    });
    getLogsByDate.mockResolvedValue({
      entries: [makeEntry({ id: 1, foodId: 1 }), makeEntry({ id: 2, foodId: 2 })],
      totals: { calories: 200, protein: 20, carbs: 20, fat: 10 },
    });
    getFoodById.mockImplementation(async (id) =>
      id === 1 ? makeFood({ id: 1, novaGroup: 1 }) : makeFood({ id: 2, novaGroup: 5 }),
    );

    const result = await computeHealthScore("2026-07-06");

    // (100 + 0) / 2 = 50 — the out-of-range entry drags the average down
    // rather than being excluded the way a null novaGroup would be.
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBe(50);
    }
  });
});

describe("computeHealthScore — variety adversarial edge cases", () => {
  it("scores based on just the requested day's food groups when the rest of the window is empty", async () => {
    await upsertHealthScoreSettings({
      ...fullSettings,
      processingEnabled: false,
      macroFitEnabled: false,
      sugarSodiumEnabled: false,
    });
    getLogsByDate.mockImplementation(async (date) => {
      if (date === "2026-07-06") {
        return {
          entries: [makeEntry({ foodId: 1 }), makeEntry({ foodId: 2 })],
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        };
      }
      return emptyLogsForDate();
    });
    getFoodById.mockImplementation(async (id) => {
      if (id === 1) return makeFood({ id: 1, foodGroup: "protein" });
      return makeFood({ id: 2, foodGroup: "vegetable" });
    });

    const result = await computeHealthScore("2026-07-06");

    // 2 distinct meaningful groups out of 6 -> 33.33...
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeCloseTo((2 / 6) * 100);
    }
  });
});

describe("getHealthScoreSettings — concurrent default-creation race", () => {
  // NOTE: this fake DB's `select`/`insert` resolve immediately with no real
  // I/O latency, so its microtask interleaving happens to serialize these two
  // calls (store ends up length 1 in this harness) — that is an artifact of
  // the mock, NOT a guarantee about the real code. `getHealthScoreSettings`
  // has no unique constraint, transaction, or lock between its `select` and
  // its conditional `insert`; against a real network-latency DB, two
  // concurrent requests hitting an empty table could both see no existing
  // row and both insert, producing two settings rows (with `getGoals`-style
  // "singleton in practice" assumed by `[existing] = await db.select()...`
  // elsewhere silently picking whichever row sorts first). Flagged as a
  // fragility per the project's single-implicit-user scope, not fixed here.
  it("documents the current behavior when called concurrently with no existing row (mock-serialized, not a safety proof)", async () => {
    const [first, second] = await Promise.all([getHealthScoreSettings(), getHealthScoreSettings()]);

    expect(first).toEqual(fullSettings);
    expect(second).toEqual(fullSettings);
    expect(store.length).toBeGreaterThanOrEqual(1);
  });
});
