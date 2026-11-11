// Single source of truth for listing categories. The UI imports this too
// (src/lib/ui.ts), so the dropdown and the server-side check can't drift.
export const CATEGORIES = [
  "Power Tools",
  "Hand Tools",
  "Garden",
  "Cleaning",
  "Ladders",
  "Automotive",
  "Kitchen",
  "Other",
] as const;

export function isCategory(value: string): boolean {
  return (CATEGORIES as readonly string[]).includes(value);
}
