"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { btnPrimary, btnSecondary, cardCls } from "@/lib/ui";
import { Empty } from "./ui";

/** Signed-out landing: tagline plus a read-only list (name and category only). */
export function PublicView() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 sm:text-5xl">
          Borrow tools from your neighbors.
          <br />
          <span className="text-emerald-600">Lend yours in return.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base sm:mt-5 sm:text-lg text-stone-600">
          Why buy a drill you&apos;ll use once? LendLoop connects neighbors to
          share the tools sitting in their garages.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mb-10 text-center">
          <p className="text-sm text-stone-500">
            Sign in to request a tool or list your own.
          </p>
          <div className="mx-auto mt-4 flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <SignUpButton mode="modal">
              <button type="button" className={`${btnPrimary} !px-6 !py-3`}>
                Create an account
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button type="button" className={`${btnSecondary} !px-6 !py-3`}>
                I already have an account
              </button>
            </SignInButton>
          </div>
        </div>

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-stone-800">
            Currently available
          </h2>
          {tools && (
            <span className="text-sm text-stone-500">
              {tools.length} {tools.length === 1 ? "tool" : "tools"}
            </span>
          )}
        </div>

        {tools === undefined ? (
          <p className="py-10 text-center text-sm text-stone-500">Loading…</p>
        ) : tools.length === 0 ? (
          <Empty>No tools listed yet. Sign in to add the first one!</Empty>
        ) : (
          <ul className="flex flex-wrap justify-center gap-4">
            {tools.map((tool) => (
              <li
                key={tool._id}
                className={`${cardCls} w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]`}
              >
                <p className="font-medium text-stone-800">{tool.name}</p>
                <span className="mt-3 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {tool.category}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
