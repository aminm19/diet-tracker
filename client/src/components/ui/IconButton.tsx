import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

// Icon-only circular button recipes actually in use. As with `Button`, kept
// as distinct variants rather than one generic shape because size,
// transition duration, and focus ring-offset color genuinely differ between
// contexts.
export type IconButtonVariant =
  | "close"
  | "entryNeutral"
  | "entryDangerSolid"
  | "entryDangerGhost"
  | "nav"
  | "ghost";

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  // Modal "Close" (×) button — identical across `AddFoodModal`, `GoalsModal`,
  // `HealthScoreSettingsModal`.
  close:
    "flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.1] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
  // `EntryCard`'s edit / cancel-delete buttons.
  entryNeutral:
    "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white bg-black/[0.05] text-ink hover:bg-black/[0.08]",
  // `EntryCard`'s confirm-delete button.
  entryDangerSolid:
    "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white bg-red-600/10 text-red-600 hover:bg-red-600/15",
  // `EntryCard`'s delete button (neutral idle state, red on hover).
  entryDangerGhost:
    "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white bg-black/[0.05] text-ink hover:bg-red-600/10 hover:text-red-600",
  // `DateNav`'s previous/next day buttons.
  nav:
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-ink transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  // `App`'s health-score gear button — borderless, muted icon.
  ghost:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: IconButtonVariant;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant, className = "", type = "button", ...rest },
  ref,
) {
  const combined = className ? `${VARIANT_CLASSES[variant]} ${className}` : VARIANT_CLASSES[variant];
  return <button ref={ref} type={type} className={combined} {...rest} />;
});
