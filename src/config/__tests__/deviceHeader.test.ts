/**
 * The staff device header goes out on EVERY authenticated request.
 *
 * It used to be opt-in: `graphqlRequest(query, vars, { withDeviceToken: true })`.
 * A staff-reachable query that forgot the flag was rejected by the backend's
 * GqlAuthGuard with "Please log in from a registered device." — a message that
 * blames the device for a missing header, so the failure looked like a device
 * problem rather than a client bug. incomingOnlineOrders and myStaff both
 * forgot it, which is why staff saw no online orders at all.
 *
 * Asserting it once here is the point: this is a property of the client, not of
 * each of the ~160 call sites, and the per-call-site tests that used to assert
 * the flag were pinning the opt-in rather than testing the behaviour.
 */

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("../../utils/devLog", () => ({ devLog: jest.fn() }));
jest.mock("../appCheck", () => ({ getAppCheckToken: jest.fn().mockResolvedValue(null) }));
jest.mock("../../utils/deviceId", () => ({
  getDeviceId: jest.fn().mockResolvedValue("device-uuid-abc"),
}));
jest.mock("../firebase", () => ({
  auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue("id-token") } },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { graphqlRequest } = require("../graphql") as typeof import("../graphql");

const headersOf = (call: unknown[]): Record<string, string> =>
  (call[1] as { headers: Record<string, string> }).headers;

describe("graphqlRequest device header", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:3001";
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it("attaches x-device-token with no options argument at all", async () => {
    await graphqlRequest("query Whatever { ok }");

    expect(headersOf(fetchMock.mock.calls[0])["x-device-token"]).toBe("device-uuid-abc");
  });

  it("attaches it alongside the Authorization header", async () => {
    await graphqlRequest("query Whatever { ok }", {});

    const headers = headersOf(fetchMock.mock.calls[0]);
    expect(headers.Authorization).toBe("Bearer id-token");
    expect(headers["x-device-token"]).toBe("device-uuid-abc");
  });

  it("still attaches it on an anonymous request, which carries no bearer token", async () => {
    // The device identifies the handset, not the person — an anonymous call
    // has no session to speak for, but the handset is the same one.
    await graphqlRequest("query Public { ok }", {}, { anonymous: true });

    const headers = headersOf(fetchMock.mock.calls[0]);
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-device-token"]).toBe("device-uuid-abc");
  });
});
