"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { btnSecondary, cardCls, formatRange, todayISO } from "@/lib/ui";
import { Empty, ErrorNote, Loading, StatusBadge } from "./ui";

/** Admin only. Convex rejects these queries for everyone else. */
export function AdminPanel() {
  const loans = useQuery(api.loans.listAll);
  const users = useQuery(api.users.listAll);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const [error, setError] = useState<string | null>(null);

  async function toggle(userId: Id<"users">, trusted: boolean) {
    setError(null);
    try {
      await setTrusted({ userId, trusted });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-8">
      <ErrorNote message={error} />

      <section>
        <h3 className="mb-3 text-base font-semibold text-stone-800">
          Lenders
        </h3>
        {users === undefined ? (
          <Loading />
        ) : users.length === 0 ? (
          <Empty>No users have signed in yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u._id}
                className={`${cardCls} flex flex-wrap items-center justify-between gap-3 !py-3`}
              >
                <span className="text-sm font-medium text-stone-800">
                  {u.username}
                  {u.trustedLender && (
                    <span className="ml-2 text-amber-600">★ Trusted</span>
                  )}
                </span>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => toggle(u._id, !u.trustedLender)}
                >
                  {u.trustedLender ? "Remove trusted" : "Mark as trusted"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-base font-semibold text-stone-800">
          All loans
        </h3>
        {loans === undefined ? (
          <Loading />
        ) : loans.length === 0 ? (
          <Empty>No loans yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {loans.map((loan) => (
              <li
                key={loan._id}
                className={`${cardCls} flex flex-wrap items-center justify-between gap-3 !py-3`}
              >
                <div>
                  <p className="text-sm font-medium text-stone-800">
                    {loan.toolName}
                  </p>
                  <p className="text-xs text-stone-500">
                    {loan.borrowerName} · {formatRange(loan.startDate, loan.endDate)}
                  </p>
                </div>
                <StatusBadge
                  status={loan.status}
                  overdue={loan.status === "approved" && loan.endDate < todayISO()}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-stone-500">
        To remove any listing, open <b>Browse tools</b> and use <b>Remove</b>.
      </p>
    </div>
  );
}
