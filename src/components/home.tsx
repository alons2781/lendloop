"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { Dashboard } from "./dashboard";
import { PublicView } from "./public-view";
import { Loading } from "./ui";

function TokenRejected() {
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

/** Picks the signed-in dashboard or the public landing based on auth state. */
export function Home() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoading || !isLoaded) return <Loading />;
  if (isAuthenticated) return <Dashboard />;
  if (isSignedIn) return <TokenRejected />;
  return <PublicView />;
}
