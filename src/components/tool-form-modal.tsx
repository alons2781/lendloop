"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { errorMessage } from "@/lib/errors";
import {
  CATEGORIES,
  CONDITIONS,
  type Condition,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "@/lib/ui";
import { ErrorNote, Field, Modal, Select } from "./ui";

export type ToolFormTool = FunctionReturnType<typeof api.tools.listMine>[number];

export function ToolFormModal({
  tool,
  onClose,
}: {
  tool?: ToolFormTool;
  onClose: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [name, setName] = useState(tool?.name ?? "");
  const [category, setCategory] = useState(tool?.category ?? CATEGORIES[0]);
  // "" = not chosen yet (new tools, or older tools listed before this field)
  const [condition, setCondition] = useState<Condition | "">(
    tool?.condition ?? "",
  );
  const [description, setDescription] = useState(tool?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (condition === "") {
      setError("Please choose the tool's condition");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (tool) {
        await update({ id: tool._id, name, category, condition, description });
      } else {
        await create({ name, category, condition, description });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={tool ? "Edit tool" : "List a tool"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        <p className="-mt-2 text-sm text-stone-500">
          {tool
            ? "Update how your tool appears to neighbors."
            : "Tell your neighbors what you can lend."}
        </p>

        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cordless drill"
            maxLength={80}
            required
          />
        </Field>

        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {/* Keep an old custom category selectable when editing */}
            {!CATEGORIES.some((c) => c === category) && (
              <option value={category}>{category}</option>
            )}
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Condition">
          <Select
            value={condition}
            onChange={(e) => setCondition(e.target.value as Condition | "")}
            required
          >
            <option value="" disabled>
              Select condition…
            </option>
            {CONDITIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
          <span className="mt-1 block text-xs text-stone-500">
            {CONDITIONS.find((c) => c.key === condition)?.help ??
              "Be honest, so borrowers know what to expect."}
          </span>
        </Field>

        <Field label="Description (optional)">
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Accessories, pickup notes, any quirks or limits…"
            maxLength={200}
          />
          <span className="mt-1 block text-right text-xs text-stone-400">
            {description.length}/200
          </span>
        </Field>

        <ErrorNote message={error} />

        <div className="grid grid-cols-2 gap-3 pt-1 sm:flex sm:justify-end">
          <button
            type="button"
            className={`${btnSecondary} !py-2.5`}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`${btnPrimary} sm:min-w-24`}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
