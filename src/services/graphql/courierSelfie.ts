// src/services/graphql/courierSelfie.ts
// The courier liveness selfie: the gate a rider must pass before any order
// handling, and the source of their profile picture.
//
// Unlike the partner verification flow in ./kyc.ts, this photo is PUBLIC by
// design and goes live the moment it is accepted — there is no approve step.
// Admins review after the fact and the only verdict is revoke.

import { graphqlRequest } from "../../config/graphql";
import type {
  LivenessChallenge,
  LivenessMetadata,
} from "../../features/liveness/machine";

// ─── Enum mirrors ──────────────────────────────────────────────────────────
// Hand-maintained: this app has no GraphQL codegen. Keep in sync with
// LALABA_BE_DEV/src/courier-verification/schemas/courier-selfie.schema.ts.

export type CourierSelfieStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

// Declared with the state machine that produces them (and shared with the
// washer's KYC selfie), re-exported here so callers of this module keep
// importing the whole courier vocabulary from one place.
export type { LivenessChallenge, LivenessMetadata };

// ─── Types ─────────────────────────────────────────────────────────────────

export type CourierSelfie = {
  _id: string;
  publicUrl: string;
  status: CourierSelfieStatus;
  livenessChallenge: LivenessChallenge;
  submittedAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
};

const SELFIE_FIELDS = `
  _id publicUrl status livenessChallenge submittedAt revokedAt revocationReason
`;

// ─── Operations ────────────────────────────────────────────────────────────

/**
 * Current selfie for the signed-in courier, or null if they have never taken
 * one. Anything other than status ACTIVE means order handling is locked.
 */
export async function gqlMyCourierSelfie(): Promise<CourierSelfie | null> {
  const data = await graphqlRequest<{ myCourierSelfie: CourierSelfie | null }>(
    `query MyCourierSelfie { myCourierSelfie { ${SELFIE_FIELDS} } }`,
  );
  return data.myCourierSelfie ?? null;
}

/**
 * Submit a passing liveness capture. On success the courier is unlocked
 * immediately and the photo becomes their profile picture.
 *
 * `base64` must be a JPEG re-encoded through expo-image-manipulator, never the
 * raw camera output — the re-encode is what strips EXIF (a raw selfie carries
 * GPS, and this image is public) and keeps the payload inside the request
 * timeout. The backend rejects anything that is not JPEG.
 */
export async function gqlSubmitCourierSelfie(input: {
  base64: string;
  mimeType: string;
  livenessChallenge: LivenessChallenge;
  livenessMetadata: LivenessMetadata;
}): Promise<CourierSelfie> {
  const data = await graphqlRequest<{ submitCourierSelfie: CourierSelfie }>(
    `mutation SubmitCourierSelfie($input: SubmitCourierSelfieInput!) {
       submitCourierSelfie(input: $input) { ${SELFIE_FIELDS} }
     }`,
    { input },
  );
  return data.submitCourierSelfie;
}

/** True when this selfie state permits order handling. */
export function selfieUnlocksOrders(
  selfie: CourierSelfie | null,
): selfie is CourierSelfie {
  return selfie?.status === "ACTIVE";
}
