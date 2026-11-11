"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { CATEGORIES, btnDanger, btnPrimary, cardCls } from "@/lib/ui";
import { useMe } from "./app-shell";
import { RequestModal } from "./request-modal";
import {
  ConditionBadge,
  Empty,
  ErrorNote,
  Loading,
  Select,
  Tooltip,
} from "./ui";

const UNAVAILABLE_REASON = {
  available: "",
  requested_by_me:
    "You already requested this tool. Wait for the owner to answer.",
  with_me: "You currently have this tool.",
  returning_by_me:
    "You marked this as returned. Waiting for the owner to confirm.",
  on_loan: "This tool is currently with another user.",
} as const;

export function AllTools() {
  const me = useMe();
  const [category, setCategory] = useState("");
  const tools = useQuery(api.tools.listAll, {
    category: category || undefined,
  });
  const remove = useMutation(api.tools.remove);
  const [requesting, setRequesting] = useState<{
    _id: Id<"tools">;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRemove(id: Id<"tools">, name: string) {
    if (!window.confirm(`Remove "${name}" from LendLoop?`)) return;
    setError(null);
    try {
      await remove({ id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <label
          className="text-xs font-medium text-stone-500 sm:text-sm sm:text-stone-600"
          htmlFor="cat"
        >
          Category
        </label>
        <Select
          compact
          id="cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <ErrorNote message={error} />

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <Empty>No tools here yet. Be the first to list one!</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const mine = tool.mine;
            return (
              <li key={tool._id} className={`${cardCls} flex flex-col`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-stone-800">{tool.name}</p>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {tool.category}
                  </span>
                </div>
                <div className="mt-2">
                  <ConditionBadge condition={tool.condition} />
                </div>
                {tool.description && (
                  <p className="mt-2 text-sm text-stone-500">
                    {tool.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-stone-500">
                  {mine ? "Yours" : `Lent by ${tool.ownerName}`}
                  {tool.trustedLender && (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                      ★ Trusted Lender
                    </span>
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!mine && me.role !== "admin" && (
                    <Tooltip
                      text={
                        UNAVAILABLE_REASON[tool.availability] ||
                        "This tool is not available right now."
                      }
                      hidden={tool.availability === "available"}
                    >
                      <button
                        type="button"
                        className={`${btnPrimary} max-sm:flex-1`}
                        disabled={tool.availability !== "available"}
                        onClick={() =>
                          setRequesting({ _id: tool._id, name: tool.name })
                        }
                      >
                        Request to borrow
                      </button>
                    </Tooltip>
                  )}
                  {me.role === "admin" && !mine && (
                    <Tooltip
                      text="This tool is currently borrowed, so it can't be removed."
                      hidden={!tool.borrowed}
                    >
                      <button
                        type="button"
                        className={`${btnDanger} max-sm:flex-1`}
                        disabled={tool.borrowed}
                        onClick={() => onRemove(tool._id, tool.name)}
                      >
                        Remove
                      </button>
                    </Tooltip>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {requesting && (
        <RequestModal tool={requesting} onClose={() => setRequesting(null)} />
      )}
    </div>
  );
}
