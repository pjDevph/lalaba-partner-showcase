// src/services/graphql/kyc.ts
// GraphQL operations for partner verification (the backend module is named
// "kyc"; nothing user-facing ever says that word — see the screens under
// src/screens/verification and src/screens/settings/VerificationScreen).

import { graphqlRequest } from "../../config/graphql";
import type {
  LivenessChallenge,
  LivenessMetadata,
} from "../../features/liveness/machine";

// ─── Enum mirrors ──────────────────────────────────────────────────────────
// Hand-maintained: this app has no GraphQL codegen. Keep in sync with
// LALABA_BE_DEV/src/kyc/schemas/kyc-document.schema.ts.

export type KycProviderType = "MERCHANT_BRANCH" | "WASHER";

export type KycDocumentStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export type KycExpiryPolicy = "NONE" | "OPTIONAL" | "REQUIRED";

/**
 * Which government-issued ID a partner claims to have uploaded. Recorded so a
 * reviewer compares the photo against a declared type, and so single-sided IDs
 * skip the back-of-ID slot.
 */
export type GovernmentIdType =
  | "PHILSYS_NATIONAL_ID"
  | "DRIVERS_LICENSE"
  | "PASSPORT"
  | "UMID"
  | "SSS_ID"
  | "PHILHEALTH_ID"
  | "POSTAL_ID"
  | "VOTERS_ID"
  | "PRC_ID"
  | "TIN_ID"
  | "OTHER";

export type KycDocumentType =
  // Merchant branch
  | "BUSINESS_PERMIT"
  | "OWNER_VALID_ID"
  | "DTI_CERTIFICATE"
  | "BIR_2303"
  | "BUSINESS_PHOTO_STOREFRONT"
  | "BUSINESS_PHOTO_INTERIOR"
  | "BUSINESS_PHOTO_MACHINES"
  // Washer
  | "VALID_ID"
  | "VALID_ID_BACK"
  | "BARANGAY_CLEARANCE"
  | "PROOF_OF_ADDRESS"
  | "SELFIE";

// ─── Types ─────────────────────────────────────────────────────────────────

export type KycDocumentTypeStatus = {
  documentType: KycDocumentType;
  required: boolean;
  expiryPolicy: KycExpiryPolicy;
  status: KycDocumentStatus | null;
  documentId: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  expiresAt: Date | null;
  rejectionReason: string | null;
};

export type MyKycStatus = {
  providerId: string;
  providerType: KycProviderType;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  verifiedAt: Date | null;
  providerRejectionReason: string | null;
  /**
   * The ID claimed on the latest front-of-ID upload, or null before one exists.
   * The `required` flags below were computed from it — a PASSPORT here is why
   * VALID_ID_BACK can come back not-required.
   */
  governmentIdType: GovernmentIdType | null;
  documents: KycDocumentTypeStatus[];
};

// ─── Field fragments ───────────────────────────────────────────────────────

const KYC_STATUS_FIELDS = `
  providerId
  providerType
  verificationStatus
  verifiedAt
  providerRejectionReason
  governmentIdType
  documents {
    documentType
    required
    expiryPolicy
    status
    documentId
    submittedAt
    reviewedAt
    expiresAt
    rejectionReason
  }
`;

// ─── Mappers ───────────────────────────────────────────────────────────────

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

/**
 * Exported because the Settings cache (src/stores/kycStatusStore.ts) persists
 * the untouched server payload — Dates don't survive a JSON round-trip through
 * AsyncStorage, so the mapping happens on read instead of before the write.
 */
/**
 * The wire shape. Identical to MyKycStatus except every Date arrives as an ISO
 * string (or null) — that difference is exactly what this mapper exists to
 * resolve, so it is the one thing the type has to restate.
 */
export type RawKycDocument = Omit<
  KycDocumentTypeStatus,
  "submittedAt" | "reviewedAt" | "expiresAt"
> & {
  submittedAt?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
};

export type RawKycStatus = Omit<MyKycStatus, "verifiedAt" | "documents"> & {
  verifiedAt?: string | null;
  documents?: RawKycDocument[] | null;
};

export function mapKycStatus(raw: RawKycStatus): MyKycStatus {
  return {
    providerId: raw.providerId,
    providerType: raw.providerType,
    verificationStatus: raw.verificationStatus,
    verifiedAt: toDate(raw.verifiedAt),
    providerRejectionReason: raw.providerRejectionReason ?? null,
    governmentIdType: raw.governmentIdType ?? null,
    documents: (raw.documents ?? []).map(
      (d: RawKycDocument): KycDocumentTypeStatus => ({
        documentType: d.documentType,
        required: d.required,
        expiryPolicy: d.expiryPolicy,
        status: d.status ?? null,
        documentId: d.documentId ?? null,
        submittedAt: toDate(d.submittedAt),
        reviewedAt: toDate(d.reviewedAt),
        expiresAt: toDate(d.expiresAt),
        rejectionReason: d.rejectionReason ?? null,
      }),
    ),
  };
}

// ─── Operations ────────────────────────────────────────────────────────────

/**
 * Per-document-type verification state for a provider the caller owns.
 * providerId is REQUIRED for MERCHANT_BRANCH (a merchant may own several
 * branches) and derived server-side for WASHER.
 */
export async function gqlMyKycStatus(
  providerType: KycProviderType,
  providerId?: string,
): Promise<MyKycStatus> {
  return mapKycStatus(await gqlMyKycStatusRaw(providerType, providerId));
}

/**
 * Same query, but returns the payload exactly as the server sent it — plain
 * JSON, safe to persist. Callers that want Dates run it through
 * {@link mapKycStatus}.
 */
export async function gqlMyKycStatusRaw(
  providerType: KycProviderType,
  providerId?: string,
): Promise<any> {
  const res = await graphqlRequest<{ myKycStatus: RawKycStatus }>(
    `
    query MyKycStatus($providerType: KycProviderType!, $providerId: ID) {
      myKycStatus(providerType: $providerType, providerId: $providerId) {
        ${KYC_STATUS_FIELDS}
      }
    }
  `,
    // Omit rather than send null: for WASHER the BE derives the provider from
    // the caller, and an absent variable says that more plainly than an
    // explicit null. Both are accepted (@IsOptional skips either).
    providerId === undefined ? { providerType } : { providerType, providerId },
  );
  return res.myKycStatus;
}

export type SubmitKycDocumentArgs = {
  providerType: KycProviderType;
  providerId?: string;
  documentType: KycDocumentType;
  base64: string;
  mimeType: string;
  /** Required when the type's expiryPolicy is REQUIRED; must be in the future. */
  expiresAt?: Date | null;
  /**
   * Which government ID this is. REQUIRED for the front-of-ID types (VALID_ID,
   * OWNER_VALID_ID) — the BE rejects those without one — and dropped on every
   * other type. The back of the ID inherits its meaning from the front and
   * carries no claim of its own.
   */
  governmentIdType?: GovernmentIdType;
  /**
   * The on-device liveness check's verdict, for SELFIE only — the BE ignores it
   * on every other type. Optional because a selfie can still arrive without one
   * (an older client), and because it is context for the reviewer rather than
   * something the server can verify. See src/features/liveness/machine.ts.
   */
  livenessChallenge?: LivenessChallenge;
  livenessMetadata?: LivenessMetadata;
};

/**
 * Upload (or replace) one verification document.
 *
 * Evidence goes through THIS mutation, never uploadMedia — that path writes to
 * the public branding bucket. Here the storage key is derived server-side and
 * the object is private; reads go through gqlKycDocumentUrl.
 */
export async function gqlSubmitKycDocument(
  args: SubmitKycDocumentArgs,
): Promise<{ _id: string; status: KycDocumentStatus; submittedAt: Date }> {
  const res = await graphqlRequest<{
    submitKycDocument: { _id: string; status: KycDocumentStatus; submittedAt: string };
  }>(
    `
    mutation SubmitKycDocument($input: SubmitKycDocumentInput!) {
      submitKycDocument(input: $input) {
        _id
        status
        submittedAt
      }
    }
  `,
    {
      // Only the keys that carry a value: providerId is derived from the caller
      // for WASHER, and expiresAt is ignored by the BE for document types whose
      // expiry policy is NONE. Sending explicit nulls is accepted too, but a
      // minimal input keeps the wire payload honest about what was supplied.
      input: {
        providerType: args.providerType,
        ...(args.providerId !== undefined && { providerId: args.providerId }),
        documentType: args.documentType,
        base64: args.base64,
        mimeType: args.mimeType,
        ...(args.expiresAt && { expiresAt: args.expiresAt.toISOString() }),
        ...(args.governmentIdType && {
          governmentIdType: args.governmentIdType,
        }),
        ...(args.livenessChallenge && {
          livenessChallenge: args.livenessChallenge,
        }),
        ...(args.livenessMetadata && {
          livenessMetadata: args.livenessMetadata,
        }),
      },
    },
  );
  return {
    _id: res.submitKycDocument._id,
    status: res.submitKycDocument.status,
    submittedAt: new Date(res.submitKycDocument.submittedAt),
  };
}

/**
 * Short-lived (300s) signed read URL for a document the caller owns.
 *
 * Never cache this: it expires in five minutes and a stale URL renders as a
 * broken preview. Fetch it when a preview opens, drop it when it closes.
 */
export async function gqlKycDocumentUrl(documentId: string): Promise<string> {
  const res = await graphqlRequest<{ kycDocumentUrl: string }>(
    `
    query KycDocumentUrl($documentId: ID!) {
      kycDocumentUrl(documentId: $documentId)
    }
  `,
    { documentId },
  );
  return res.kycDocumentUrl;
}

/**
 * Legacy required-document sets, kept because `src/screens/kyc/KycSection.tsx`
 * (the washer KYC surface) still reads them.
 *
 * NOT authoritative: `src/features/verification/requirements.ts` is, and it
 * reflects the current BE contract — DTI_CERTIFICATE replaced BUSINESS_PERMIT,
 * which the BE now marks "legacy: still accepted, no longer required". Prefer
 * that module for anything new; this exists so the two verification surfaces
 * can coexist until one is retired.
 */
export const REQUIRED_KYC_DOCS: Record<KycProviderType, KycDocumentType[]> = {
  MERCHANT_BRANCH: ["BUSINESS_PERMIT", "OWNER_VALID_ID"],
  WASHER: ["VALID_ID", "BARANGAY_CLEARANCE", "SELFIE"],
};
