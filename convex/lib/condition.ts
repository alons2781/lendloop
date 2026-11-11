import { v } from "convex/values";

// Stable keys stored in the database. Display labels live in src/lib/ui.ts.
export const conditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("well_used"),
);
