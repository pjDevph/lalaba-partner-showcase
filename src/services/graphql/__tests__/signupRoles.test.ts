// src/services/graphql/__tests__/signupRoles.test.ts
//
// Contract guard for the sign-up role lookup. The backend made `listRoles` /
// `getRole` admin-only (they were unguarded — anonymous callers could dump the
// whole role catalogue) and introduced the minimal public `signupRoles` query.
//
// These assertions are deliberately literal about the operation name and the
// selection set: if someone renames the query or adds a field, registration
// breaks at runtime against the live schema, and this suite fails first.

jest.mock("../../../config/graphql", () => ({
  graphqlRequest: jest.fn(),
  ApiErrorBlocker: class ApiErrorBlocker extends Error {},
}));

import { graphqlRequest } from "../../../config/graphql";
import { signupRoles } from "../auth";

const mockRequest = graphqlRequest as jest.Mock;

/** Shape returned by the live backend (verified anonymously against /graphql). */
const LIVE_SIGNUP_ROLES = [
  { _id: "6a11bcb8ffd7d2160b1e53bd", roleId: "customer", roleName: "customer" },
  { _id: "6a11bcb8ffd7d2160b1e53b9", roleId: "merchant", roleName: "merchant" },
  { _id: "6a11bcb8ffd7d2160b1e53ba", roleId: "washer", roleName: "washer" },
];

beforeEach(() => jest.clearAllMocks());

/** Collapse whitespace so assertions do not depend on template-literal layout. */
const flatten = (query: string) => query.replace(/\s+/g, " ").trim();

describe("signupRoles", () => {
  it("queries `signupRoles`, never the now-admin-only `listRoles`/`getRole`", async () => {
    mockRequest.mockResolvedValueOnce({ signupRoles: LIVE_SIGNUP_ROLES });

    await signupRoles();

    const query = flatten(mockRequest.mock.calls[0][0]);
    expect(query).toContain("signupRoles");
    expect(query).not.toContain("listRoles");
    expect(query).not.toContain("getRole");
  });

  it("selects exactly `_id roleId roleName` — SignupRole has no `description`", async () => {
    mockRequest.mockResolvedValueOnce({ signupRoles: LIVE_SIGNUP_ROLES });

    await signupRoles();

    // Exact operation + selection set. `description` does not exist on
    // SignupRole, so requesting it is a server-side validation error.
    expect(flatten(mockRequest.mock.calls[0][0])).toBe(
      "query SignupRoles { signupRoles { _id roleId roleName } }"
    );
    expect(flatten(mockRequest.mock.calls[0][0])).not.toContain("description");
  });

  it("sends no variables and stays anonymous — there is no token yet at sign-up", async () => {
    mockRequest.mockResolvedValueOnce({ signupRoles: LIVE_SIGNUP_ROLES });

    await signupRoles();

    const [, variables, options] = mockRequest.mock.calls[0];
    expect(variables).toEqual({});
    expect(options).toEqual({ anonymous: true });
  });

  it("returns the roles unwrapped so the merchant/washer _id lookups keep working", async () => {
    mockRequest.mockResolvedValueOnce({ signupRoles: LIVE_SIGNUP_ROLES });

    const roles = await signupRoles();

    expect(roles).toEqual(LIVE_SIGNUP_ROLES);
    // The exact lookups app/register.tsx and app/complete-profile.tsx perform.
    expect(roles.find((r) => r.roleId === "merchant")?._id).toBe(
      "6a11bcb8ffd7d2160b1e53b9"
    );
    // RoleStep's merchant||washer filter still has both cards to render.
    expect(
      roles.filter((r) => r.roleId === "merchant" || r.roleId === "washer")
    ).toHaveLength(2);
  });
});
