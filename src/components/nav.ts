"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export type Tab = { href: string; label: string };

/**
 * The sections of the signed-in app, one route each. Admins only administrate:
 * they don't list, borrow or lend, so they get Browse (to moderate listings)
 * and Admin.
 */
export function buildTabs(role: "admin" | "user"): Tab[] {
  if (role === "admin") {
    return [
      { href: "/browse", label: "Browse tools" },
      { href: "/admin", label: "Admin" },
    ];
  }
  return [
    { href: "/browse", label: "Browse tools" },
    { href: "/listings", label: "My listings" },
    { href: "/loans", label: "Current lends & borrows" },
    { href: "/history", label: "History" },
  ];
}

/** Loans waiting on the owner: new requests and returns to confirm. */
export function useNeedsAction(enabled = true) {
  const incoming = useQuery(api.loans.incoming, enabled ? {} : "skip");
  return (
    incoming?.filter(
      (l) => l.status === "requested" || l.status === "return_pending",
    ).length ?? 0
  );
}
