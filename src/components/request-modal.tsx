"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { btnPrimary, btnSecondary, inputCls, todayISO } from "@/lib/ui";
import { ErrorNote, Field, Modal } from "./ui";

export function RequestModal({
  tool,
  onClose,
}: {
  tool: { _id: Id<"tools">; name: string };
  onClose: () => void;
}) {
  const request = useMutation(api.loans.request);
  const [today] = useState(todayISO);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId: tool._id, startDate: start, endDate: end });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Borrow: ${tool.name}`} onClose={onClose}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            Request sent. You&apos;ll see its status under <b>Current lends &amp; borrows</b>.
          </p>
          <div className="flex justify-end">
            <button type="button" className={btnPrimary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input
                type="date"
                className={inputCls}
                value={start}
                min={today}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
                required
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={inputCls}
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </Field>
          </div>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
