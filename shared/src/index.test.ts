import { describe, expect, it } from "vitest";
import { SHARED_SCAFFOLD_MARKER } from "./index";

describe("shared package scaffold", () => {
  it("exports the expected placeholder marker", () => {
    expect(SHARED_SCAFFOLD_MARKER).toBe("diet-tracker-shared");
  });
});
