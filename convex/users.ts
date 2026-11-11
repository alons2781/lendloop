import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireUser } from "./lib/auth";

/** Called once after sign-in: creates or refreshes the caller's profile row. */
export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", caller.id))
      .unique();
    if (existing) {
      if (
        existing.username !== caller.username ||
        existing.email !== caller.email ||
        existing.role !== caller.role
      ) {
        await ctx.db.patch(existing._id, {
          username: caller.username,
          email: caller.email,
          role: caller.role,
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      clerkId: caller.id,
      username: caller.username,
      email: caller.email,
      role: caller.role,
      trustedLender: false,
    });
  },
});

/** The caller's own profile and role. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx);
    const row = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", caller.id))
      .unique();
    return {
      id: caller.id,
      role: caller.role,
      username: caller.username,
      // Admins don't lend, so they never carry the Trusted Lender mark.
      trustedLender:
        caller.role === "admin" ? false : (row?.trustedLender ?? false),
    };
  },
});

/** Admin only: all users, so lenders can be marked as trusted. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("users").collect();
    // Admins aren't lenders, so they're not listed for the trusted mark.
    return rows
      .filter((u) => u.role !== "admin")
      .map((u) => ({
        _id: u._id,
        username: u.username,
        trustedLender: u.trustedLender,
      }));
  },
});

/** Admin only: mark or unmark a lender as "Trusted Lender". */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(userId);
    if (!row) {
      throw new ConvexError("User not found");
    }
    if (row.role === "admin") {
      throw new ConvexError("Admins can't be marked as trusted lenders");
    }
    await ctx.db.patch(row._id, { trustedLender: trusted });
  },
});

/**
 * Dev/maintenance only (not callable from the app): drop a profile row whose
 * Clerk account was deleted. Convex isn't notified when Clerk deletes a user.
 *   bunx convex run users:removeByClerkId '{"clerkId":"user_..."}'
 */
export const removeByClerkId = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const row = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!row) return { removed: false };
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});

/**
 * Called by the Clerk user.deleted webhook. Removes what only made sense with
 * the account: the profile row, their listings (pending requests on them are
 * declined) and their own pending requests (cancelled). Loan records are kept
 * for history, and a tool that is out on loan is left alone.
 */
export const deleteAccount = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", clerkId))
      .collect();
    for (const tool of tools) {
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
        .collect();
      if (
        loans.some(
          (l) => l.status === "approved" || l.status === "return_pending",
        )
      ) {
        continue;
      }
      for (const loan of loans) {
        if (loan.status === "requested") {
          await ctx.db.patch(loan._id, { status: "declined" });
          await ctx.scheduler.runAfter(0, internal.notify.sendLoanEvent, {
            loanId: loan._id,
            event: "loan.declined",
          });
        }
      }
      await ctx.db.delete(tool._id);
    }

    const requests = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", clerkId))
      .collect();
    for (const loan of requests) {
      if (loan.status === "requested") {
        await ctx.db.patch(loan._id, { status: "cancelled" });
        await ctx.scheduler.runAfter(0, internal.notify.sendLoanEvent, {
          loanId: loan._id,
          event: "loan.cancelled",
        });
      }
    }

    const row = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { removed: row !== null };
  },
});
