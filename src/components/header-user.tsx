"use client";

import { UserButton, useUser } from "@clerk/nextjs";

/** Avatar menu with the signed-in username next to it. */
export function HeaderUser() {
  const { user } = useUser();
  const name =
    user?.username ?? user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {name && (
        <span className="max-w-[9rem] truncate text-sm font-medium text-stone-700 sm:max-w-xs">
          {name}
        </span>
      )}
      <UserButton />
    </div>
  );
}
