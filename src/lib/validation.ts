// src/lib/validation.ts
// Central Zod validation schemas — one source of truth for all FE forms.
// Field lengths mirror BE DTO @MaxLength decorators exactly.

import { z } from "zod";

// Accepts either local "09XXXXXXXXX" (11 digits) or country-code
// "639XXXXXXXXX" (12 digits, no leading +) — the two forms PH mobile numbers
// actually appear in across the app (typed locally, or pasted/read from a
// device's international-format contact card).
export const PH_MOBILE_RE = /^(09\d{9}|639\d{9})$/;
const PH_MOBILE_HINT = "Enter a valid mobile number (e.g. 09171234567 or 639171234567).";

// Shared live-typing helpers so every phone <TextInput> in the app behaves
// the same way instead of each screen re-deriving its own truncate/prefix logic.
export function truncatePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.slice(0, digits.startsWith("6") ? 12 : 11);
}

export function phoneFormatError(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.startsWith("0")) {
    if (digits.length >= 2 && !digits.startsWith("09")) {
      return "Mobile number must start with 09 (e.g. 09171234567).";
    }
    if (digits.length === 11 && !PH_MOBILE_RE.test(digits)) return PH_MOBILE_HINT;
    return "";
  }
  if (digits.startsWith("6")) {
    if (digits.length >= 2 && !digits.startsWith("63")) return PH_MOBILE_HINT;
    if (digits.length >= 3 && !digits.startsWith("639")) return PH_MOBILE_HINT;
    if (digits.length === 12 && !PH_MOBILE_RE.test(digits)) return PH_MOBILE_HINT;
    return "";
  }
  return "Mobile number must start with 09 (e.g. 09171234567).";
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export const emailSchema = z
  .string()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")
  .max(254, "Email is too long.");
const email = emailSchema;

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character (e.g. @, #, !).")
  .max(128, "Password is too long.");

const mobile = z
  .string()
  .regex(PH_MOBILE_RE, PH_MOBILE_HINT);

const requiredString = (label: string, max = 200) =>
  z.string().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`);

// Letters (incl. accented, e.g. ñ), spaces, hyphens, and apostrophes only —
// covers names like "Cruz-Santos" or "D'Angelo" while rejecting digits/symbols.
// Mirrors NAME_RE in the BE's name.validator.ts, so a value accepted here
// also passes the backend's @Matches check.
export const NAME_RE = /^(?=.*\p{L})[\p{L}\s'-]+$/u;
const NAME_HINT = "Only letters, spaces, hyphens, and apostrophes are allowed.";

const nameString = (label: string, max = 50) =>
  z.string()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`)
    .regex(NAME_RE, `${label}: ${NAME_HINT}`);

// Live-typing check for name <TextInput>s, mirroring phoneFormatError above —
// returns "" while the field is empty/valid, a message once it isn't.
export function nameFormatError(value: string): string {
  if (value.trim().length === 0) return "";
  return NAME_RE.test(value) ? "" : NAME_HINT;
}

const optionalText = (max: number) =>
  z.string().max(max, `Must be at most ${max} characters.`).optional();

// Caps stock quantities/prices at 7 digits (9,999,999) — generous for any real
// laundry-supply count while blocking fat-finger entries like accidentally
// pasting a 15-digit number into a decimal-pad field.
export const MAX_QUANTITY_DIGITS = 7;
export const MAX_QUANTITY_VALUE = 9_999_999;

// Restricts a decimal-pad TextInput's integer part to `maxDigits` digits,
// live, as the user types — mirrors truncatePhoneDigits above.
export function truncateQuantityDigits(raw: string, maxDigits = MAX_QUANTITY_DIGITS): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned.slice(0, maxDigits);
  const whole = cleaned.slice(0, dot).slice(0, maxDigits);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "");
  return `${whole}.${fraction}`;
}

// Peso amounts get more headroom than stock quantities (a branch's total
// cost basis can legitimately run into the millions+) but still a hard cap
// so a fat-finger paste can't produce an unbounded number.
export const MAX_CURRENCY_DIGITS = 13;

// Currency "mask" for a decimal-pad TextInput — formats the integer part
// with thousands separators live, as the user types (e.g. "1000000" ->
// "1,000,000"), and caps the fraction to 2 decimal places.
export function formatCurrencyInput(raw: string, maxIntDigits = MAX_CURRENCY_DIGITS): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  const wholeRaw = (dot === -1 ? cleaned : cleaned.slice(0, dot)).slice(0, maxIntDigits);
  const whole = wholeRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dot === -1) return whole;
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

// Recovers the numeric value from a formatCurrencyInput-masked string —
// parseFloat alone stops at the first comma, so strip them first.
export function parseCurrencyInput(formatted: string): number {
  const cleaned = formatted.replace(/,/g, "").trim();
  return cleaned === "" ? NaN : parseFloat(cleaned);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    firstName:       nameString("First name"),
    lastName:        nameString("Last name"),
    email,
    mobile,
    password,
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const completeProfileSchema = z.object({
  mobile,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: password,
    confirmNewPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: "Passwords do not match.",
    path: ["confirmNewPassword"],
  });

// ─── Onboarding / branch ──────────────────────────────────────────────────────

// Validates a StructuredAddress collected by AddressPicker (PSGC-structured).
// cityMunicipalityCode is the required anchor — all parent levels flow from it.
export const mailingAddressSchema = z.object({
  displayName:          z.string().optional(),
  latitude:             z.number().min(-90, "Invalid map location.").max(90, "Invalid map location.").nullable().optional(),
  longitude:            z.number().min(-180, "Invalid map location.").max(180, "Invalid map location.").nullable().optional(),
  unit:                 z.string().max(100, "Unit / floor is too long.").optional(),
  street:               z.string().max(200, "Street address is too long.").optional(),
  zipCode:              z.string().max(10,  "ZIP code is too long.").optional(),
  barangayName:         z.string().optional(),
  barangayCode:         z.string().optional(),
  cityMunicipalityName: z.string().min(1, "City / municipality is required."),
  cityMunicipalityCode: z.string().min(1, "City / municipality is required."),
  provinceName:         z.string().min(1, "Province is required."),
  provinceCode:         z.string().min(1, "Province is required."),
  regionName:           z.string().min(1, "Region is required."),
  regionCode:           z.string().min(1, "Region is required."),
});

// Business registration details, collected for verification. All optional —
// a branch is fully usable without them; they only gate the Verified badge.
// The TIN pattern mirrors the backend's (create-branch.input.ts).
export const businessTypeSchema = z.enum([
  "SOLE_PROPRIETORSHIP",
  "PARTNERSHIP",
  "CORPORATION",
  "COOPERATIVE",
]);

export const tinSchema = z
  .string()
  .trim()
  .regex(
    /^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/,
    "TIN must look like 000-000-000 or 000-000-000-00000.",
  );

export const branchSchema = z.object({
  name:           z.string().trim().min(2, "Branch name must be at least 2 characters.").max(100, "Branch name must be at most 100 characters."),
  address:        requiredString("Address", 500),
  phone:          mobile,
  mailingAddress: mailingAddressSchema.optional(),

  businessType:          businessTypeSchema.optional(),
  dtiRegistrationNumber: z.string().trim().max(50, "DTI number must be at most 50 characters.").optional(),
  tin:                   tinSchema.optional(),
  businessEmail:         z.string().trim().email("Enter a valid email address.").optional(),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const taskSchema = z.object({
  title:       requiredString("Title", 100),
  description: optionalText(500),
  noteText:    optionalText(500),
});

// ─── Inventory ────────────────────────────────────────────────────────────────

const maxQuantityDigitsMessage = `Quantity must be at most ${MAX_QUANTITY_DIGITS} digits.`;

export const restockSchema = z.object({
  quantity: z.number({ error: "Quantity must be a number." })
    .positive("Quantity must be greater than 0.")
    .max(MAX_QUANTITY_VALUE, maxQuantityDigitsMessage),
  reason:   optionalText(200),
});

export const adjustSchema = z.object({
  quantityChange: z.number({ error: "Quantity must be a number." })
    .refine((n) => n !== 0, "Adjustment cannot be zero.")
    .refine((n) => Math.abs(n) <= MAX_QUANTITY_VALUE, maxQuantityDigitsMessage),
  reason:         requiredString("Reason", 200),
});

// ─── POS / Orders ─────────────────────────────────────────────────────────────

export const orderNotesSchema = z.object({
  customerName:  optionalText(200),
  customerPhone: mobile.optional().or(z.literal("")),
  notes:         optionalText(1000),
});

// ─── Services ─────────────────────────────────────────────────────────────────

export const serviceSchema = z.object({
  serviceName: requiredString("Service name", 100),
  price:       z.number({ error: "Price must be a number." }).positive("Price must be greater than 0."),
});

// ─── Staff ────────────────────────────────────────────────────────────────────

export const staffSchema = z.object({
  firstName: nameString("First name"),
  lastName:  nameString("Last name"),
  email,
  mobile,
});

// ─── Costing ─────────────────────────────────────────────────────────────────

export const costingOneOffSchema = z.object({
  name:   requiredString("Cost name", 50),
  amount: z.number({ error: "Amount must be a number." }).min(0, "Amount cannot be negative."),
});

// ─── Type exports ─────────────────────────────────────────────────────────────

export type LoginInput           = z.infer<typeof loginSchema>;
export type RegisterInput        = z.infer<typeof registerSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
export type MailingAddressInput  = z.infer<typeof mailingAddressSchema>;
export type BranchInput          = z.infer<typeof branchSchema>;
export type TaskInput            = z.infer<typeof taskSchema>;
export type RestockInput         = z.infer<typeof restockSchema>;
export type AdjustInput          = z.infer<typeof adjustSchema>;
export type OrderNotesInput      = z.infer<typeof orderNotesSchema>;
export type ServiceInput         = z.infer<typeof serviceSchema>;
export type StaffInput           = z.infer<typeof staffSchema>;
export type CostingOneOffInput   = z.infer<typeof costingOneOffSchema>;
