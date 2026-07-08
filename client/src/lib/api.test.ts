// @vitest-environment jsdom
// No dedicated api.test.ts existed before this — this is a small, targeted
// check that the visitor-id header is attached to outgoing requests via the
// shared `request` wrapper, not a full suite covering every endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFoodById } from "./api";

describe("api request wrapper", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches an X-Visitor-Id header matching the persisted visitor id", async () => {
    await getFoodById(1);

    const mockFetch = vi.mocked(fetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    const visitorId = localStorage.getItem("diet-tracker:visitor-id");
    expect(visitorId).toBeTruthy();
    expect(headers.get("X-Visitor-Id")).toBe(visitorId);
  });
});
