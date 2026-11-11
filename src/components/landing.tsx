"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { TokenRejected } from "./app-shell";
import { PublicView } from "./public-view";
import { Loading } from "./ui";

/** Public landing for signed-out visitors; signed-in users go straight to /browse. */
export function Landing() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace("/browse");
  }, [isAuthenticated, router]);

  if (isLoading || !isLoaded || isAuthenticated) return <Loading />;
  if (isSignedIn) return <TokenRejected />;
  return <PublicView />;
}
