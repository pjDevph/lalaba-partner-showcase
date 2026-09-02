// src/features/verification/status.ts
// Pure status derivation for the partner verification screens. No React, no
// network, no imports from src/components — this file is unit-testable on its
// own and is the single source of truth for what a row's chip says, what the
// header says, and what the progress bar shows.
//
// The backend gives us two things: a per-document-type status (null until
// something is submitted) and the provider's own verificationStatus
// (PENDING | IN_REVIEW | APPROVED | REJECTED). Neither maps to what a partner
// needs to see, so everything user-facing is derived here.

import type { KycDocumentStatus } from "../../services/graphql/kyc";

export type UiStatus =
  | "NOT_STARTED"
  | "INCOMPLETE"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACTION_REQUIRED"
  | "REJECTED"
  | "VERIFIED"
  | "EXPIRED";

// IN_REVIEW: every required document is in and none is rejected. The backend
// sets it — the app must not infer it, because the profile rows (Personal /
// Business Information) are part of OUR checklist and not the backend's, so
// the two can legitimately disagree about "everything is submitted".
export type ProviderVerificationStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED";

/**
 * Worst-first ordering, used to collapse a group of child rows (Government ID
 * = front + back, Business Photos = three shots) into one visual row, and to
 * decide which of several problems the header should lead with.
 *
 * ACTION_REQUIRED outranks EXPIRED deliberately: a rejection carries a
 * reviewer's written explanation the partner has to read, whereas an expiry is
 * self-evident and self-serve.
 */
const SEVERITY: readonly UiStatus[] = [
  "ACTION_REQUIRED",
  "EXPIRED",
  "NOT_STARTED",
  "INCOMPLETE",
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
];

function worst(statuses: readonly UiStatus[]): UiStatus {
  for (const candidate of SEVERITY) {
    if (statuses.includes(candidate)) return candidate;
  }
  return "VERIFIED";
}

/**
 * One uploaded document → one row status.
 *
 * REJECTED becomes ACTION_REQUIRED, never a bare "Rejected": the partner can
 * always fix a rejection by re-uploading, and a dead-end label is exactly the
 * UX this feature exists to avoid. `REJECTED` stays in UiStatus for the admin
 * panel, which shows raw document state.
 *
 * An APPROVED document whose expiry has passed reads EXPIRED — the backend
 * won't count it toward the badge either.
 */
export function deriveDocumentStatus(
  doc: { status: KycDocumentStatus | null; expiresAt: Date | null },
  now: Date = new Date(),
): UiStatus {
  switch (doc.status) {
    case null:
    case undefined:
    // Defensive: the backend filters superseded documents out of myKycStatus,
    // so this only fires if that ever changes.
    case "SUPERSEDED":
      return "NOT_STARTED";
    case "SUBMITTED":
      return "SUBMITTED";
    case "UNDER_REVIEW":
      return "UNDER_REVIEW";
    case "REJECTED":
      return "ACTION_REQUIRED";
    case "APPROVED":
      return doc.expiresAt && doc.expiresAt.getTime() <= now.getTime()
        ? "EXPIRED"
        : "VERIFIED";
    default:
      return "NOT_STARTED";
  }
}

/**
 * A checklist row backed by profile data the partner already filled in
 * (Personal Information, Business Information) rather than an upload.
 *
 * These are self-attested — nobody reviewed them — so callers should label
 * them "Complete"/"Incomplete"/"Not started" rather than "Verified", even
 * though VERIFIED is what makes them count toward completion.
 */
export function deriveProfileRowStatus(
  fields: readonly { filled: boolean }[],
): UiStatus {
  if (fields.length === 0) return "VERIFIED";
  const filled = fields.filter((f) => f.filled).length;
  if (filled === 0) return "NOT_STARTED";
  return filled === fields.length ? "VERIFIED" : "INCOMPLETE";
}

/** Collapses a grouped row (Government ID, Business Photos) to one status. */
export function deriveGroupStatus(children: readonly UiStatus[]): UiStatus {
  return children.length === 0 ? "NOT_STARTED" : worst(children);
}

/** A row as the screens consume it, after per-row derivation. */
export interface VerificationRow {
  key: string;
  status: UiStatus;
  /** Optional rows (a document retired from the required set) don't count. */
  required: boolean;
}

/**
 * The single status shown in the header and on the Settings card.
 *
 * Note what this never returns: REJECTED. rejectKycDocument always leaves both
 * the document REJECTED and the provider REJECTED, so a provider-level
 * rejection with no actionable document is unreachable — and ACTION_REQUIRED
 * is the one that tells the partner they can fix it.
 *
 * A grandfathered provider (APPROVED badge, new requirements outstanding)
 * lands on INCOMPLETE via rule 4. That is intended: the screen pairs it with a
 * banner explaining the badge is not at risk.
 */
export function deriveAggregateStatus(
  providerStatus: ProviderVerificationStatus,
  rows: readonly VerificationRow[],
): UiStatus {
  // No `now` parameter: expiry was already resolved when each row's status was
  // derived, so re-checking the clock here would be a second source of truth.
  const required = rows.filter((r) => r.required).map((r) => r.status);
  if (required.length === 0) return "NOT_STARTED";

  const has = (s: UiStatus) => required.includes(s);

  if (has("ACTION_REQUIRED") || providerStatus === "REJECTED") {
    return "ACTION_REQUIRED";
  }
  if (has("EXPIRED")) return "EXPIRED";
  if (providerStatus === "APPROVED" && required.every((s) => s === "VERIFIED")) {
    return "VERIFIED";
  }
  if (has("NOT_STARTED") || has("INCOMPLETE")) {
    return required.every((s) => s === "NOT_STARTED")
      ? "NOT_STARTED"
      : "INCOMPLETE";
  }
  // providerStatus IN_REVIEW means the backend has every required document and
  // none is rejected. Checked after the INCOMPLETE rule on purpose: our
  // checklist also contains profile rows the backend knows nothing about, so a
  // partner with an unfinished profile still has work to do even when the
  // backend considers the document set complete.
  if (has("UNDER_REVIEW") || providerStatus === "IN_REVIEW") {
    return "UNDER_REVIEW";
  }
  return "SUBMITTED";
}

/** Statuses where the partner has done their part and is waiting on us. */
const DONE_STATUSES: readonly UiStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
];

/** Statuses that need the partner to do something. */
const ACTIONABLE_STATUSES: readonly UiStatus[] = [
  "NOT_STARTED",
  "INCOMPLETE",
  "ACTION_REQUIRED",
  "EXPIRED",
];

export interface VerificationProgress {
  done: number;
  total: number;
  /** 0–100. Never reports 100 until every required row is done. */
  percent: number;
  /** Rows still needing partner action — drives "N requirements remaining". */
  remaining: number;
  /** Rows already approved, for the solid segment of the progress bar. */
  verified: number;
}

/**
 * Completion measures what the PARTNER controls, so a submitted document
 * counts immediately. That keeps "100% · Under review" coherent and stops the
 * bar sliding backwards just because a reviewer is slow.
 *
 * Grouped rows must be passed as their individual leaves (Business Photos = 3
 * rows, not 1), otherwise uploading one of three photos moves nothing.
 */
export function computeProgress(
  rows: readonly VerificationRow[],
): VerificationProgress {
  const required = rows.filter((r) => r.required);
  const total = required.length;
  const done = required.filter((r) => DONE_STATUSES.includes(r.status)).length;
  const verified = required.filter((r) => r.status === "VERIFIED").length;
  const remaining = required.filter((r) =>
    ACTIONABLE_STATUSES.includes(r.status),
  ).length;

  let percent: number;
  if (total === 0) percent = 0;
  else if (done === total) percent = 100;
  // Clamp to 99 so rounding can never claim completion that hasn't happened.
  else percent = Math.min(99, Math.round((done / total) * 100));

  return { done, total, percent, remaining, verified };
}

// ── Presentation helpers ────────────────────────────────────────────────────
// Kept here so the washer and merchant screens can't drift apart on wording.

const DOCUMENT_STATUS_LABELS: Record<UiStatus, string> = {
  NOT_STARTED: "Not started",
  INCOMPLETE: "Incomplete",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  ACTION_REQUIRED: "Action required",
  REJECTED: "Verification failed",
  VERIFIED: "Verified",
  EXPIRED: "Expired",
};

// Profile rows are self-attested, so they never claim to be "Verified".
const PROFILE_STATUS_LABELS: Record<UiStatus, string> = {
  ...DOCUMENT_STATUS_LABELS,
  VERIFIED: "Complete",
  INCOMPLETE: "Incomplete",
};

export function statusLabel(
  status: UiStatus,
  kind: "DOCUMENT" | "PROFILE" = "DOCUMENT",
): string {
  return kind === "PROFILE"
    ? PROFILE_STATUS_LABELS[status]
    : DOCUMENT_STATUS_LABELS[status];
}

/**
 * Why a row's upload controls are locked, or null when the partner may upload.
 *
 * Two reasons, both of which mean "not yours to change right now":
 *
 *  IN_REVIEW — it is sitting with a reviewer. Replacing it mid-review would
 *              invalidate the decision being made.
 *  APPROVED  — it has already been accepted. A partner replacing an approved
 *              ID or selfie with something else would silently swap out
 *              verified identity evidence, so the only routes back to the
 *              camera are a reviewer rejecting it or the document expiring.
 *
 * Note what is NOT locked: EXPIRED. An approved document past its expiry
 * derives to EXPIRED rather than VERIFIED (see deriveDocumentStatus), so the
 * partner can and must replace it.
 */
export type UploadLock = {
  reason: "IN_REVIEW" | "APPROVED";
  /** What the row says in place of the upload buttons. */
  message: string;
} | null;

export function uploadLock(status: UiStatus): UploadLock {
  switch (status) {
    case "UNDER_REVIEW":
      return {
        reason: "IN_REVIEW",
        message:
          "A reviewer is checking this now. You can replace it once they're done.",
      };
    case "SUBMITTED":
      return {
        reason: "IN_REVIEW",
        message:
          "Waiting for review. You can replace it once a reviewer has looked at it.",
      };
    case "VERIFIED":
      return {
        reason: "APPROVED",
        message:
          "Approved. Contact support if this needs to be changed — you'll be able to upload a new one if it's ever rejected or expires.",
      };
    default:
      return null;
  }
}
