// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getVisitorId } from "./visitorId";

const STORAGE_KEY = "diet-tracker:visitor-id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("getVisitorId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates and persists a new UUID when localStorage is empty", () => {
    const id = getVisitorId();
    expect(id).toMatch(UUID_REGEX);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it("returns the same ID on a second call without regenerating", () => {
    const first = getVisitorId();
    const second = getVisitorId();
    expect(second).toBe(first);
  });

  it("returns the same ID as what's actually stored in localStorage", () => {
    const id = getVisitorId();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(id);
  });
});
