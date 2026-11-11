"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AdminPanel } from "./admin-panel";
import { AllTools } from "./all-tools";
import { LoansView } from "./loan-lists";
import { MyListings } from "./my-listings";
import { buildTabs, useNav, useNeedsAction } from "./nav-context";
import { Loading } from "./ui";

export type Me = {
  id: string;
  role: "admin" | "user";
  username: string;
  trustedLender: boolean;
};

/** Count of loans waiting on the owner (new requests, returns to confirm). */
function ActionBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-2 rounded-full bg-violet-600 px-1.5 py-0.5 text-xs font-semibold text-white"
      title="Requests or returns waiting for your action"
    >
      {count}
    </span>
  );
}

export function Dashboard() {
  const me = useQuery(api.users.me);
  const storeUser = useMutation(api.users.storeUser);
  const needsAction = useNeedsAction();
  const { tab: requestedTab, setTab } = useNav();

  // Make sure the caller has a profile row (used for the Trusted Lender flag).
  useEffect(() => {
    storeUser().catch(() => {});
  }, [storeUser]);

  if (me === undefined) return <Loading />;

  const tabs = buildTabs(me.role);
  // e.g. a non-admin landing on #admin falls back to Browse.
  const tab = tabs.some((t) => t.key === requestedTab) ? requestedTab : "browse";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold sm:text-2xl tracking-tight text-stone-800">
          Hi, {me.username}
        </h1>
        {me.role === "admin" && (
          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
            Admin
          </span>
        )}
        {me.trustedLender && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            ★ Trusted Lender
          </span>
        )}
      </div>

      {/* Desktop: tab bar */}
      <nav
        className="mb-6 hidden gap-1 border-b border-stone-200 sm:flex"
        aria-label="Sections"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {t.label}
            {t.key === "current" && <ActionBadge count={needsAction} />}
          </button>
        ))}
      </nav>

      {/* Mobile: the menu lives in the header; show the current section here */}
      <h2 className="mb-4 text-lg font-semibold text-stone-800 sm:hidden">
        {tabs.find((t) => t.key === tab)?.label}
      </h2>

      {tab === "browse" && <AllTools me={me} />}
      {tab === "listings" && <MyListings />}
      {tab === "current" && <LoansView mode="current" />}
      {tab === "history" && <LoansView mode="history" />}
      {tab === "admin" && me.role === "admin" && <AdminPanel />}
    </div>
  );
}
