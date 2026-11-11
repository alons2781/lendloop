import { ConvexError } from "convex/values";

/** Turns a thrown Convex error into a message that is safe to show users. */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string" ? err.data : "Request failed.";
  }
  return "Something went wrong. Please try again.";
}
