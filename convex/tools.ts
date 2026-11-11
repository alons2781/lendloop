import { v, ConvexError } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { conditionValidator } from "./lib/condition";
import { isCategory } from "./lib/categories";
import { cleanLine, cleanMultiline } from "./lib/text";

const MAX_NAME = 80;
const MAX_CATEGORY = 40;
const MAX_DESCRIPTION = 200;
const MAX_LISTINGS_PER_USER = 50;

/** Fields shared by create and update, cleaned. `current` is the stored category on update. */
function cleanToolFields(
  args: { name: string; category: string; description?: string },
  currentCategory?: string,
) {
  const category = cleanLine(args.category, MAX_CATEGORY, "Category");
  // Listings made before the allow-list existed may carry a custom category;
  // let those keep it, but never accept a new one.
  if (!isCategory(category) && category !== currentCategory) {
    throw new ConvexError("Pick a category from the list");
  }
  return {
    name: cleanLine(args.name, MAX_NAME, "Name"),
    category,
    description: args.description?.trim()
      ? cleanMultiline(args.description, MAX_DESCRIPTION, "Description")
      : undefined,
  };
}

// A pending request does not lock a tool: several people can ask for it, and it
// only becomes unavailable once the owner approves one of them.
type Availability =
  | "available"
  | "requested_by_me"
  | "with_me"
  | "returning_by_me"
  | "on_loan";

/** True while the tool is out with a borrower (approved, or return unconfirmed). */
async function isBorrowed(ctx: QueryCtx, toolId: Id<"tools">) {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return loans.some(
    (l) => l.status === "approved" || l.status === "return_pending",
  );
}

/** True while someone's request is waiting for the owner's answer. */
async function hasPendingRequest(ctx: QueryCtx, toolId: Id<"tools">) {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return loans.some((l) => l.status === "requested");
}

/**
 * PUBLIC (no sign-in). Data minimization: returns only name and category,
 * never owner identity or description.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").take(100);
    // "Currently available": hide anything out on loan (pending requests don't count).
    const available = [];
    for (const t of tools) {
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", t._id))
        .collect();
      const inUse = loans.some(
        (l) => l.status === "approved" || l.status === "return_pending",
      );
      if (!inUse) {
        available.push({ _id: t._id, name: t.name, category: t.category });
      }
    }
    return available;
  },
});

/** Signed-in users: all tools, optionally filtered by category. */
export const listAll = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const caller = await requireUser(ctx);
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", category))
          .take(200)
      : await ctx.db.query("tools").order("desc").take(200);

    // Attach the lender's "Trusted" badge.
    const trusted = new Map<string, boolean>();
    for (const t of tools) {
      if (!trusted.has(t.ownerId)) {
        const owner = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", t.ownerId))
          .unique();
        trusted.set(
          t.ownerId,
          owner?.role !== "admin" && (owner?.trustedLender ?? false),
        );
      }
    }

    // Availability, without revealing who else is involved:
    // "available" | "requested_by_me" | "with_me" | "returning_by_me" | "on_loan"
    const result = [];
    for (const t of tools) {
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", t._id))
        .collect();
      const borrowed = loans.some(
        (l) => l.status === "approved" || l.status === "return_pending",
      );
      const out = loans.find(
        (l) => l.status === "approved" || l.status === "return_pending",
      );
      const myRequest = loans.some(
        (l) => l.status === "requested" && l.borrowerId === caller.id,
      );
      const availability: Availability = out
        ? out.borrowerId === caller.id
          ? out.status === "approved"
            ? "with_me"
            : "returning_by_me"
          : "on_loan"
        : myRequest
          ? "requested_by_me"
          : "available";
      result.push({
        _id: t._id,
        name: t.name,
        category: t.category,
        condition: t.condition,
        description: t.description,
        mine: t.ownerId === caller.id,
        ownerName: t.ownerName,
        trustedLender: trusted.get(t.ownerId) ?? false,
        availability,
        borrowed,
      });
    }
    return result;
  },
});

/** "My listings": only the caller's own tools. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", caller.id))
      .order("desc")
      .collect();
    return await Promise.all(
      tools.map(async (t) => ({
        _id: t._id,
        _creationTime: t._creationTime,
        name: t.name,
        category: t.category,
        condition: t.condition,
        description: t.description,
        borrowed: await isBorrowed(ctx, t._id),
        requested: await hasPendingRequest(ctx, t._id),
      })),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    condition: conditionValidator,
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx);
    if (caller.role === "admin") {
      throw new ConvexError("Admins can't list tools");
    }
    const fields = cleanToolFields(args);
    const mine = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", caller.id))
      .take(MAX_LISTINGS_PER_USER);
    if (mine.length >= MAX_LISTINGS_PER_USER) {
      throw new ConvexError(
        `You can have at most ${MAX_LISTINGS_PER_USER} listings. Remove one first`,
      );
    }
    return await ctx.db.insert("tools", {
      ownerId: caller.id,
      ownerName: caller.username,
      ...fields,
      condition: args.condition,
    });
  },
});

/** Only the owner can edit. Admins can remove listings but not rewrite them. */
export const update = mutation({
  args: {
    id: v.id("tools"),
    name: v.string(),
    category: v.string(),
    condition: conditionValidator,
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx);
    const tool = await ctx.db.get(args.id);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId !== caller.id) {
      throw new ConvexError("You can only edit your own listings");
    }
    if (await isBorrowed(ctx, args.id)) {
      throw new ConvexError(
        "This tool is currently borrowed, so it can't be edited",
      );
    }
    // A borrower's pending request refers to this listing as it is now;
    // changing it underneath them would make their request misleading.
    if (await hasPendingRequest(ctx, args.id)) {
      throw new ConvexError(
        "This tool has a pending request. Approve or decline it before editing",
      );
    }
    await ctx.db.patch(args.id, {
      ...cleanToolFields(args, tool.category),
      condition: args.condition,
    });
  },
});

/** Owner can delete their own tool; an admin can remove any listing. */
export const remove = mutation({
  args: { id: v.id("tools") },
  handler: async (ctx, { id }) => {
    const caller = await requireUser(ctx);
    const tool = await ctx.db.get(id);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId !== caller.id && caller.role !== "admin") {
      throw new ConvexError("You can only delete your own listings");
    }

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", id))
      .collect();

    // A tool that is currently out on loan can't disappear underneath the borrower.
    if (
      loans.some(
        (l) => l.status === "approved" || l.status === "return_pending",
      )
    ) {
      throw new ConvexError(
        "This tool is currently borrowed, so it can't be deleted until the return is confirmed.",
      );
    }
    // Close any still-pending requests; keep loan records for history.
    for (const loan of loans) {
      if (loan.status === "requested") {
        await ctx.db.patch(loan._id, { status: "declined" });
        await ctx.scheduler.runAfter(0, internal.notify.sendLoanEvent, {
          loanId: loan._id,
          event: "loan.declined",
        });
      }
    }
    await ctx.db.delete(id);
  },
});
