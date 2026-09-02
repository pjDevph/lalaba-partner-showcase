// src/services/graphql/__tests__/kyc.test.ts
// KYC service layer: exact operation/input shapes per the Phase 2 contract.

jest.mock("../../../config/graphql", () => ({
  graphqlRequest: jest.fn(),
}));

import { graphqlRequest } from "../../../config/graphql";
import {
  gqlMyKycStatus,
  gqlSubmitKycDocument,
  gqlKycDocumentUrl,
  REQUIRED_KYC_DOCS,
} from "../kyc";

const mockRequest = graphqlRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("REQUIRED_KYC_DOCS", () => {
  it("mirrors the BE required sets", () => {
    expect(REQUIRED_KYC_DOCS.MERCHANT_BRANCH).toEqual(["BUSINESS_PERMIT", "OWNER_VALID_ID"]);
    expect(REQUIRED_KYC_DOCS.WASHER).toEqual(["VALID_ID", "BARANGAY_CLEARANCE", "SELFIE"]);
  });
});

describe("gqlMyKycStatus", () => {
  it("passes providerId for MERCHANT_BRANCH", async () => {
    mockRequest.mockResolvedValueOnce({ myKycStatus: { providerId: "b1", providerType: "MERCHANT_BRANCH", verificationStatus: "PENDING", documents: [] } });
    await gqlMyKycStatus("MERCHANT_BRANCH", "b1");
    expect(mockRequest.mock.calls[0][1]).toEqual({ providerType: "MERCHANT_BRANCH", providerId: "b1" });
  });

  it("omits providerId for WASHER (derived from the caller)", async () => {
    mockRequest.mockResolvedValueOnce({ myKycStatus: { providerId: "w1", providerType: "WASHER", verificationStatus: "PENDING", documents: [] } });
    await gqlMyKycStatus("WASHER");
    expect(mockRequest.mock.calls[0][1]).toEqual({ providerType: "WASHER" });
  });
});

describe("gqlSubmitKycDocument", () => {
  it("sends the exact SubmitKycDocumentInput shape", async () => {
    mockRequest.mockResolvedValueOnce({ submitKycDocument: { _id: "d1", documentType: "SELFIE", status: "SUBMITTED", submittedAt: null, rejectionReason: null } });
    await gqlSubmitKycDocument({
      providerType: "WASHER",
      documentType: "SELFIE",
      base64: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
    const [query, variables] = mockRequest.mock.calls[0];
    expect(query).toContain("submitKycDocument(input: $input)");
    expect(variables.input).toEqual({
      providerType: "WASHER",
      documentType: "SELFIE",
      base64: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
  });

  it("carries the liveness verdict when the selfie came from the guided capture", async () => {
    mockRequest.mockResolvedValueOnce({ submitKycDocument: { _id: "d1", status: "SUBMITTED", submittedAt: null } });
    const livenessMetadata = {
      durationMs: 4200,
      eyesOpenScore: 0.94,
      yawDegrees: 1.5,
      pitchDegrees: -2,
      attemptCount: 1,
    };
    await gqlSubmitKycDocument({
      providerType: "WASHER",
      documentType: "SELFIE",
      base64: "aGVsbG8=",
      mimeType: "image/jpeg",
      livenessChallenge: "BLINK",
      livenessMetadata,
    });
    expect(mockRequest.mock.calls[0][1].input).toEqual({
      providerType: "WASHER",
      documentType: "SELFIE",
      base64: "aGVsbG8=",
      mimeType: "image/jpeg",
      livenessChallenge: "BLINK",
      livenessMetadata,
    });
  });
});

describe("gqlKycDocumentUrl", () => {
  it("returns the signed url", async () => {
    mockRequest.mockResolvedValueOnce({ kycDocumentUrl: "https://signed.example/doc" });
    await expect(gqlKycDocumentUrl("d1")).resolves.toBe("https://signed.example/doc");
    expect(mockRequest.mock.calls[0][1]).toEqual({ documentId: "d1" });
  });
});
