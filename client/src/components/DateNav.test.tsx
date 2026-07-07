// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateNav } from "./DateNav";

describe("DateNav", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0, 0)); // 2026-07-06
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onChange with the previous day when "Previous day" is clicked', () => {
    const onChange = vi.fn();
    render(<DateNav date="2026-07-06" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-05");
  });

  it('calls onChange with the next day when "Next day" is clicked', () => {
    const onChange = vi.fn();
    render(<DateNav date="2026-07-06" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-07");
  });

  it("navigating across a month boundary produces a correct date", () => {
    const onChange = vi.fn();
    render(<DateNav date="2026-07-31" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-01");
  });

  it('shows "Today" as the label for the current date', () => {
    render(<DateNav date="2026-07-06" onChange={vi.fn()} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("jump-to-date input calls onChange with the picked date", () => {
    const onChange = vi.fn();
    render(<DateNav date="2026-07-06" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Jump to a specific date"), { target: { value: "2026-03-15" } });
    expect(onChange).toHaveBeenCalledWith("2026-03-15");
  });

  it("jump-to-date input does not call onChange when cleared to empty", () => {
    const onChange = vi.fn();
    render(<DateNav date="2026-07-06" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Jump to a specific date"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the app's text-ink token (not an ad-hoc black opacity) for the jump-to-date hover state", () => {
    render(<DateNav date="2026-07-06" onChange={vi.fn()} />);
    const label = screen.getByText("Jump to date").closest("label")!;
    expect(label.className).toContain("hover:text-ink");
    expect(label.className).not.toContain("hover:text-black/60");
  });

  it("gives the native date input an intentional focus-visible frame (ring + accent-color)", () => {
    render(<DateNav date="2026-07-06" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Jump to a specific date");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("accent-[var(--color-ink)]");
  });
});
