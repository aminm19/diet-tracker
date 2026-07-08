import type { HealthScoreFactorKey } from "shared";

export interface FactorConfig {
  key: HealthScoreFactorKey;
  label: string;
  description: string;
}

// Shared between `HealthScoreSettingsModal` (settings toggles) and
// `HealthScoreBadge` (breakdown popover) so both use the same factor labels.
export const FACTORS: FactorConfig[] = [
  {
    key: "processing",
    label: "Whole-food vs. processed",
    description: "Based on NOVA classification.",
  },
  {
    key: "macroFit",
    label: "Macro fit vs. goals",
    description: "How close the day's macros land to your goals.",
  },
  {
    key: "sugarSodium",
    label: "Sugar / sodium levels",
    description: "Penalizes high sugar and sodium intake.",
  },
  {
    key: "variety",
    label: "Food-group variety",
    description: "Rewards eating from a range of food groups.",
  },
];
