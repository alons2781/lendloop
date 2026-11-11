"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export type TabKey = "browse" | "listings" | "current" | "history" | "admin";

export function buildTabs(role: "admin" | "user") {
  // Admins only administrate: they don't list, borrow or lend, so they get
  // just Browse (to moderate listings) and Admin.
  if (role === "admin") {
    return [
      { key: "browse" as TabKey, label: "Browse tools" },
      { key: "admin" as TabKey, label: "Admin" },
    ];
  }
  return [
    { key: "browse" as TabKey, label: "Browse tools" },
    { key: "listings" as TabKey, label: "My listings" },
    { key: "current" as TabKey, label: "Current lends & borrows" },
    { key: "history" as TabKey, label: "History" },
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

type Nav = { tab: TabKey; setTab: (t: TabKey) => void };
const NavContext = createContext<Nav | null>(null);

const TAB_KEYS: TabKey[] = [
  "browse",
  "listings",
  "current",
  "history",
  "admin",
];

function tabFromHash(): TabKey | null {
  const h = window.location.hash.slice(1);
  return TAB_KEYS.find((k) => k === h) ?? null;
}

/**
 * Holds the active section so the header (mobile menu) and dashboard share
 * it. The section is mirrored in the URL hash (#history) so a page refresh
 * keeps you where you were.
 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<TabKey>("browse");

  // Restore from the hash after hydration (and on back/forward).
  useEffect(() => {
    const sync = () => setTabState(tabFromHash() ?? "browse");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const setTab = useCallback((t: TabKey) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
  }, []);

  return <NavContext value={{ tab, setTab }}>{children}</NavContext>;
}

export function useNav(): Nav {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used inside <NavProvider>");
  return ctx;
}
