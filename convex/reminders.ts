import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const DAY_MS = 86_400_000;

function daysBetween(fromISO: string, toISO: string) {
  return Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) /
      DAY_MS,
  );
}

/**
 * Loans that are overdue today and still need a reminder. A loan is overdue
 * when it's approved (the borrower has it) and its end date has passed.
 * Data minimization: only what the reminder email needs.
 */
export const overdueLoans = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    const out = [];
    for (const loan of approved) {
      if (loan.endDate >= today) continue;
      const reminderKey = `${loan._id}:${today}`;
      const done = await ctx.db
        .query("reminders")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", reminderKey))
        .unique();
      // Already handled today (sent, or skipped because there's no email).
      if (done && done.status !== "failed") continue;

      const borrower = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", loan.borrowerId))
        .unique();
      out.push({
        loanId: loan._id,
        reminderKey,
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        ownerUsername:
          (
            await ctx.db
              .query("users")
              .withIndex("by_clerkId", (q) => q.eq("clerkId", loan.ownerId))
              .unique()
          )?.username ?? "the owner",
        borrower: {
          username: borrower?.username ?? loan.borrowerName,
          email: borrower?.email ?? null,
        },
      });
    }
    return out;
  },
});

/**
 * n8n reports what happened to a reminder. Idempotent: the same key never
 * creates a second row. A "failed" row can be upgraded to "sent" on a retry,
 * but a "sent" row is never downgraded.
 */
export const recordReminder = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    daysOverdue: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId) throw new ConvexError("Unknown loan");
    if (!args.idempotencyKey.startsWith(`${loanId}:`)) {
      throw new ConvexError("Idempotency key does not match the loan");
    }
    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    const fields = {
      status: args.status,
      daysOverdue: args.daysOverdue,
      error: args.error?.slice(0, 300),
      at: Date.now(),
    };
    if (existing) {
      if (existing.status === "sent" || args.status === existing.status) {
        return { duplicate: true };
      }
      await ctx.db.patch(existing._id, fields);
      return { duplicate: false, updated: true };
    }
    await ctx.db.insert("reminders", {
      loanId,
      idempotencyKey: args.idempotencyKey,
      ...fields,
    });
    return { duplicate: false };
  },
});
