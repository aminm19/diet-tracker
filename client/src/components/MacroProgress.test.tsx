// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MacroProgress } from "./MacroProgress";

describe("MacroProgress", () => {
  it("renders a raw value with no progressbar role when goal is null", () => {
    render(<MacroProgress label="Calories" value={1200} unit="kcal" goal={null} />);
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders a raw value with no progressbar role when goal is undefined", () => {
    render(<MacroProgress label="Calories" value={1200} unit="kcal" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("does not divide by zero when goal is 0 (treated as no goal)", () => {
    render(<MacroProgress label="Protein" value={50} unit="g" goal={0} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // Value itself still renders fine, no NaN/Infinity leaking through.
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("renders a progressbar with correct percentage when goal is set", () => {
    render(<MacroProgress label="Protein" value={50} unit="g" goal={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("clamps the fill percentage at 100 when value exceeds goal", () => {
    render(<MacroProgress label="Protein" value={150} unit="g" goal={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows value/goal text when a goal is present", () => {
    render(<MacroProgress label="Protein" value={50} unit="g" goal={100} />);
    expect(screen.getByText("/ 100")).toBeInTheDocument();
  });

  it("handles negative value without crashing (no goal)", () => {
    render(<MacroProgress label="Weird" value={-5} unit="g" goal={null} />);
    expect(screen.getByText("-5")).toBeInTheDocument();
  });
});
