// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DaySummary } from "./DaySummary";

const totals = { calories: 500, protein: 20, carbs: 40, fat: 10 };

describe("DaySummary", () => {
  it("renders without crashing when goals is null", () => {
    render(<DaySummary date="2026-07-06" onDateChange={vi.fn()} totals={totals} goals={null} />);
    expect(screen.getByText("Set goals to track progress →")).toBeInTheDocument();
  });

  it("does not show the 'set goals' prompt when goals are present", () => {
    render(
      <DaySummary
        date="2026-07-06"
        onDateChange={vi.fn()}
        totals={totals}
        goals={{ calories: 2000, protein: 150, carbs: 200, fat: 70 }}
      />,
    );
    expect(screen.queryByText("Set goals to track progress →")).not.toBeInTheDocument();
  });

  it("renders the date nav and all four macro rows", () => {
    render(<DaySummary date="2026-07-06" onDateChange={vi.fn()} totals={totals} goals={null} />);
    expect(screen.getByRole("navigation", { name: "Day navigation" })).toBeInTheDocument();
    expect(screen.getByText("Calories")).toBeInTheDocument();
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Carbs")).toBeInTheDocument();
    expect(screen.getByText("Fat")).toBeInTheDocument();
  });
});
