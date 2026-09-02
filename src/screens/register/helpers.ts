// Pure helpers for the Register screen — email validation + auth error mapping.
import { z } from "zod";

// Live-typing check for the email field, mirrored on Mobile's onChange +
// onBlur pattern — validates on every keystroke instead of only on blur, so
// the error is visible immediately instead of requiring a trip to the next
// field and back.
export function emailFormatError(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const result = z.email("Enter a valid email address.").safeParse(trimmed);
  return result.success ? "" : (result.error.issues[0]?.message ?? "Enter a valid email address.");
}

// Uppercase the first letter of each word as the user types (space/hyphen/
// apostrophe separated, e.g. "mary-jane o'brien" → "Mary-Jane O'Brien").
// Only uppercases — never lowercases what the user already typed.
export function capitalizeWords(value: string): string {
  return value.replace(/(^|[\s\-'])([a-zñáéíóúü])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

// ─── Error → human-readable message ──────────────────────────────────────────
export function friendlyRegisterError(err: any): string {
  const code: string = err?.code ?? "";
  const msg: string  = err?.message ?? "";

  // Firebase Auth errors
  if (code === "auth/email-already-in-use")  return "This email is already registered. Sign in instead.";
  if (code === "auth/invalid-email")          return "Please enter a valid email address.";
  if (code === "auth/weak-password")          return "Password is too weak. Use at least 6 characters.";
  if (code === "auth/network-request-failed") return "Network error — check your connection and try again.";
  if (code === "auth/too-many-requests")      return "Too many attempts. Please wait a moment and try again.";
  if (code === "network-error")               return "Could not reach the server. Check your connection.";

  // GraphQL / BE errors — the BE now sends friendly ConflictException messages,
  // so we can pass them through directly. Only filter out raw DB noise.
  if (code === "CONFLICT") return msg || "This account already exists. Please sign in instead.";

  // MongoDB duplicate key — backend throws INTERNAL_SERVER_ERROR instead of CONFLICT
  if (msg.startsWith("E11000") || msg.includes("duplicate key")) {
    return "This email is already registered. Please sign in or use a different email address.";
  }

  // Missing/invalid consent acceptances — a required agreement wasn't recorded.
  if (/consent/i.test(msg) || msg.includes("ConsentInput")) {
    return "We couldn't record your agreement to the Terms and Privacy Policy. Please try again.";
  }

  // Raw GraphQL validation noise (e.g. 'Variable "$input" got invalid value …',
  // '… was not provided', 'Expected type …') should never reach the user.
  if (
    /variable ["']?\$/i.test(msg) ||
    msg.includes("got invalid value") ||
    msg.includes("was not provided") ||
    /Expected (type|value)/i.test(msg) ||
    msg.includes("Cannot query field")
  ) {
    return "Something went wrong creating your account. Please try again, or contact support if it continues.";
  }

  // Pass through genuinely human-readable backend messages, but never leak
  // internal/database error text.
  if (msg && !/Mongo|GraphQL|\$input|E11000|ObjectId/i.test(msg)) {
    return msg;
  }

  // Fallback for anything raw / unexpected
  return "Registration failed. Please try again.";
}

// True when the failure specifically means "that email is already taken" —
// worth routing back to the email field with an inline warning instead of
// a blocking modal, since it's the one registration error the user can fix
// immediately by editing a field they can see.
export function isEmailTakenError(err: any): boolean {
  const code: string = err?.code ?? "";
  const msg: string  = err?.message ?? "";
  return (
    code === "auth/email-already-in-use" ||
    code === "CONFLICT" ||
    msg.startsWith("E11000") ||
    msg.includes("duplicate key")
  );
}
