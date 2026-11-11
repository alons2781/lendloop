import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireUser } from "./lib/auth";

// Caps how many requests one borrower can create per hour. Every request,
// cancel and decline emails the other party, so this also bounds email spam.
const MAX_REQUESTS_PER_HOUR = 10;
const HOUR_MS = 3_600_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, label: string) {
  // Date.parse accepts some impossible dates (e.g. 2026-02-31 rolls over), so
  // check that the parsed date prints back as the exact same string.
  const parsed = DATE_RE.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (
    !parsed ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ConvexError(`${label} must be a valid date (YYYY-MM-DD)`);
  }
}

/** Queue a signed n8n webhook; runs after this mutation commits. */
async function notify(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  event:
    | "loan.requested"
    | "loan.approved"
    | "loan.declined"
    | "loan.cancelled"
    | "loan.return_pending"
    | "loan.returned",
) {
  await ctx.scheduler.runAfter(0, internal.notify.sendLoanEvent, {
    loanId,
    event,
  });
}

/** Borrower asks to borrow someone else's tool for a date range. */
export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const caller = await requireUser(ctx);
    assertDate(startDate, "Start date");
    assertDate(endDate, "End date");
    if (endDate < startDate) {
      throw new ConvexError("End date can't be before the start date");
    }
    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today) {
      throw new ConvexError("Start date can't be in the past");
    }

    const recent = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) =>
        q.eq("borrowerId", caller.id).gt("_creationTime", Date.now() - HOUR_MS),
      )
      .collect();
    if (recent.length >= MAX_REQUESTS_PER_HOUR) {
      throw new ConvexError(
        "You've sent a lot of requests in the last hour. Please try again later",
      );
    }

    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    if (caller.role === "admin") {
      throw new ConvexError("Admins can't borrow tools");
    }
    if (tool.ownerId === caller.id) {
      throw new ConvexError("You can't borrow your own tool");
    }

    // A tool can have only one active loan at a time: either someone's request
    // is waiting for approval, or it is out with a borrower (until returned).
    const existing = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    const active = existing.find(
      (l) =>
        l.status === "requested" ||
        l.status === "approved" ||
        l.status === "return_pending",
    );
    if (active) {
      const out = active.status !== "requested"; // approved or return_pending
      if (active.borrowerId === caller.id) {
        throw new ConvexError(
          active.status === "return_pending"
            ? "You returned this tool. Waiting for the owner to confirm"
            : out
              ? "You already have this tool"
              : "You already requested this tool",
        );
      }
      throw new ConvexError(
        out
          ? "This tool is currently with another user"
          : "This tool already has a pending request",
      );
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      toolName: tool.name,
      ownerId: tool.ownerId,
      borrowerId: caller.id,
      borrowerName: caller.username,
      startDate,
      endDate,
      status: "requested",
    });
    await notify(ctx, loanId, "loan.requested");
    return loanId;
  },
});

async function getOwnedLoan(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  callerId: string,
) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("Loan not found");
  if (loan.ownerId !== callerId) {
    throw new ConvexError("Only the tool's owner can do that");
  }
  return loan;
}

/** Owner approves or declines a pending request on their tool. */
export const respond = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, { loanId, decision }) => {
    const caller = await requireUser(ctx);
    const loan = await getOwnedLoan(ctx, loanId, caller.id);
    if (loan.status !== "requested") {
      throw new ConvexError("Only pending requests can be answered");
    }
    // No overlap check needed: a tool has at most one active loan (see
    // `request`), so no other approved loan can exist for this tool.
    await ctx.db.patch(loanId, { status: decision });
    await notify(
      ctx,
      loanId,
      decision === "approved" ? "loan.approved" : "loan.declined",
    );
  },
});

/** Borrower withdraws their own request while it is still pending. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const caller = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Loan not found");
    if (loan.borrowerId !== caller.id) {
      throw new ConvexError("You can only cancel your own requests");
    }
    if (loan.status !== "requested") {
      throw new ConvexError("Only pending requests can be cancelled");
    }
    await ctx.db.patch(loanId, { status: "cancelled" });
    await notify(ctx, loanId, "loan.cancelled");
  },
});

/**
 * Step 1 of a return: the borrower says they're done (early or on time).
 * This flags the owner but does NOT free the tool yet.
 */
export const reportReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const caller = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Loan not found");
    if (loan.borrowerId !== caller.id) {
      throw new ConvexError("Only the borrower can mark a tool as returned");
    }
    if (loan.status !== "approved") {
      throw new ConvexError("Only tools you currently have can be returned");
    }
    await ctx.db.patch(loanId, { status: "return_pending" });
    await notify(ctx, loanId, "loan.return_pending");
  },
});

/**
 * Step 2: the owner confirms they have the tool back. The listing is then
 * removed; the owner has to list it again to lend it out again. The loan
 * keeps its toolName snapshot, so history still reads fine.
 */
export const confirmReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const caller = await requireUser(ctx);
    const loan = await getOwnedLoan(ctx, loanId, caller.id);
    if (loan.status !== "return_pending") {
      throw new ConvexError("The borrower hasn't marked this tool as returned");
    }
    await ctx.db.patch(loanId, { status: "returned" });
    await notify(ctx, loanId, "loan.returned");
    const tool = await ctx.db.get(loan.toolId);
    if (tool) await ctx.db.delete(tool._id);
  },
});

/**
 * What the client gets for a loan. Explicit fields on purpose: the stored
 * document also holds both parties' Clerk ids, which the UI never needs.
 */
function loanRow(loan: Doc<"loans">) {
  return {
    _id: loan._id,
    toolName: loan.toolName,
    borrowerName: loan.borrowerName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
  };
}

/** Adds `lastReminderAt` (ms) = when the latest overdue reminder was sent. */
async function withReminder(ctx: QueryCtx, loans: Doc<"loans">[]) {
  return await Promise.all(
    loans.map(async (loan) => {
      const reminders = await ctx.db
        .query("reminders")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .order("desc")
        .collect();
      const lastSent = reminders.find((r) => r.status === "sent");
      return { ...loanRow(loan), lastReminderAt: lastSent?.at ?? null };
    }),
  );
}

/** "My requests": loans the caller asked for as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", caller.id))
      .order("desc")
      .collect();
    return await withReminder(ctx, loans);
  },
});

/** "Incoming requests": loans on the caller's own tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", caller.id))
      .order("desc")
      .collect();
    return await withReminder(ctx, loans);
  },
});

/** Admin only: every loan in the system. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(500);
    return loans.map(loanRow);
  },
});
