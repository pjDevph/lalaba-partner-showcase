// Unit tests for the pure verification status derivation. This module decides
// what every chip, header and progress bar in the verification screens says,
// so its edge cases are pinned here rather than discovered on a device.

import {
  computeProgress,
  deriveAggregateStatus,
  deriveDocumentStatus,
  deriveGroupStatus,
  deriveProfileRowStatus,
  uploadLock,
  statusLabel,
  type UiStatus,
  type VerificationRow,
} from "../features/verification/status";

const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");
const NOW = new Date("2026-08-12T00:00:00Z");

const row = (status: UiStatus, required = true): VerificationRow => ({
  key: status + Math.random(),
  status,
  required,
});

describe("deriveDocumentStatus", () => {
  it("treats a never-submitted document as not started", () => {
    expect(
      deriveDocumentStatus({ status: null, expiresAt: null }, NOW),
    ).toBe("NOT_STARTED");
  });

  it("treats a superseded document as not started (defensive)", () => {
    expect(
      deriveDocumentStatus({ status: "SUPERSEDED", expiresAt: null }, NOW),
    ).toBe("NOT_STARTED");
  });

  it("maps submitted and under-review straight through", () => {
    expect(
      deriveDocumentStatus({ status: "SUBMITTED", expiresAt: null }, NOW),
    ).toBe("SUBMITTED");
    expect(
      deriveDocumentStatus({ status: "UNDER_REVIEW", expiresAt: null }, NOW),
    ).toBe("UNDER_REVIEW");
  });

  it("renders a rejection as ACTION_REQUIRED, never a bare REJECTED", () => {
    expect(
      deriveDocumentStatus({ status: "REJECTED", expiresAt: null }, NOW),
    ).toBe("ACTION_REQUIRED");
  });

  it("verifies an approved document with no expiry", () => {
    expect(
      deriveDocumentStatus({ status: "APPROVED", expiresAt: null }, NOW),
    ).toBe("VERIFIED");
  });

  it("verifies an approved document whose expiry is still ahead", () => {
    expect(
      deriveDocumentStatus({ status: "APPROVED", expiresAt: FUTURE }, NOW),
    ).toBe("VERIFIED");
  });

  it("expires an approved document whose expiry has passed", () => {
    expect(
      deriveDocumentStatus({ status: "APPROVED", expiresAt: PAST }, NOW),
    ).toBe("EXPIRED");
  });
});

describe("deriveProfileRowStatus", () => {
  it("is NOT_STARTED with nothing filled, INCOMPLETE partially, VERIFIED when whole", () => {
    expect(deriveProfileRowStatus([{ filled: false }, { filled: false }])).toBe(
      "NOT_STARTED",
    );
    expect(deriveProfileRowStatus([{ filled: true }, { filled: false }])).toBe(
      "INCOMPLETE",
    );
    expect(deriveProfileRowStatus([{ filled: true }, { filled: true }])).toBe(
      "VERIFIED",
    );
  });

  it("treats a row with no fields as satisfied", () => {
    expect(deriveProfileRowStatus([])).toBe("VERIFIED");
  });
});

describe("deriveGroupStatus", () => {
  it("surfaces the worst child status", () => {
    expect(deriveGroupStatus(["VERIFIED", "SUBMITTED"])).toBe("SUBMITTED");
    expect(deriveGroupStatus(["VERIFIED", "NOT_STARTED"])).toBe("NOT_STARTED");
    expect(deriveGroupStatus(["NOT_STARTED", "ACTION_REQUIRED"])).toBe(
      "ACTION_REQUIRED",
    );
  });

  it("ranks a rejection above an expiry — a reason needs reading", () => {
    expect(deriveGroupStatus(["EXPIRED", "ACTION_REQUIRED"])).toBe(
      "ACTION_REQUIRED",
    );
  });

  it("is VERIFIED only when every child is", () => {
    expect(deriveGroupStatus(["VERIFIED", "VERIFIED"])).toBe("VERIFIED");
  });
});

describe("deriveAggregateStatus", () => {
  it("leads with ACTION_REQUIRED over everything else", () => {
    expect(
      deriveAggregateStatus("PENDING", [
        row("EXPIRED"),
        row("ACTION_REQUIRED"),
        row("NOT_STARTED"),
      ]),
    ).toBe("ACTION_REQUIRED");
  });

  it("treats a provider-level rejection as actionable", () => {
    expect(deriveAggregateStatus("REJECTED", [row("VERIFIED")])).toBe(
      "ACTION_REQUIRED",
    );
  });

  it("reports EXPIRED when nothing was rejected", () => {
    expect(
      deriveAggregateStatus("APPROVED", [row("VERIFIED"), row("EXPIRED")]),
    ).toBe("EXPIRED");
  });

  it("is VERIFIED only when the badge is granted AND every row is verified", () => {
    expect(
      deriveAggregateStatus("APPROVED", [row("VERIFIED"), row("VERIFIED")]),
    ).toBe("VERIFIED");
    // Badge granted but a row is still in review — not done yet.
    expect(
      deriveAggregateStatus("APPROVED", [row("VERIFIED"), row("UNDER_REVIEW")]),
    ).toBe("UNDER_REVIEW");
  });

  it("is NOT_STARTED only when nothing at all has been done", () => {
    expect(
      deriveAggregateStatus("PENDING", [row("NOT_STARTED"), row("NOT_STARTED")]),
    ).toBe("NOT_STARTED");
    expect(
      deriveAggregateStatus("PENDING", [row("NOT_STARTED"), row("SUBMITTED")]),
    ).toBe("INCOMPLETE");
  });

  it("puts a grandfathered provider at INCOMPLETE without touching its badge", () => {
    // Verified under the old required set; the new documents are untouched.
    const status = deriveAggregateStatus("APPROVED", [
      row("VERIFIED"),
      row("NOT_STARTED"),
      row("NOT_STARTED"),
    ]);
    expect(status).toBe("INCOMPLETE");
    expect(status).not.toBe("ACTION_REQUIRED");
  });

  it("reports SUBMITTED when everything is in and nothing is claimed yet", () => {
    expect(
      deriveAggregateStatus("PENDING", [row("SUBMITTED"), row("SUBMITTED")]),
    ).toBe("SUBMITTED");
  });

  it("reports UNDER_REVIEW when the backend says IN_REVIEW", () => {
    // The backend flips the provider to IN_REVIEW once it holds every required
    // document. Without this the card would read the weaker "Submitted" even
    // though a reviewer already has the complete set.
    expect(
      deriveAggregateStatus("IN_REVIEW", [row("SUBMITTED"), row("SUBMITTED")]),
    ).toBe("UNDER_REVIEW");
  });

  it("keeps INCOMPLETE over IN_REVIEW while a profile row is unfinished", () => {
    // Profile rows (Personal / Business Information) are part of OUR checklist
    // and invisible to the backend, so IN_REVIEW must not override work the
    // partner still owes us.
    expect(
      deriveAggregateStatus("IN_REVIEW", [row("SUBMITTED"), row("INCOMPLETE")]),
    ).toBe("INCOMPLETE");
  });

  it("ignores optional rows entirely", () => {
    expect(
      deriveAggregateStatus("APPROVED", [
        row("VERIFIED"),
        row("ACTION_REQUIRED", false),
      ]),
    ).toBe("VERIFIED");
  });

  it("never emits REJECTED to the partner", () => {
    const cases: UiStatus[] = [
      deriveAggregateStatus("REJECTED", [row("ACTION_REQUIRED")]),
      deriveAggregateStatus("REJECTED", [row("NOT_STARTED")]),
      deriveAggregateStatus("REJECTED", [row("VERIFIED")]),
    ];
    expect(cases).not.toContain("REJECTED");
  });
});

describe("computeProgress", () => {
  it("counts submitted work as done — the partner's part is finished", () => {
    const p = computeProgress([
      row("VERIFIED"),
      row("SUBMITTED"),
      row("UNDER_REVIEW"),
      row("NOT_STARTED"),
    ]);
    expect(p.done).toBe(3);
    expect(p.total).toBe(4);
    expect(p.percent).toBe(75);
    expect(p.remaining).toBe(1);
    expect(p.verified).toBe(1);
  });

  it("reaches 100% while still under review", () => {
    const p = computeProgress([row("SUBMITTED"), row("UNDER_REVIEW")]);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it("never rounds up to 100 before everything is done", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row(i === 0 ? "NOT_STARTED" : "VERIFIED"),
    );
    expect(computeProgress(rows).percent).toBe(99);
  });

  it("excludes optional rows from the denominator", () => {
    const p = computeProgress([row("VERIFIED"), row("NOT_STARTED", false)]);
    expect(p.total).toBe(1);
    expect(p.percent).toBe(100);
  });

  it("counts expired and action-required rows as remaining work", () => {
    const p = computeProgress([row("EXPIRED"), row("ACTION_REQUIRED")]);
    expect(p.remaining).toBe(2);
    expect(p.done).toBe(0);
    expect(p.percent).toBe(0);
  });

  it("handles an empty requirement set without dividing by zero", () => {
    expect(computeProgress([]).percent).toBe(0);
  });
});

describe("labels and locking", () => {
  it("never tells a partner their self-attested profile row is 'Verified'", () => {
    expect(statusLabel("VERIFIED", "DOCUMENT")).toBe("Verified");
    expect(statusLabel("VERIFIED", "PROFILE")).toBe("Complete");
  });

  it("locks uploads while the document sits with a reviewer", () => {
    expect(uploadLock("SUBMITTED")?.reason).toBe("IN_REVIEW");
    expect(uploadLock("UNDER_REVIEW")?.reason).toBe("IN_REVIEW");
  });

  // Replacing an approved ID or selfie would swap out identity evidence a
  // reviewer already accepted. The way back to the camera is a rejection.
  it("locks uploads once the document is approved", () => {
    expect(uploadLock("VERIFIED")?.reason).toBe("APPROVED");
  });

  it("leaves the partner a way to act on what they still have to fix", () => {
    expect(uploadLock("ACTION_REQUIRED")).toBeNull();
    expect(uploadLock("NOT_STARTED")).toBeNull();
    // An approved document past its expiry derives to EXPIRED, not VERIFIED —
    // if this ever locked, an expiring clearance would be unrenewable.
    expect(uploadLock("EXPIRED")).toBeNull();
  });
});
