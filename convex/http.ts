import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verifyRequest } from "./lib/sign";
import { verifySvix } from "./lib/svix";

const http = httpRouter();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// n8n -> Convex. Every route requires the shared token AND a valid HMAC
// signature (see lib/sign.ts). The API secret/token are separate from the
// ones used for Convex -> n8n, so a leak in one direction doesn't open the other.
const verify = (req: Request) =>
  verifyRequest(req, process.env.N8N_API_SECRET, process.env.N8N_API_TOKEN);

/** Overdue loans that still need a reminder today. */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const v = await verify(req);
    if (!v.ok) return json({ error: v.reason }, v.status);
    const today = new Date().toISOString().slice(0, 10);
    const loans = await ctx.runQuery(internal.reminders.overdueLoans, {
      today,
    });
    return json({ today, loans });
  }),
});

/** Write-back: what happened to one reminder. Idempotent per key. */
http.route({
  path: "/n8n/reminders",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const v = await verify(req);
    if (!v.ok) return json({ error: v.reason }, v.status);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(v.body);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { idempotencyKey, loanId, status, daysOverdue, error } = body;
    if (
      typeof idempotencyKey !== "string" ||
      typeof loanId !== "string" ||
      (status !== "sent" && status !== "failed" && status !== "skipped") ||
      typeof daysOverdue !== "number" ||
      (error !== undefined && typeof error !== "string")
    ) {
      return json({ error: "invalid fields" }, 400);
    }
    try {
      const result = await ctx.runMutation(internal.reminders.recordReminder, {
        idempotencyKey,
        loanId,
        status,
        daysOverdue,
        error,
      });
      return json({ ok: true, ...result });
    } catch {
      return json({ error: "rejected" }, 400);
    }
  }),
});

/**
 * Clerk -> Convex. When a Clerk account is deleted, remove its data here.
 * Authenticated by the Svix signature (CLERK_WEBHOOK_SECRET); the Clerk
 * dashboard webhook must subscribe to the user.deleted event.
 */
http.route({
  path: "/clerk/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const v = await verifySvix(req, process.env.CLERK_WEBHOOK_SECRET);
    if (!v.ok) return json({ error: "unauthorized" }, v.status);
    let event: { type?: unknown; data?: { id?: unknown } };
    try {
      event = JSON.parse(v.body);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (event.type === "user.deleted" && typeof event.data?.id === "string") {
      await ctx.runMutation(internal.users.deleteAccount, {
        clerkId: event.data.id,
      });
    }
    // Other event types are acknowledged and ignored.
    return json({ ok: true });
  }),
});

export default http;
