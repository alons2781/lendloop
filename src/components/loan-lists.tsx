"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { errorMessage } from "@/lib/errors";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  cardCls,
  agoLabel,
  formatRange,
  overdueDays,
  todayISO,
} from "@/lib/ui";
import { Empty, ErrorNote, Loading, StatusBadge } from "./ui";

type LoanRow = FunctionReturnType<typeof api.loans.myRequests>[number];

/** "2 days overdue" + "Reminder sent yesterday" under a loan's dates. */
function LoanNotes({ loan }: { loan: LoanRow }) {
  const days = isOverdue(loan) ? overdueDays(loan.endDate) : 0;
  // Only mention a reminder once it's at least a day old (never "today").
  const reminderAgo =
    loan.lastReminderAt !== null ? agoLabel(loan.lastReminderAt) : null;
  const showReminder = reminderAgo !== null && reminderAgo !== "today";
  if (days <= 0 && !showReminder) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {days > 0 && (
        <p className="font-medium text-rose-600">
          {days} {days === 1 ? "day" : "days"} overdue
        </p>
      )}
      {showReminder && (
        <p className="text-stone-500">Reminder sent {reminderAgo}</p>
      )}
    </div>
  );
}

function isOverdue(loan: LoanRow) {
  return loan.status === "approved" && loan.endDate < todayISO();
}

export type LoanMode = "current" | "history";

// History starts with the latest few loans; "Show more" reveals the rest.
const HISTORY_PAGE = 4;

function ShowMore({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  if (shown >= total) return null;
  return (
    <div className="flex justify-center pt-1">
      <button type="button" className={btnSecondary} onClick={onMore}>
        Show more ({total - shown} more)
      </button>
    </div>
  );
}

/** current = still pending or out; history = declined or returned. */
function inMode(loan: LoanRow, mode: LoanMode) {
  const active =
    loan.status === "requested" ||
    loan.status === "approved" ||
    loan.status === "return_pending";
  return mode === "current" ? active : !active;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Both sides of the caller's loans, filtered to current or history. */
export function LoansView({ mode }: { mode: LoanMode }) {
  return (
    <div className="space-y-8">
      <Section title="Borrowing">
        <Borrowing mode={mode} />
      </Section>
      <Section title="Lending">
        <Lending mode={mode} />
      </Section>
    </div>
  );
}

/** Loans the caller asked for as a borrower. */
function Borrowing({ mode }: { mode: LoanMode }) {
  const all = useQuery(api.loans.myRequests);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const cancel = useMutation(api.loans.cancel);
  const reportReturned = useMutation(api.loans.reportReturned);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<Id<"loans"> | null>(null);

  async function run(id: Id<"loans">, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (all === undefined) return <Loading />;
  const matching = all.filter((l) => inMode(l, mode));
  const loans = mode === "history" ? matching.slice(0, limit) : matching;
  if (loans.length === 0) {
    return (
      <Empty>
        {mode === "current"
          ? "You aren't borrowing or requesting anything right now."
          : "No past borrows yet."}
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      <ul className="space-y-3">
        {loans.map((loan) => (
          <li
            key={loan._id}
            className={`${cardCls} flex flex-wrap items-center justify-between gap-3`}
          >
            <div>
              <p className="font-medium text-stone-800">{loan.toolName}</p>
              <p className="text-sm text-stone-500">
                {formatRange(loan.startDate, loan.endDate)}
              </p>
              <LoanNotes loan={loan} />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <StatusBadge status={loan.status} overdue={isOverdue(loan)} />
              {loan.status === "requested" && (
                <button
                  type="button"
                  className={`${btnDanger} max-sm:flex-1`}
                  disabled={busyId === loan._id}
                  onClick={() =>
                    run(loan._id, () => cancel({ loanId: loan._id }))
                  }
                >
                  Cancel request
                </button>
              )}
              {loan.status === "approved" && (
                <button
                  type="button"
                  className={`${btnSecondary} max-sm:flex-1`}
                  disabled={busyId === loan._id}
                  onClick={() =>
                    run(loan._id, () => reportReturned({ loanId: loan._id }))
                  }
                >
                  Return tool
                </button>
              )}
              {loan.status === "return_pending" && (
                <span className="text-xs text-stone-500">
                  Waiting for the owner to confirm
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {mode === "history" && (
        <ShowMore
          shown={loans.length}
          total={matching.length}
          onMore={() => setLimit((n) => n + HISTORY_PAGE)}
        />
      )}
    </div>
  );
}

/** Loans on the caller's own tools, with approve / decline / confirm return. */
function Lending({ mode }: { mode: LoanMode }) {
  const all = useQuery(api.loans.incoming);
  const respond = useMutation(api.loans.respond);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const confirmReturned = useMutation(api.loans.confirmReturned);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<Id<"loans"> | null>(null);

  async function run(id: Id<"loans">, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (all === undefined) return <Loading />;
  const matching = all.filter((l) => inMode(l, mode));
  const loans = mode === "history" ? matching.slice(0, limit) : matching;
  if (loans.length === 0) {
    return (
      <Empty>
        {mode === "current"
          ? "None of your tools are requested or lent out right now."
          : "No past lends yet."}
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      <ul className="space-y-3">
        {loans.map((loan) => (
          <li
            key={loan._id}
            className={`${cardCls} flex flex-wrap items-center justify-between gap-4`}
          >
            <div>
              <p className="font-medium text-stone-800">{loan.toolName}</p>
              <p className="text-sm text-stone-500">
                {loan.borrowerName} ·{" "}
                {formatRange(loan.startDate, loan.endDate)}
              </p>
              <LoanNotes loan={loan} />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <StatusBadge status={loan.status} overdue={isOverdue(loan)} />
              {loan.status === "requested" && (
                <>
                  <button
                    type="button"
                    className={`${btnPrimary} max-sm:flex-1`}
                    disabled={busyId === loan._id}
                    onClick={() =>
                      run(loan._id, () =>
                        respond({ loanId: loan._id, decision: "approved" }),
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={`${btnDanger} max-sm:flex-1`}
                    disabled={busyId === loan._id}
                    onClick={() =>
                      run(loan._id, () =>
                        respond({ loanId: loan._id, decision: "declined" }),
                      )
                    }
                  >
                    Decline
                  </button>
                </>
              )}
              {loan.status === "approved" && (
                <span className="text-xs text-stone-500">
                  With {loan.borrowerName}
                </span>
              )}
              {loan.status === "return_pending" && (
                <>
                  <span className="text-xs font-medium text-violet-700">
                    {loan.borrowerName} says it&apos;s returned
                  </span>
                  <button
                    type="button"
                    className={`${btnPrimary} max-sm:flex-1`}
                    disabled={busyId === loan._id}
                    onClick={() =>
                      run(loan._id, () => confirmReturned({ loanId: loan._id }))
                    }
                  >
                    Confirm return
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {mode === "history" && (
        <ShowMore
          shown={loans.length}
          total={matching.length}
          onMore={() => setLimit((n) => n + HISTORY_PAGE)}
        />
      )}
    </div>
  );
}
