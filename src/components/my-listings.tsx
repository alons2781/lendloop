"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { btnDanger, btnPrimary, btnSecondary, cardCls } from "@/lib/ui";
import { ToolFormModal, type ToolFormTool } from "./tool-form-modal";
import { ConditionBadge, Empty, ErrorNote, Loading, Tooltip } from "./ui";

export function MyListings() {
  const tools = useQuery(api.tools.listMine);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<ToolFormTool | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRemove(id: Id<"tools">, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setError(null);
    try {
      await remove({ id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className={`${btnPrimary} max-sm:w-full`}
          onClick={() => setEditing("new")}
        >
          + List a tool
        </button>
      </div>

      <ErrorNote message={error} />

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <Empty>You haven&apos;t listed any tools yet.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool._id} className={cardCls}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-stone-800">{tool.name}</p>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {tool.category}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ConditionBadge condition={tool.condition} />
                {tool.borrowed && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                    Borrowed
                  </span>
                )}
              </div>
              {tool.description && (
                <p className="mt-2 text-sm text-stone-500">
                  {tool.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Tooltip
                  text={
                    tool.borrowed
                      ? "This tool is currently borrowed, so it can't be edited."
                      : "This tool has a pending request. Approve or decline it before editing."
                  }
                  hidden={!tool.borrowed && !tool.requested}
                >
                  <button
                    type="button"
                    className={`${btnSecondary} max-sm:flex-1`}
                    disabled={tool.borrowed || tool.requested}
                    onClick={() => setEditing(tool)}
                  >
                    Edit
                  </button>
                </Tooltip>
                <Tooltip
                  text="This tool is currently borrowed, so it can't be deleted."
                  hidden={!tool.borrowed}
                >
                  <button
                    type="button"
                    className={`${btnDanger} max-sm:flex-1`}
                    disabled={tool.borrowed}
                    onClick={() => onRemove(tool._id, tool.name)}
                  >
                    Delete
                  </button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ToolFormModal
          tool={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
