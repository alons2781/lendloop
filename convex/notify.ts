import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { sign } from "./lib/sign";

export const loanEvent = v.union(
  v.literal("loan.requested"), // -> owner
  v.literal("loan.approved"), // -> borrower
  v.literal("loan.declined"), // -> borrower
  v.literal("loan.cancelled"), // -> owner
  v.literal("loan.return_pending"), // -> owner (borrower says it's back)
  v.literal("loan.returned"), // -> borrower (owner confirmed)
);

// Who hears about each event.
const RECIPIENT = {
  "loan.requested": "owner",
  "loan.approved": "borrower",
  "loan.declined": "borrower",
  "loan.cancelled": "owner",
  "loan.return_pending": "owner",
  "loan.returned": "borrower",
} as const;

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [30_000, 120_000, 600_000]; // before attempts 2, 3, 4

/**
 * Builds the webhook body. Data minimization: only what a notification needs
 * (tool name, dates, status, the recipient's name/email, the other party's
 * username). No Clerk ids, no descriptions, no other users' emails.
 */
export const buildPayload = internalQuery({
  args: { loanId: v.id("loans"), event: loanEvent },
  handler: async (ctx, { loanId, event }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;

    const role = RECIPIENT[event];
    const recipientClerkId = role === "owner" ? loan.ownerId : loan.borrowerId;
    const row = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", recipientClerkId))
      .unique();
    const owner =
      role === "owner"
        ? row
        : await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", loan.ownerId))
            .unique();

    return {
      // One delivery per loan + event, so receivers can dedupe retries.
      idempotencyKey: `${loan._id}:${event}`,
      event,
      occurredAt: new Date().toISOString(),
      loan: {
        id: loan._id,
        toolName: loan.toolName,
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
      },
      recipient: {
        role,
        username:
          row?.username ?? (role === "owner" ? "owner" : loan.borrowerName),
        email: row?.email ?? null,
      },
      counterparty: {
        username:
          role === "owner" ? loan.borrowerName : (owner?.username ?? "owner"),
      },
    };
  },
});

/**
 * Sends one signed webhook to n8n. Retries with backoff; after the last
 * attempt it logs an error (visible in the Convex dashboard) instead of
 * failing silently. Missing config only warns, so the app works without n8n.
 */
export const sendLoanEvent = internalAction({
  args: {
    loanId: v.id("loans"),
    event: loanEvent,
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, { loanId, event, attempt = 1 }) => {
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret) {
      console.warn(
        `[notify] ${event} for loan ${loanId} not sent: N8N_WEBHOOK_URL / N8N_WEBHOOK_SECRET not set`,
      );
      return;
    }

    const payload = await ctx.runQuery(internal.notify.buildPayload, {
      loanId,
      event,
    });
    if (!payload) return; // loan no longer exists

    // Second layer next to the signature: a shared token header that n8n checks first.
    const token = process.env.N8N_WEBHOOK_TOKEN;
    if (!token) {
      console.warn(
        `[notify] ${event} for loan ${loanId} not sent: N8N_WEBHOOK_TOKEN not set`,
      );
      return;
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await sign(secret, timestamp, body);

    let failure: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LendLoop-Token": token,
          "X-LendLoop-Timestamp": timestamp,
          "X-LendLoop-Signature": signature,
          "X-LendLoop-Event": event,
          "X-LendLoop-Delivery": payload.idempotencyKey,
        },
        body,
      });
      if (!res.ok) failure = `HTTP ${res.status}`;
    } catch (err) {
      failure = err instanceof Error ? err.message : "network error";
    }
    if (failure === null) return;

    if (attempt >= MAX_ATTEMPTS) {
      console.error(
        `[notify] GAVE UP on ${event} for loan ${loanId} after ${attempt} attempts: ${failure}`,
      );
      return;
    }
    console.warn(
      `[notify] ${event} for loan ${loanId} failed (attempt ${attempt}): ${failure}; retrying`,
    );
    await ctx.scheduler.runAfter(
      BACKOFF_MS[attempt - 1],
      internal.notify.sendLoanEvent,
      { loanId, event, attempt: attempt + 1 },
    );
  },
});
