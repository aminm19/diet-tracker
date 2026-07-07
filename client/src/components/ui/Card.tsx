import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { forwardRef } from "react";

// Shared "double-card" shell: a soft outer wash (bg-black/[0.03], ring, drop
// shadow) wrapping a white inner surface with an inset highlight. Used across
// `DaySummary`, `EntryList`, `EntryCard`, and the modal panels — the exact
// corner radius and shadow strength varies by context (see `radius`/`shadow`
// below), and the padding/layout of the inner surface is left to the caller
// via `innerClassName` since it differs at every call site.
type CardRadius = "lg" | "sm";
type CardShadow = "soft" | "modal";

const OUTER_BASE: Record<CardRadius, string> = {
  lg: "rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/5",
  sm: "rounded-2xl bg-black/[0.03] p-1.5 ring-1 ring-black/5",
};

const INNER_BASE: Record<CardRadius, string> = {
  lg: "rounded-[calc(2rem-0.375rem)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]",
  sm: "rounded-[calc(1rem-0.25rem)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]",
};

const OUTER_SHADOW: Record<CardShadow, string> = {
  soft: "shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)]",
  modal: "shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)]",
};

interface CardOwnProps {
  as?: "div" | "section";
  radius?: CardRadius;
  shadow?: CardShadow;
  innerClassName?: string;
  children: ReactNode;
}

type CardProps = CardOwnProps & Omit<ComponentPropsWithoutRef<"div">, keyof CardOwnProps>;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { as = "div", radius = "lg", shadow = "soft", className = "", innerClassName = "", children, ...rest },
  ref,
) {
  const outerClassName = [OUTER_BASE[radius], OUTER_SHADOW[shadow], className].filter(Boolean).join(" ");
  const inner = <div className={[INNER_BASE[radius], innerClassName].filter(Boolean).join(" ")}>{children}</div>;

  if (as === "section") {
    return (
      <section className={outerClassName} {...rest}>
        {inner}
      </section>
    );
  }

  return (
    <div ref={ref} className={outerClassName} {...rest}>
      {inner}
    </div>
  );
});
