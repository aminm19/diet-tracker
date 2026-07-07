import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

// Pill-button recipes actually in use across the app. Each variant bakes in
// the exact class string that was previously hand-pasted at its call
// site(s) — kept as separate variants (rather than one generic "primary")
// because the padding/ring-offset/disabled-state details genuinely differ
// between contexts (e.g. modal submit buttons vs. the top-level "Add food"
// button vs. `EntryCard`'s inline edit form).
export type ButtonVariant =
  | "primary"
  | "primaryLarge"
  | "secondary"
  | "retry"
  | "retryModal"
  | "entryPrimary"
  | "entrySecondary";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Modal submit buttons ("Log it" / "Save goals" / "Save settings") — group
  // pill with a trailing icon-in-circle child, disables on submit.
  primary:
    "group flex items-center gap-2 rounded-full bg-ink py-2.5 pl-5 pr-2.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
  // Top-level "Add food" button.
  primaryLarge:
    "group flex items-center gap-2 rounded-full bg-ink py-3 pl-6 pr-3 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  // Modal "Cancel"/"Back" buttons.
  secondary:
    "rounded-full bg-black/[0.05] px-5 py-2.5 text-sm font-semibold text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
  // `EntryList`'s "Retry" (leading icon, ring-offset-canvas).
  retry:
    "group flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  // `HealthScoreSettingsModal`'s "Retry" — same shape, no ring-offset (as in
  // the pre-existing markup).
  retryModal:
    "group flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
  // `EntryCard`'s inline edit-form "Save".
  entryPrimary:
    "rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50",
  // `EntryCard`'s inline edit-form "Cancel".
  entrySecondary:
    "rounded-full bg-black/[0.05] px-5 py-2 text-sm font-semibold text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", type = "button", ...rest },
  ref,
) {
  const combined = className ? `${VARIANT_CLASSES[variant]} ${className}` : VARIANT_CLASSES[variant];
  return <button ref={ref} type={type} className={combined} {...rest} />;
});
