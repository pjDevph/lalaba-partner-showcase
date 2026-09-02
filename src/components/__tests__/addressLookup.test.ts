// src/components/__tests__/addressLookup.test.ts
//
// The address picker talks to Nominatim, a third-party service on the public
// internet. Every one of these failures used to collapse into an empty result
// list, so a partner whose DNS was down saw "no matches for my street" and had
// no way to tell the lookup never ran. These tests pin the distinction.

import {
  searchAddress,
  reverseGeocode,
  formatCoords,
  LOOKUP_FAILURE_TEXT,
} from "../AddressPicker";

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const HIT = {
  place_id: "1",
  display_name: "Katipunan Avenue, Quezon City, Philippines",
  lat: "14.6",
  lon: "121.07",
  address: { road: "Katipunan Avenue", city: "Quezon City" },
};

describe("searchAddress", () => {
  afterEach(() => jest.restoreAllMocks());

  it("HP: returns results and no failure on a 200", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(okJson([HIT]) as never);

    const { results, failure } = await searchAddress("katipunan");

    expect(failure).toBeNull();
    expect(results).toHaveLength(1);
  });

  it("HP: short queries never hit the network", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    const { results, failure } = await searchAddress("ka");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    expect(failure).toBeNull();
  });

  it("HP: sends the explicit User-Agent — Nominatim 403s generic browser agents", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(okJson([HIT]) as never);

    await searchAddress("katipunan");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^LalabaPartnerApp\//);
  });

  // The whole point of the change: a genuine empty result and a failed lookup
  // must not look the same to the caller.
  it("EC: a real 200 with zero matches is NOT reported as a failure", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(okJson([]) as never);

    const { results, failure } = await searchAddress("asdfghjkl");

    expect(results).toEqual([]);
    expect(failure).toBeNull();
  });

  it("EC: 429 → rate-limited, not a generic outage", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 429 } as never);

    const { results, failure } = await searchAddress("katipunan");

    expect(results).toEqual([]);
    expect(failure).toBe("rate-limited");
  });

  it("EC: 403 (UA policy block) → unavailable", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 403 } as never);

    expect((await searchAddress("katipunan")).failure).toBe("unavailable");
  });

  it("EC: DNS/socket rejection → offline", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("Network request failed"));

    expect((await searchAddress("katipunan")).failure).toBe("offline");
  });

  it("EC: a body that is not an array cannot crash the caller", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(okJson({ error: "nope" }) as never);

    const { results } = await searchAddress("katipunan");

    expect(results).toEqual([]);
  });

  it("EC: a stalled resolver aborts rather than hanging the spinner forever", async () => {
    jest.useFakeTimers();
    jest.spyOn(global, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener("abort", () =>
            reject(new Error("Aborted")),
          );
        }) as never,
    );

    const pending = searchAddress("katipunan");
    jest.advanceTimersByTime(10_000);

    await expect(pending).resolves.toEqual({ results: [], failure: "offline" });
    jest.useRealTimers();
  });
});

describe("reverseGeocode", () => {
  afterEach(() => jest.restoreAllMocks());

  it("HP: returns the place when one is found", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(okJson(HIT) as never);

    const { result, failure } = await reverseGeocode(14.6, 121.07);

    expect(result?.display_name).toContain("Katipunan");
    expect(failure).toBeNull();
  });

  // Nominatim answers 200 with {error: "Unable to geocode"} for open water and
  // unmapped areas. Treating that as a hit would put an object with no
  // display_name into the confirmation pill.
  it("EC: a 200 carrying no display_name is not a hit", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(okJson({ error: "Unable to geocode" }) as never);

    const { result, failure } = await reverseGeocode(0, 0);

    expect(result).toBeNull();
    expect(failure).toBeNull();
  });

  it("EC: offline → no result, and the reason is reported", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("Network request failed"));

    expect(await reverseGeocode(14.6, 121.07)).toEqual({ result: null, failure: "offline" });
  });
});

describe("formatCoords", () => {
  it("HP: names a pin that reverse geocoding could not", () => {
    expect(formatCoords(14.600198, 121.043998)).toBe("Pinned at 14.60020, 121.04400");
  });

  it("HP: 5dp is roughly a metre — enough to prove the pin moved", () => {
    expect(formatCoords(14.6, 121.07)).toBe("Pinned at 14.60000, 121.07000");
  });
});

describe("LOOKUP_FAILURE_TEXT", () => {
  // A partner blocked by someone else's outage needs the way out, not a
  // diagnosis. Every message has to point at the manual fields.
  it("HP: every failure message offers the manual fallback", () => {
    for (const text of Object.values(LOOKUP_FAILURE_TEXT)) {
      expect(text.toLowerCase()).toContain("manually");
    }
  });
});
