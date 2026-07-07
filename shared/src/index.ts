// Placeholder export so client/server can resolve the `shared` workspace
// package before real Zod/Drizzle schemas land here (Unit 2+).
export const SHARED_SCAFFOLD_MARKER = "diet-tracker-shared" as const;

export * from "./schema.js";
export * from "./food.js";
export * from "./log.js";
export * from "./goals.js";
