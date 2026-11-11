export { CATEGORIES } from "../../convex/lib/categories";

export type Condition = "like_new" | "good" | "well_used";

// Best to worst. Keys match convex/lib/condition.ts. Tier 1 vs 2 splits on
// appearance, tier 2 vs 3 on function. (Key `well_used` is kept for the third
// tier so stored data needs no migration, even though the label changed.)
export const CONDITIONS: {
  key: Condition;
  label: string;
  help: string;
}[] = [
  {
    key: "like_new",
    label: "Like new",
    help: "Barely used, no visible wear, works perfectly.",
  },
  {
    key: "good",
    label: "Good",
    help: "Visible wear such as scratches or scuffs; everything works as intended.",
  },
  {
    key: "well_used",
    label: "Works with limits",
    help: "Any amount of wear; works, but has quirks or limits. Describe them in the notes.",
  },
];

export const conditionStyle: Record<Condition, string> = {
  like_new: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  good: "bg-sky-50 text-sky-700 ring-sky-200",
  well_used: "bg-amber-50 text-amber-700 ring-amber-200",
};

export const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm sm:py-2 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

export const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700 sm:px-3 sm:py-1.5 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

export const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3.5 py-2.5 text-sm font-medium text-rose-600 sm:px-3 sm:py-1.5 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400";

export const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-800 sm:text-sm placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200";

export const cardCls =
  "rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5";

export type LoanStatus =
  | "requested"
  | "approved"
  | "return_pending"
  | "declined"
  | "returned"
  | "cancelled";

export const statusLabel: Record<LoanStatus, string> = {
  requested: "Pending",
  approved: "Approved",
  return_pending: "Return pending",
  declined: "Declined",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const statusStyle: Record<LoanStatus, string> = {
  requested: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-sky-50 text-sky-700 ring-sky-200",
  return_pending: "bg-violet-50 text-violet-700 ring-violet-200",
  declined: "bg-rose-50 text-rose-700 ring-rose-200",
  returned: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-stone-100 text-stone-600 ring-stone-300",
};

export function formatRange(start: string, end: string): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/** Whole days past `endDate` (UTC dates, same clock the server uses). */
export function overdueDays(endDate: string): number {
  return Math.round(
    (Date.parse(`${todayISO()}T00:00:00Z`) -
      Date.parse(`${endDate}T00:00:00Z`)) /
      86_400_000,
  );
}

/** "today", "yesterday", "3 days ago" for a past timestamp in ms. */
export function agoLabel(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
