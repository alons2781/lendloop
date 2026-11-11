import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { conditionValidator } from "./lib/condition";

export default defineSchema({
  // Profile data we keep per Clerk user. The role itself lives in Clerk
  // (public metadata -> session token); only app-owned flags are stored here.
  users: defineTable({
    clerkId: v.string(),
    username: v.string(),
    email: v.optional(v.string()), // from the Clerk token; used for notifications only
    // Copied from the Clerk token at sign-in so other users' roles are known.
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
    trustedLender: v.boolean(),
  }).index("by_clerkId", ["clerkId"]),

  tools: defineTable({
    ownerId: v.string(), // Clerk user id (identity.subject)
    ownerName: v.string(),
    name: v.string(),
    category: v.string(),
    // Optional only because tools listed before this field existed lack it.
    condition: v.optional(conditionValidator),
    description: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    toolName: v.string(), // snapshot, so history survives tool deletion
    ownerId: v.string(),
    borrowerId: v.string(),
    borrowerName: v.string(),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
    status: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("return_pending"), // borrower says it's back; owner must confirm
      v.literal("declined"),
      v.literal("returned"),
      v.literal("cancelled"),
    ),
  })
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_tool", ["toolId"])
    .index("by_status", ["status"]),

  // One row per overdue-reminder attempt written back by n8n. The
  // idempotencyKey (`<loanId>:<YYYY-MM-DD>`) makes retries safe: the same key
  // never creates a second record or a second reminder for that day.
  reminders: defineTable({
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"), // e.g. the borrower has no email on file
    ),
    daysOverdue: v.number(),
    error: v.optional(v.string()),
    at: v.number(), // ms since epoch
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),
});
