import { distanceKm, formatDistance } from "../geo";

// Angono, roughly — the area the test fixtures use.
const ANGONO = { latitude: 14.5266, longitude: 121.1531 };

describe("distanceKm", () => {
  it("HP: is zero for the same point", () => {
    expect(distanceKm(ANGONO, ANGONO)).toBe(0);
  });

  it("HP: a degree of latitude is about 111 km", () => {
    const north = { ...ANGONO, latitude: ANGONO.latitude + 1 };
    expect(distanceKm(ANGONO, north)).toBeCloseTo(111, 0);
  });

  it("HP: is symmetric", () => {
    const b = { latitude: 14.6, longitude: 121.2 };
    expect(distanceKm(ANGONO, b)).toBeCloseTo(distanceKm(b, ANGONO), 6);
  });

  it("HP: a few hundred metres reads as a few hundred metres", () => {
    // ~0.001 degrees of latitude ≈ 111 m.
    const near = { ...ANGONO, latitude: ANGONO.latitude + 0.001 };
    const m = distanceKm(ANGONO, near) * 1000;
    expect(m).toBeGreaterThan(100);
    expect(m).toBeLessThan(120);
  });

  it("EC: handles the antimeridian without returning a near-zero", () => {
    // Longitudes 179.9 and -179.9 are 0.2 degrees apart, not 359.8.
    const a = { latitude: 0, longitude: 179.9 };
    const b = { latitude: 0, longitude: -179.9 };
    expect(distanceKm(a, b)).toBeLessThan(30);
  });
});

describe("formatDistance", () => {
  // Under a kilometre reads in metres: "0.4 km" is a worse answer than "450 m"
  // for someone deciding which stop to take next.
  it("HP: metres below a kilometre", () => {
    expect(formatDistance(0.45)).toBe("450 m");
    expect(formatDistance(0.999)).toBe("999 m");
  });

  it("HP: one decimal up to 10 km, whole numbers above", () => {
    expect(formatDistance(2.44)).toBe("2.4 km");
    expect(formatDistance(12.6)).toBe("13 km");
  });

  it("EC: renders nothing for a value that cannot be a distance", () => {
    expect(formatDistance(Number.NaN)).toBe("");
    expect(formatDistance(-1)).toBe("");
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe("");
  });
});
