"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { HeaderUser } from "./header-user";
import { buildTabs, useNeedsAction } from "./nav";

function Logo() {
  return (
    <span className="text-lg font-semibold tracking-tight text-stone-800">
      Lend<span className="text-emerald-600">Loop</span>
    </span>
  );
}

/**
 * Mobile: [hamburger] [  LendLoop  ] [user]  (menu opens under the bar).
 * Desktop (sm+): logo left, user right; sections are tabs in the dashboard.
 */
export function AppHeader() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const needsAction = useNeedsAction(isAuthenticated);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tabs = me ? buildTabs(me.role) : [];
  const line = "h-0.5 w-5 rounded bg-stone-700 transition";

  return (
    <header
      ref={ref}
      className="relative z-40 border-b border-stone-200 bg-white/80 backdrop-blur"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto_1fr] items-center px-4 py-3 sm:flex sm:justify-between sm:px-6 sm:py-4">
        {/* Hamburger: mobile + signed in only */}
        <div className="flex justify-start sm:hidden">
          {me && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-sections"
              aria-label={open ? "Close menu" : "Open menu"}
              className="relative -ml-2 flex h-10 w-10 items-center justify-center rounded-lg active:bg-stone-100"
            >
              <span className="flex flex-col gap-1">
                <span className={`${line} ${open ? "translate-y-1.5 rotate-45" : ""}`} />
                <span className={`${line} ${open ? "opacity-0" : ""}`} />
                <span className={`${line} ${open ? "-translate-y-1.5 -rotate-45" : ""}`} />
              </span>
              {!open && needsAction > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
                  {needsAction}
                </span>
              )}
            </button>
          )}
        </div>

        <Link href="/" aria-label="LendLoop home">
          <Logo />
        </Link>

        <div className="flex justify-end">
          <Show when="signed-out">
            <div className="flex items-center gap-2">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className={`${btnSecondary} sm:!py-2`}
                >
                  Sign in
                </button>
              </SignInButton>
              {/* Header is tight on phones; sign-up lives in the hero there. */}
              <SignUpButton mode="modal">
                <button type="button" className={`${btnPrimary} hidden sm:inline-flex`}>
                  Sign up
                </button>
              </SignUpButton>
            </div>
          </Show>
          <Show when="signed-in">
            <HeaderUser />
          </Show>
        </div>
      </div>

      {open && me && (
        <ul
          id="mobile-sections"
          className="absolute inset-x-0 top-full z-30 border-b border-stone-200 bg-white py-1 shadow-lg sm:hidden"
        >
          {tabs.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={() => setOpen(false)}
                aria-current={pathname === t.href ? "page" : undefined}
                className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium ${
                  pathname === t.href
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-stone-700 active:bg-stone-50"
                }`}
              >
                <span>{t.label}</span>
                {t.href === "/loans" && needsAction > 0 && (
                  <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {needsAction}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
