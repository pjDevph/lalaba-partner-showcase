/**
 * APPCHK-016X — the one piece of the bridge that is testable off-device.
 *
 * Everything else (X1, X4-X11) needs a real signed build and the Firebase
 * console, and is deliberately NOT faked here. What IS testable is the expiry
 * the CustomProvider hands to the JS SDK, because the native module does not
 * expose one and we recover it from the token's own `exp` claim.
 *
 * Getting this wrong is quiet and bad: too-long means Auth requests go out with
 * an expired App Check token once enforcement is on; too-short only costs an
 * extra fetch. The fallback therefore errs short.
 */

// The decoder is module-private, so exercise it through the exported accessor.
const mockGetToken = jest.fn();

jest.mock("@react-native-firebase/app-check", () => {
  const provider = { configure: jest.fn() };
  const appCheck = () => ({
    newReactNativeFirebaseAppCheckProvider: () => provider,
  });
  return {
    __esModule: true,
    default: appCheck,
    firebase: {
      appCheck: () => ({
        initializeAppCheck: jest.fn(),
        getToken: mockGetToken,
      }),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require("../appCheck") as typeof import("../appCheck");

/** Minimal unsigned JWT with the given payload — the shape App Check uses. */
const jwtWith = (payload: Record<string, unknown>): string => {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(payload)}.sig`;
};

beforeAll(() => {
  mod.initAppCheck(); // flips the module's `initialized` guard
});

beforeEach(() => mockGetToken.mockReset());

describe("expiry recovered from the token's exp claim", () => {
  it("HP: exp seconds are converted to milliseconds", async () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 3600;
    mockGetToken.mockResolvedValue({ token: jwtWith({ exp: expSeconds }) });

    const result = await mod.getNativeAppCheckToken();

    // The classic bug this pins: `exp` is in SECONDS, everything else here is
    // milliseconds. Off by 1000 means the SDK thinks the token expired in 1970.
    expect(result?.expireTimeMillis).toBe(expSeconds * 1000);
  });

  it("HP: the token string is passed through untouched", async () => {
    const token = jwtWith({ exp: Math.floor(Date.now() / 1000) + 600 });
    mockGetToken.mockResolvedValue({ token });

    expect((await mod.getNativeAppCheckToken())?.token).toBe(token);
  });

  it("HP: a real-looking App Check payload decodes", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    mockGetToken.mockResolvedValue({
      token: jwtWith({
        sub: "1:123456789:android:abcdef",
        aud: ["projects/12345", "projects/lalaba"],
        exp,
        iat: Math.floor(Date.now() / 1000),
      }),
    });

    expect((await mod.getNativeAppCheckToken())?.expireTimeMillis).toBe(
      exp * 1000,
    );
  });
});

describe("fallback errs SHORT, never long", () => {
  const shortEnough = (ms: number) => {
    // Must be in the future, and well under a plausible real token lifetime.
    expect(ms).toBeGreaterThan(Date.now());
    expect(ms).toBeLessThanOrEqual(Date.now() + 6 * 60 * 1000);
  };

  it("EC: a token with no exp claim", async () => {
    mockGetToken.mockResolvedValue({ token: jwtWith({ sub: "x" }) });
    shortEnough((await mod.getNativeAppCheckToken())!.expireTimeMillis);
  });

  it("EC: a non-numeric exp claim", async () => {
    mockGetToken.mockResolvedValue({ token: jwtWith({ exp: "soon" }) });
    shortEnough((await mod.getNativeAppCheckToken())!.expireTimeMillis);
  });

  it("EC: a token that is not a JWT at all", async () => {
    mockGetToken.mockResolvedValue({ token: "not-a-jwt" });
    shortEnough((await mod.getNativeAppCheckToken())!.expireTimeMillis);
  });

  it("EC: an undecodable payload segment", async () => {
    mockGetToken.mockResolvedValue({ token: "aaa.!!!!not-base64!!!!.sig" });
    shortEnough((await mod.getNativeAppCheckToken())!.expireTimeMillis);
  });
});

describe("no token, no bridge", () => {
  it("EC: an empty token yields null rather than a bogus expiry", async () => {
    mockGetToken.mockResolvedValue({ token: "" });
    expect(await mod.getNativeAppCheckToken()).toBeNull();
  });

  it("EC: a native failure yields null, it does not throw", async () => {
    mockGetToken.mockRejectedValue(new Error("Play Integrity unavailable"));
    await expect(mod.getNativeAppCheckToken()).resolves.toBeNull();
  });
});

describe("the spike is inert unless explicitly enabled", () => {
  it("EC: APPCHK_016X_ENABLED is false without the env flag", () => {
    // Guards the whole point of the opt-in: experimental code must not reach a
    // normal build of either app by accident.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bridge = require("../appCheckBridge") as typeof import("../appCheckBridge");
    expect(bridge.APPCHK_016X_ENABLED).toBe(false);
  });
});
