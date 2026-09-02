// Unit tests for the requirement grouping, focused on the government-ID card.
// Which slots that card shows is the one place the app decides something about
// the required set rather than reporting the server's answer, so its edges are
// pinned here.

import {
  buildGroupViews,
  buildRetiredSlots,
  toProgressRows,
  isSingleSidedId,
  GOVERNMENT_ID_TYPE_OPTIONS,
  GOVERNMENT_ID_TYPE_LABELS,
  WASHER_GROUPS,
  MERCHANT_GROUPS,
} from "../features/verification/requirements";
import type {
  GovernmentIdType,
  KycDocumentType,
  KycDocumentTypeStatus,
  MyKycStatus,
} from "../services/graphql/kyc";

const NOW = new Date("2026-08-18T00:00:00Z");

const doc = (
  documentType: KycDocumentType,
  overrides: Partial<KycDocumentTypeStatus> = {},
): KycDocumentTypeStatus => ({
  documentType,
  required: true,
  expiryPolicy: "OPTIONAL",
  status: null,
  documentId: null,
  submittedAt: null,
  reviewedAt: null,
  expiresAt: null,
  rejectionReason: null,
  ...overrides,
});

const washerStatus = (
  governmentIdType: GovernmentIdType | null = null,
  documents: KycDocumentTypeStatus[] = [
    doc("VALID_ID"),
    doc("VALID_ID_BACK"),
    doc("SELFIE", { expiryPolicy: "NONE" }),
    doc("PROOF_OF_ADDRESS"),
    doc("BARANGAY_CLEARANCE", { expiryPolicy: "REQUIRED" }),
  ],
): MyKycStatus => ({
  providerId: "washer-1",
  providerType: "WASHER",
  verificationStatus: "PENDING",
  verifiedAt: null,
  providerRejectionReason: null,
  governmentIdType,
  documents,
});

const slotsOf = (
  status: MyKycStatus,
  idType: GovernmentIdType | null = null,
): KycDocumentType[] => {
  const view = buildGroupViews(WASHER_GROUPS, status, NOW, idType).find(
    (v) => v.group.key === "government-id",
  );
  return view?.slots.map((s) => s.documentType) ?? [];
};

describe("government ID options", () => {
  it("offers every ID type exactly once, with the catch-all last", () => {
    const values = GOVERNMENT_ID_TYPE_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.at(-1)).toBe("OTHER");
  });

  it("labels every option it offers", () => {
    for (const option of GOVERNMENT_ID_TYPE_OPTIONS) {
      expect(GOVERNMENT_ID_TYPE_LABELS[option.value]).toBe(option.label);
    }
  });

  it("treats only the passport as single-sided", () => {
    expect(isSingleSidedId("PASSPORT")).toBe(true);
    expect(isSingleSidedId("DRIVERS_LICENSE")).toBe(false);
    // Unknown provenance means we ask for both sides — never fewer.
    expect(isSingleSidedId("OTHER")).toBe(false);
    expect(isSingleSidedId(null)).toBe(false);
  });
});

describe("capture modes", () => {
  const groupsByKey = new Map(
    [...WASHER_GROUPS, ...MERCHANT_GROUPS].map((g) => [g.key, g]),
  );

  it("gives both government-ID cards the guided camera", () => {
    // Not a cosmetic choice: the system camera cannot be drawn on, so anything
    // still on the default gets no framing guide at all.
    expect(groupsByKey.get("government-id")?.capture).toBe("ID_CARD");
    expect(groupsByKey.get("owner-id")?.capture).toBe("ID_CARD");
  });

  it("leaves the selfie on the liveness capture", () => {
    // Downgrading this to a guided camera would hand the user a manual shutter
    // and quietly turn the liveness check into decoration.
    expect(groupsByKey.get("selfie")?.capture).toBe("LIVENESS");
  });

  it("leaves shapeless documents on the system camera", () => {
    // A barangay clearance, a utility bill and a storefront have no fixed
    // aspect ratio, so a card guide would be worse than none.
    for (const key of [
      "proof-of-address",
      "barangay-clearance",
      "dti",
      "bir",
      "business-photos",
    ]) {
      expect(groupsByKey.get(key)?.capture).toBeUndefined();
    }
  });

  it("keeps the liveness group single-typed and file-free", () => {
    // The invariant the RequirementGroup docblock states: liveness bytes must
    // come from a live face on this device, and a file upload defeats that.
    // ID_CARD carries no such restriction — it is framing help, not evidence.
    const selfie = groupsByKey.get("selfie");
    expect(selfie?.documentTypes).toHaveLength(1);
    expect(selfie?.allowFiles).toBeUndefined();
    expect(groupsByKey.get("government-id")?.allowFiles).toBe(true);
  });
});

describe("buildGroupViews — government ID slots", () => {
  it("asks for both sides before an ID type is chosen", () => {
    expect(slotsOf(washerStatus(), null)).toEqual([
      "VALID_ID",
      "VALID_ID_BACK",
    ]);
  });

  it("asks for both sides of a two-sided ID", () => {
    expect(slotsOf(washerStatus(), "DRIVERS_LICENSE")).toEqual([
      "VALID_ID",
      "VALID_ID_BACK",
    ]);
  });

  it("drops the back of a passport — there isn't one", () => {
    expect(slotsOf(washerStatus(), "PASSPORT")).toEqual(["VALID_ID"]);
  });

  it("honours a local pick before anything is on file", () => {
    // Nothing submitted yet, so nothing contradicts the pick. Hiding the back
    // now is the whole point: the passport front about to be uploaded will make
    // the server agree.
    expect(slotsOf(washerStatus(null), "PASSPORT")).toEqual(["VALID_ID"]);
  });

  it("keeps the back visible while a two-sided ID is still the one on file", () => {
    // The washer uploaded a driver's licence, then changed the picker to
    // PASSPORT without re-uploading. The server derives the required set from
    // the SUBMITTED front, so it still wants the back — hiding it here would
    // leave an unsatisfiable requirement with nothing on screen to satisfy it.
    expect(slotsOf(washerStatus("DRIVERS_LICENSE"), "PASSPORT")).toEqual([
      "VALID_ID",
      "VALID_ID_BACK",
    ]);
  });

  it("drops the back once the passport front is actually on file", () => {
    // Same washer, one upload later: the server now agrees, so the slot goes.
    expect(slotsOf(washerStatus("PASSPORT"), "PASSPORT")).toEqual(["VALID_ID"]);
  });

  it("leaves every other group alone", () => {
    const views = buildGroupViews(WASHER_GROUPS, washerStatus(), NOW, "PASSPORT");
    const keys = views.map((v) => v.group.key);
    expect(keys).toEqual([
      "government-id",
      "selfie",
      "proof-of-address",
      "barangay-clearance",
    ]);
    expect(
      views.find((v) => v.group.key === "selfie")?.slots.map((s) => s.documentType),
    ).toEqual(["SELFIE"]);
  });

  it("does not touch the merchant's owner-ID card, which has no back slot", () => {
    const merchantStatus: MyKycStatus = {
      ...washerStatus("PASSPORT"),
      providerType: "MERCHANT_BRANCH",
      documents: [doc("OWNER_VALID_ID"), doc("DTI_CERTIFICATE")],
    };
    const view = buildGroupViews(
      MERCHANT_GROUPS,
      merchantStatus,
      NOW,
      "PASSPORT",
    ).find((v) => v.group.key === "owner-id");
    expect(view?.slots.map((s) => s.documentType)).toEqual(["OWNER_VALID_ID"]);
  });

  it("shrinks the progress denominator when the back is dropped", () => {
    const both = toProgressRows(
      buildGroupViews(WASHER_GROUPS, washerStatus(), NOW, "DRIVERS_LICENSE"),
    );
    const passport = toProgressRows(
      buildGroupViews(WASHER_GROUPS, washerStatus(), NOW, "PASSPORT"),
    );
    expect(passport).toHaveLength(both.length - 1);
    expect(passport.map((r) => r.key)).not.toContain("VALID_ID_BACK");
  });

  it("does not spill a hidden back slot into Additional documents", () => {
    // buildRetiredSlots lists anything the groups don't cover. A back side that
    // is merely hidden is still covered — surfacing it under a heading that
    // means "no longer required" would put the requirement straight back on
    // screen with worse wording.
    const status = washerStatus("PASSPORT", [
      doc("VALID_ID", { status: "SUBMITTED" }),
      doc("VALID_ID_BACK", { status: "SUBMITTED", required: false }),
      doc("SELFIE", { expiryPolicy: "NONE" }),
    ]);
    expect(slotsOf(status, "PASSPORT")).toEqual(["VALID_ID"]);
    expect(
      buildRetiredSlots(WASHER_GROUPS, status, NOW).map((s) => s.documentType),
    ).toEqual([]);
  });
});
