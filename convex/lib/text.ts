import { ConvexError } from "convex/values";

// C0/C1 control characters plus the Unicode line/paragraph separators.
// Built from strings so the separators stay escaped in the source file.
const CONTROL = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029]",
  "g",
);
// Same, but keeps "\n" so multi-line descriptions still work.
const CONTROL_KEEP_NEWLINE = new RegExp(
  "[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u2028\\u2029]",
  "g",
);

/**
 * Single-line text (names, categories). Control characters become spaces, so
 * they can't inject line breaks into email subjects or headers.
 */
export function cleanLine(value: string, max: number, label: string): string {
  const text = value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return checked(text, max, label);
}

/** Multi-line text (descriptions). Keeps newlines, drops other control characters. */
export function cleanMultiline(
  value: string,
  max: number,
  label: string,
): string {
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_KEEP_NEWLINE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return checked(text, max, label);
}

function checked(text: string, max: number, label: string): string {
  if (text.length === 0) throw new ConvexError(`${label} is required`);
  if (text.length > max) {
    throw new ConvexError(`${label} must be at most ${max} characters`);
  }
  return text;
}
