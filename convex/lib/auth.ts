import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type Role = "admin" | "user";

export type Caller = {
  id: string; // Clerk user id
  role: Role;
  username: string;
  email?: string;
};

type Ctx = QueryCtx | MutationCtx;

/**
 * Returns the signed-in caller or throws. Role comes from the Clerk session
 * token claim `role` (set from public metadata). Only the exact string
 * "admin" grants admin rights; anything else, including a missing claim,
 * is a regular user.
 */
export async function requireUser(ctx: Ctx): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Not authenticated");
  }
  const role: Role = identity.role === "admin" ? "admin" : "user";
  const username =
    typeof identity.username === "string" && identity.username.length > 0
      ? identity.username
      : "neighbor";
  const email =
    typeof identity.email === "string" && identity.email.length > 0
      ? identity.email
      : undefined;
  return { id: identity.subject, role, username, email };
}

export async function requireAdmin(ctx: Ctx): Promise<Caller> {
  const caller = await requireUser(ctx);
  if (caller.role !== "admin") {
    throw new ConvexError("Admin access required");
  }
  return caller;
}
