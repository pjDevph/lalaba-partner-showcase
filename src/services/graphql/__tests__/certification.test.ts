// src/services/graphql/__tests__/certification.test.ts
// Certification service layer after the breaking BE contract change:
// submitCertificationProof takes bytes (`proofs: [CertificationProofInput!]`),
// the legacy `proofUrls` argument throws server-side, and reads go through the
// guarded `certificationProofUrls` query instead of WasherProfile.certProofUrls.

jest.mock("../../../config/graphql", () => ({
  graphqlRequest: jest.fn(),
}));

import { graphqlRequest } from "../../../config/graphql";
import { gqlSubmitCertProof, gqlCertificationProofUrls } from "../washer";

const mockRequest = graphqlRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("gqlSubmitCertProof", () => {
  it("sends base64 + mimeType under `proofs`, never `proofUrls`", async () => {
    mockRequest.mockResolvedValueOnce({ submitCertificationProof: true });

    await gqlSubmitCertProof([
      { base64: "AAAA", mimeType: "application/pdf" },
      { base64: "BBBB", mimeType: "image/jpeg" },
    ]);

    const [query, variables] = mockRequest.mock.calls[0];
    expect(query).toContain("$proofs: [CertificationProofInput!]");
    expect(query).not.toContain("proofUrls");
    expect(variables).toEqual({
      proofs: [
        { base64: "AAAA", mimeType: "application/pdf" },
        { base64: "BBBB", mimeType: "image/jpeg" },
      ],
    });
  });
});

describe("gqlCertificationProofUrls", () => {
  it("omits washerUid so the server defaults to the caller", async () => {
    mockRequest.mockResolvedValueOnce({ certificationProofUrls: ["https://signed/1"] });

    const urls = await gqlCertificationProofUrls();

    expect(mockRequest.mock.calls[0][1]).toEqual({});
    expect(urls).toEqual(["https://signed/1"]);
  });

  it("passes washerUid when an admin/support caller supplies one", async () => {
    mockRequest.mockResolvedValueOnce({ certificationProofUrls: [] });

    await gqlCertificationProofUrls("washer-uid-9");

    expect(mockRequest.mock.calls[0][1]).toEqual({ washerUid: "washer-uid-9" });
  });

  it("returns an empty list when the query yields null", async () => {
    mockRequest.mockResolvedValueOnce({ certificationProofUrls: null });
    await expect(gqlCertificationProofUrls()).resolves.toEqual([]);
  });
});
