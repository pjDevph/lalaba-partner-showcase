// src/features/verification/requirements.ts
// What each role has to submit, how it's worded, and how the backend's flat
// per-document-type list is regrouped into the cards the partner actually
// sees. Pure data + pure functions — no React, no network.
//
// The backend models Government ID and Business Photos as several independent
// document types so a reviewer can reject one without invalidating the others
// (see kyc-document.schema.ts). Partners think of each as ONE requirement, so
// the grouping is undone here, at the presentation edge.

import type {
  GovernmentIdType,
  KycDocumentType,
  KycDocumentTypeStatus,
  MyKycStatus,
} from "../../services/graphql/kyc";
import {
  deriveDocumentStatus,
  deriveGroupStatus,
  type UiStatus,
  type VerificationRow,
} from "./status";

// ─── Copy ──────────────────────────────────────────────────────────────────

export const DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  BUSINESS_PERMIT: "Business Permit",
  OWNER_VALID_ID: "Owner / Representative ID",
  DTI_CERTIFICATE: "DTI Business Name Certificate",
  BIR_2303: "BIR Certificate of Registration",
  BUSINESS_PHOTO_STOREFRONT: "Store front",
  BUSINESS_PHOTO_INTERIOR: "Inside store",
  BUSINESS_PHOTO_MACHINES: "Laundry machines",
  VALID_ID: "Front of ID",
  VALID_ID_BACK: "Back of ID",
  BARANGAY_CLEARANCE: "Barangay Clearance",
  PROOF_OF_ADDRESS: "Proof of Address",
  SELFIE: "Selfie Verification",
};

export const DOCUMENT_HINTS: Partial<Record<KycDocumentType, string>> = {
  BUSINESS_PERMIT: "No longer required — kept because you already uploaded it.",
  OWNER_VALID_ID: "A valid government-issued ID of the business owner.",
  DTI_CERTIFICATE: "Your DTI Business Name Registration Certificate.",
  BIR_2303: "BIR Form 2303, your Certificate of Registration.",
  BUSINESS_PHOTO_STOREFRONT: "The outside of your shop, sign visible.",
  BUSINESS_PHOTO_INTERIOR: "The customer-facing area inside.",
  BUSINESS_PHOTO_MACHINES: "Your washers and dryers.",
  VALID_ID: "Make sure the whole ID is in frame and readable.",
  VALID_ID_BACK: "The reverse side of the same ID.",
  BARANGAY_CLEARANCE: "A current clearance from your barangay.",
  PROOF_OF_ADDRESS: "A recent utility bill or similar, showing your address.",
  SELFIE: "We'll ask you to blink or turn your head, then take the photo for you.",
};

// ─── Government ID types ───────────────────────────────────────────────────

/**
 * Partner-facing copy for each ID, in the order the picker lists them —
 * roughly by how commonly a Filipino washer holds one, with the catch-all last.
 *
 * Order is deliberate and not alphabetical: the picker is a flat list of eleven,
 * and putting the two most likely answers at the top is most of the difference
 * between scanning it and reading it.
 */
export const GOVERNMENT_ID_TYPE_OPTIONS: readonly {
  value: GovernmentIdType;
  label: string;
}[] = [
  { value: "PHILSYS_NATIONAL_ID", label: "PhilSys / National ID" },
  { value: "DRIVERS_LICENSE", label: "Driver's License" },
  { value: "UMID", label: "UMID" },
  { value: "PASSPORT", label: "Passport" },
  { value: "SSS_ID", label: "SSS ID" },
  { value: "PHILHEALTH_ID", label: "PhilHealth ID" },
  { value: "POSTAL_ID", label: "Postal ID" },
  { value: "VOTERS_ID", label: "Voter's ID" },
  { value: "PRC_ID", label: "PRC ID" },
  { value: "TIN_ID", label: "TIN ID" },
  { value: "OTHER", label: "Other government-issued ID" },
];

export const GOVERNMENT_ID_TYPE_LABELS: Record<GovernmentIdType, string> =
  Object.fromEntries(
    GOVERNMENT_ID_TYPE_OPTIONS.map((o) => [o.value, o.label]),
  ) as Record<GovernmentIdType, string>;

/**
 * IDs with nothing on the reverse, mirroring
 * SINGLE_SIDED_GOVERNMENT_ID_TYPES in kyc-document.schema.ts. A passport's data
 * page is the whole document, so asking for a back side is asking for something
 * that does not exist.
 *
 * This only hides a slot the server has already marked not-required; the server
 * remains the authority on what completes verification.
 */
export const SINGLE_SIDED_ID_TYPES: readonly GovernmentIdType[] = ["PASSPORT"];

export function isSingleSidedId(idType: GovernmentIdType | null): boolean {
  return !!idType && SINGLE_SIDED_ID_TYPES.includes(idType);
}

// ─── Requirement groups ────────────────────────────────────────────────────

export interface RequirementGroup {
  key: string;
  title: string;
  description: string;
  /** Backend document types this card covers, in display order. */
  documentTypes: KycDocumentType[];
  /**
   * PDFs/DOCX are meaningful for certificates, not for photos.
   *
   * Omitting this is also what makes a group camera-only: "Take photo" is always
   * offered, and "Upload file" is the only other action, so a selfie or a
   * storefront photo cannot come from the gallery. (There used to be a separate
   * `cameraOnly` flag guarding a third "Choose photo" button; that button was
   * redundant with "Upload file", and removing it left the flag with nothing
   * to guard.)
   */
  allowFiles?: boolean;
  /**
   * How the photo is taken.
   *
   *   "CAMERA"   (default) — the system camera, user presses the shutter.
   *   "LIVENESS" — the courier liveness check: front camera, a randomised
   *                blink/turn challenge, and an automatic shutter the user
   *                cannot fire themselves. Only meaningful for a face.
   *   "ID_CARD"  — an in-app rear-camera preview with a card-shaped guide and
   *                a manual shutter. For anything ID-1 sized, where the app can
   *                say exactly where the document should sit; the system camera
   *                cannot be drawn on, so it can offer no such help.
   *
   * A LIVENESS group must be a single document type and must not set
   * allowFiles — the point is that the bytes come from a live face in front of
   * this device, and any other source defeats it. ID_CARD carries no such
   * restriction: it is framing help, not evidence, and a PDF scan of an ID is
   * still perfectly acceptable.
   */
  capture?: "CAMERA" | "LIVENESS" | "ID_CARD";
  /**
   * This card collects a government ID, so it shows the ID-type picker and its
   * FIRST document type is the front — the one the claim is stored against.
   *
   * A flag rather than a `key === "government-id"` check in the screen: the
   * merchant's owner-ID card is the same kind of requirement under a different
   * key, and the screen should not have to know either name.
   */
  governmentId?: true;
}

export const WASHER_GROUPS: RequirementGroup[] = [
  {
    key: "government-id",
    title: "Government-issued ID",
    description: "Tell us which ID you're using, then upload it.",
    documentTypes: ["VALID_ID", "VALID_ID_BACK"],
    allowFiles: true,
    governmentId: true,
    capture: "ID_CARD",
  },
  {
    key: "selfie",
    title: "Selfie Verification",
    description: "Confirms the ID belongs to you.",
    documentTypes: ["SELFIE"],
    // Same check the couriers pass. This photo is not just evidence — the
    // backend publishes it as the washer's avatar and her store logo the moment
    // it lands, so a free-form camera shot of anyone at all would go straight
    // onto the marketplace under her name.
    capture: "LIVENESS",
  },
  {
    key: "proof-of-address",
    title: "Proof of Address",
    description: "A document showing where you operate.",
    documentTypes: ["PROOF_OF_ADDRESS"],
    allowFiles: true,
  },
  {
    key: "barangay-clearance",
    title: "Barangay Clearance",
    description: "Must be current — we'll ask for the expiry date.",
    documentTypes: ["BARANGAY_CLEARANCE"],
    allowFiles: true,
  },
];

export const MERCHANT_GROUPS: RequirementGroup[] = [
  {
    key: "owner-id",
    title: "Owner / Representative ID",
    description: "A valid government ID of the person running the business.",
    documentTypes: ["OWNER_VALID_ID"],
    allowFiles: true,
    governmentId: true,
    capture: "ID_CARD",
  },
  {
    key: "dti",
    title: "DTI Business Name Certificate",
    description: "Your DTI registration certificate.",
    documentTypes: ["DTI_CERTIFICATE"],
    allowFiles: true,
  },
  {
    key: "bir",
    title: "BIR Certificate of Registration",
    description: "Form 2303.",
    documentTypes: ["BIR_2303"],
    allowFiles: true,
  },
  {
    key: "business-photos",
    title: "Business Photos",
    description: "Three photos confirming this is an operating laundromat.",
    documentTypes: [
      "BUSINESS_PHOTO_STOREFRONT",
      "BUSINESS_PHOTO_INTERIOR",
      "BUSINESS_PHOTO_MACHINES",
    ],
  },
];

// ─── Derived view model ────────────────────────────────────────────────────

export interface DocumentSlot {
  documentType: KycDocumentType;
  label: string;
  hint?: string;
  status: UiStatus;
  detail: KycDocumentTypeStatus;
}

export interface RequirementGroupView {
  group: RequirementGroup;
  slots: DocumentSlot[];
  /** Worst status across the group's slots — what the collapsed row shows. */
  status: UiStatus;
  /** The reviewer's reason for the first rejected slot, if any. */
  rejectionReason: string | null;
  required: boolean;
}

/**
 * Turns myKycStatus into the grouped cards the screens render.
 *
 * Document types the backend didn't return are skipped rather than rendered
 * empty: that happens when the app is newer than the backend it's talking to,
 * and showing a requirement the server won't accept is worse than omitting it.
 *
 * `idType` is the ID the partner has picked — which may be a local draft the
 * server hasn't seen yet, so it is passed in rather than read off `status`. On
 * a single-sided ID the back-of-ID slot is dropped from its group: leaving a
 * slot on screen that nothing can ever fill is the bug this argument exists to
 * prevent.
 *
 * The drop is withheld in one case: a two-sided ID is already ON FILE and the
 * pick has since changed to a single-sided one. The server derives the required
 * set from the submitted front, not from this draft, so it still wants the back
 * — and hiding a slot the server is still counting would replace a visible
 * requirement with an invisible one, which is strictly worse than the bug
 * above. The slot disappears on its own once the new front is uploaded.
 */
export function buildGroupViews(
  groups: readonly RequirementGroup[],
  status: MyKycStatus,
  now: Date = new Date(),
  idType: GovernmentIdType | null = null,
): RequirementGroupView[] {
  const byType = new Map(status.documents.map((d) => [d.documentType, d]));
  const hideBackOfId =
    isSingleSidedId(idType) &&
    (status.governmentIdType === null ||
      isSingleSidedId(status.governmentIdType));

  return groups
    .map((group) => {
      const slots = group.documentTypes
        .map((documentType): DocumentSlot | null => {
          if (
            hideBackOfId &&
            group.governmentId &&
            documentType === "VALID_ID_BACK"
          ) {
            return null;
          }
          const detail = byType.get(documentType);
          if (!detail) return null;
          return {
            documentType,
            label: DOCUMENT_LABELS[documentType],
            hint: DOCUMENT_HINTS[documentType],
            status: deriveDocumentStatus(detail, now),
            detail,
          };
        })
        .filter((s): s is DocumentSlot => s !== null);

      if (slots.length === 0) return null;

      const rejected = slots.find(
        (s) => s.status === "ACTION_REQUIRED" && s.detail.rejectionReason,
      );

      return {
        group,
        slots,
        status: deriveGroupStatus(slots.map((s) => s.status)),
        rejectionReason: rejected?.detail.rejectionReason ?? null,
        required: slots.some((s) => s.detail.required),
      };
    })
    .filter((v): v is RequirementGroupView => v !== null);
}

/**
 * Documents the backend still lists but no longer requires (BUSINESS_PERMIT
 * today). Shown under a separate heading so they don't imply outstanding work.
 */
export function buildRetiredSlots(
  groups: readonly RequirementGroup[],
  status: MyKycStatus,
  now: Date = new Date(),
): DocumentSlot[] {
  const grouped = new Set(groups.flatMap((g) => g.documentTypes));
  return status.documents
    .filter((d) => !grouped.has(d.documentType) && d.status !== null)
    .map((detail) => ({
      documentType: detail.documentType,
      label: DOCUMENT_LABELS[detail.documentType],
      hint: DOCUMENT_HINTS[detail.documentType],
      status: deriveDocumentStatus(detail, now),
      detail,
    }));
}

/**
 * Flattens grouped cards plus any profile-backed rows into the leaf rows the
 * progress math needs. Leaves, not groups — otherwise uploading one of three
 * business photos wouldn't move the bar.
 */
export function toProgressRows(
  views: readonly RequirementGroupView[],
  profileRows: readonly { key: string; status: UiStatus }[] = [],
): VerificationRow[] {
  const documentRows = views.flatMap((view) =>
    view.slots.map((slot) => ({
      key: slot.documentType,
      status: slot.status,
      required: slot.detail.required,
    })),
  );
  return [
    ...profileRows.map((r) => ({ ...r, required: true })),
    ...documentRows,
  ];
}
