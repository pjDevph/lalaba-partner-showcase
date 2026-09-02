// src/utils/userError.ts
// Maps raw errors to user-safe copy (RISK-H-032).
//
// Backend/GraphQL/Mongo errors leak implementation detail ("E11000 duplicate
// key", "Cannot query field…", "$input", stack traces). Display sites must
// never render err.message directly — run it through toUserMessage() with a
// screen-appropriate fallback. Messages that look technical are replaced by
// the fallback; short human-written messages (e.g. structured 400 copy the BE
// crafts for users) pass through.

/** Patterns that mark a message as technical/internal — never show these. */
const TECHNICAL_RE =
  /Mongo|GraphQL|\$|Exception|E11000|ObjectId|Cast to|ECONNREFUSED|ETIMEDOUT|jwt|token|firebase|auth\/|INTERNAL_SERVER_ERROR|Unexpected token|is not a function|undefined is not|null is not|Network request failed|stack|Variable "|Cannot query|Cannot return null|duplicate key/i;

/** Hard cap — real user-facing copy is short; dumps and traces are not. */
const MAX_LEN = 200;

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Extract a message string from an unknown thrown value.
 * Returns null when there is nothing usable.
 */
function rawMessage(err: unknown): string | null {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || null;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return null;
}

/**
 * Map an error to user-safe copy.
 *
 * @param err      the caught error (unknown)
 * @param fallback friendly copy for this screen/action (defaults to GENERIC_ERROR)
 * @returns the error's own message only when it is short and non-technical;
 *          otherwise the fallback.
 */
export function toUserMessage(err: unknown, fallback: string = GENERIC_ERROR): string {
  const msg = rawMessage(err)?.trim();
  if (!msg) return fallback;
  if (msg.length === 0 || msg.length > MAX_LEN) return fallback;
  if (TECHNICAL_RE.test(msg)) return fallback;
  return msg;
}

/**
 * Read a string field off an unknown caught value without reaching for `any`.
 *
 * Firebase, Apollo and fetch all throw plain objects carrying `code`/`name`/
 * `message` rather than real Error subclasses, so narrowing by `instanceof`
 * loses them. This reads the field defensively and returns undefined when the
 * shape is not what we hoped, which is exactly how the old `err?.code` behaved
 * — minus the `any`.
 */
export function errField(
  err: unknown,
  key: "code" | "name" | "message",
): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const v = (err as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}
