"use client";

import { UserButton, useUser } from "@clerk/nextjs";

/** Avatar menu; the username shows next to it from the sm breakpoint up. */
export function HeaderUser() {
  const { user } = useUser();
  const name =
    user?.username ?? user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {name && (
        <span className="hidden max-w-xs truncate text-sm font-medium text-stone-700 sm:block">
          {name}
        </span>
      )}
      <UserButton />
    </div>
  );
}
