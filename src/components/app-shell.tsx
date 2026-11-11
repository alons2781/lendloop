"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildTabs, useNeedsAction } from "./nav";
import { Loading } from "./ui";

export type Me = {
  id: string;
  role: "admin" | "user";
  username: string;
  trustedLender: boolean;
};

const MeContext = createContext<Me | null>(null);

/** The signed-in user. Only valid below <AppShell>, which renders the app routes. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside <AppShell>");
  return me;
}

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

export function TokenRejected() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-stone-800">
        You&apos;re signed in, but the backend didn&apos;t accept your session
      </h1>
      <p className="mt-3 text-sm text-stone-600">
        Convex rejected the Clerk token. Check the session token settings in
        Clerk, then sign out and back in.
      </p>
    </div>
  );
}

/**
 * Frame for every signed-in route: waits for auth, sends signed-out visitors
 * to the landing page, loads the caller's profile, and shows the greeting and
 * the section links. Access control itself lives in the Convex functions; this
 * only decides what to render.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const signedOut = !isLoading && isLoaded && !isAuthenticated && !isSignedIn;

  useEffect(() => {
    if (signedOut) router.replace("/");
  }, [signedOut, router]);

  if (isLoading || !isLoaded) return <Loading />;
  if (!isAuthenticated) return isSignedIn ? <TokenRejected /> : <Loading />;
  return <SignedInShell>{children}</SignedInShell>;
}

function SignedInShell({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const storeUser = useMutation(api.users.storeUser);
  const needsAction = useNeedsAction();
  const pathname = usePathname();
  const router = useRouter();

  // Make sure the caller has a profile row (used for the Trusted Lender flag).
  useEffect(() => {
    storeUser().catch(() => {});
  }, [storeUser]);

  const tabs = me ? buildTabs(me.role) : [];
  const current = tabs.find((t) => t.href === pathname);

  // e.g. an admin opening /listings, or a regular user opening /admin.
  const notAllowed = me !== undefined && !current;
  useEffect(() => {
    if (notAllowed) router.replace("/browse");
  }, [notAllowed, router]);

  if (me === undefined || !current) return <Loading />;

  return (
    <MeContext value={me}>
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

        {/* Desktop: section links. On mobile they live in the header menu. */}
        <nav
          className="mb-6 hidden gap-1 border-b border-stone-200 sm:flex"
          aria-label="Sections"
        >
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.href === pathname ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
                t.href === pathname
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {t.label}
              {t.href === "/loans" && <ActionBadge count={needsAction} />}
            </Link>
          ))}
        </nav>

        <h2 className="mb-4 text-lg font-semibold text-stone-800 sm:hidden">
          {current.label}
        </h2>

        {children}
      </div>
    </MeContext>
  );
}
