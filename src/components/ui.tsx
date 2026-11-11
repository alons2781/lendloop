"use client";

import { ReactNode, SelectHTMLAttributes, useEffect, useId } from "react";
import {
  CONDITIONS,
  Condition,
  LoanStatus,
  conditionStyle,
  statusLabel,
  statusStyle,
} from "@/lib/ui";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-md p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Styled native select: no browser arrow, our own chevron, same look as the
 * text inputs. `compact` is the smaller variant used for inline filters.
 * (The opened option list is drawn by the OS/browser and can't be styled.)
 */
export function Select({
  compact,
  className = "",
  children,
  ...props
}: { compact?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${compact ? "w-auto" : "w-full"}`}>
      <select
        {...props}
        className={`w-full cursor-pointer appearance-none truncate rounded-lg border border-stone-300 bg-white text-stone-800 shadow-sm transition hover:border-stone-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 ${
          compact
            ? "py-1.5 pl-3 pr-8 text-sm sm:py-2"
            : "py-2 pl-3 pr-9 text-base sm:text-sm"
        } ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 7.5 5 5 5-5" />
      </svg>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}

export function StatusBadge({
  status,
  overdue,
}: {
  status: LoanStatus;
  overdue?: boolean;
}) {
  if (overdue) {
    return (
      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        Overdue
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

/** Small pill for a tool's condition; renders nothing for legacy tools. */
export function ConditionBadge({ condition }: { condition?: Condition }) {
  const c = CONDITIONS.find((x) => x.key === condition);
  if (!c) return null;
  return (
    <span
      title={c.help}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${conditionStyle[c.key]}`}
    >
      {c.label}
    </span>
  );
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-stone-500">Loading…</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center text-sm text-stone-500">
      {children}
    </div>
  );
}

/**
 * Shows `text` in a bubble above its children on hover/focus. Wraps in a
 * focusable span so it also works for disabled buttons (which swallow
 * pointer and focus events).
 */
export function Tooltip({
  text,
  hidden,
  children,
}: {
  text: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  if (hidden) return <>{children}</>;
  return (
    <span
      className="group relative inline-flex"
      tabIndex={0}
      aria-describedby={id}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-max max-w-[15rem] rounded-md sm:left-1/2 sm:-translate-x-1/2 bg-stone-800 px-2.5 py-1.5 text-left text-xs sm:text-center text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
      >
        {text}
        <span className="absolute left-6 top-full border-4 sm:left-1/2 sm:-translate-x-1/2 border-transparent border-t-stone-800" />
      </span>
    </span>
  );
}
