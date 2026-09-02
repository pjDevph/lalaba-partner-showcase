// src/services/graphql/biometrics.ts
// GraphQL operations for device-bound biometric login.
//
//   • enrollBiometric / myBiometricCredentials / revokeBiometric — authenticated
//     (the user is signed in when managing their own devices).
//   • requestBiometricChallenge / biometricLogin — PUBLIC (pre-login); identity
//     is proven by the signature over the challenge, so no auth header is sent.

import { graphqlRequest } from "../../config/graphql";

export interface BiometricCredentialDTO {
  _id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  lastUsedAt: string | null;
  disabled: boolean;
  createdAt: string | null;
}

export interface EnrollBiometricInput {
  deviceId: string;
  deviceName: string;
  platform: "ios" | "android";
  publicKey: string;
}

// ── Enrolment / management (authenticated) ───────────────────────────────────

export async function enrollBiometric(
  input: EnrollBiometricInput
): Promise<BiometricCredentialDTO> {
  const query = `
    mutation EnrollBiometric($input: EnrollBiometricInput!) {
      enrollBiometric(input: $input) {
        _id deviceId deviceName platform lastUsedAt disabled createdAt
      }
    }`;
  const data = await graphqlRequest<{ enrollBiometric: BiometricCredentialDTO }>(
    query,
    { input }
  );
  return data.enrollBiometric;
}

export async function listBiometricCredentials(): Promise<BiometricCredentialDTO[]> {
  const query = `
    query MyBiometricCredentials {
      myBiometricCredentials {
        _id deviceId deviceName platform lastUsedAt disabled createdAt
      }
    }`;
  const data = await graphqlRequest<{
    myBiometricCredentials: BiometricCredentialDTO[];
  }>(query, {});
  return data.myBiometricCredentials;
}

export async function revokeBiometric(credentialId: string): Promise<boolean> {
  const query = `
    mutation RevokeBiometric($credentialId: ID!) {
      revokeBiometric(credentialId: $credentialId)
    }`;
  const data = await graphqlRequest<{ revokeBiometric: boolean }>(
    query,
    { credentialId }
  );
  return data.revokeBiometric;
}

// ── Login (public / pre-session) ─────────────────────────────────────────────

export interface BiometricChallengeDTO {
  challengeId: string;
  challenge: string;
  expiresInSeconds: number;
}

export async function requestBiometricChallenge(
  credentialId: string
): Promise<BiometricChallengeDTO> {
  const query = `
    mutation RequestBiometricChallenge($input: BiometricChallengeInput!) {
      requestBiometricChallenge(input: $input) {
        challengeId challenge expiresInSeconds
      }
    }`;
  const data = await graphqlRequest<{
    requestBiometricChallenge: BiometricChallengeDTO;
  }>(query, { input: { credentialId } }, { anonymous: true });
  return data.requestBiometricChallenge;
}

export async function biometricLogin(input: {
  credentialId: string;
  challengeId: string;
  signature: string;
}): Promise<string> {
  const query = `
    mutation BiometricLogin($input: BiometricLoginInput!) {
      biometricLogin(input: $input) {
        customToken
      }
    }`;
  const data = await graphqlRequest<{ biometricLogin: { customToken: string } }>(
    query,
    { input },
    { anonymous: true }
  );
  return data.biometricLogin.customToken;
}
