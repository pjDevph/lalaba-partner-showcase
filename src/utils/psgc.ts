// src/utils/psgc.ts
// PSGC (Philippine Standard Geographic Code) API client.
// Public API at https://psgc.gitlab.io/api/ — no auth required, data is static.
// All responses are cached in module-level Maps so each list is fetched only once per app session.

const BASE = "https://psgc.gitlab.io/api";
const cache = new Map<string, unknown[]>();

async function psgcFetch<T>(path: string): Promise<T[]> {
  const cached = cache.get(path);
  if (cached) return cached as T[];

  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`PSGC ${path} → HTTP ${res.status}`);
  const data = (await res.json()) as T[];
  cache.set(path, data);
  return data;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PsgcRegion {
  code:       string;  // e.g. "010000000"
  name:       string;  // e.g. "Ilocos Region"
  regionName: string;  // e.g. "Region I"
  islandGroupCode: string;
}

export interface PsgcProvince {
  code:       string;  // e.g. "012800000"
  name:       string;  // e.g. "Ilocos Norte"
  regionCode: string;
}

export interface PsgcCityMun {
  code:            string;  // e.g. "012801000"
  name:            string;  // e.g. "Adams"
  isCity:          boolean;
  isMunicipality:  boolean;
  provinceCode:    string;
  regionCode:      string;
}

export interface PsgcBarangay {
  code:             string;  // e.g. "012801001"
  name:             string;  // e.g. "Barangay 1"
  municipalityCode: string;
  cityCode:         string;
  provinceCode:     string;
}

// ─── NCR detection ───────────────────────────────────────────────────────────
// NCR (code "130000000") has no provinces; cities are fetched directly under the region.
export function isNcr(regionCode: string): boolean {
  return regionCode.startsWith("13");
}

/**
 * PSGC has no province under NCR, but a province is required downstream (and is
 * how PH addresses are actually written: "Quezon City, Metro Manila"). NCR
 * addresses use this as their province name; it has no PSGC code.
 */
export const NCR_PROVINCE_NAME = "Metro Manila";

// ─── API calls ────────────────────────────────────────────────────────────────

export function fetchRegions(): Promise<PsgcRegion[]> {
  return psgcFetch<PsgcRegion>("/regions/");
}

export function fetchProvinces(regionCode: string): Promise<PsgcProvince[]> {
  return psgcFetch<PsgcProvince>(`/regions/${regionCode}/provinces/`);
}

/** For NCR pass the region code and isRegion=true; for other regions pass province code. */
export function fetchCitiesMunicipalities(
  code: string,
  isRegion = false
): Promise<PsgcCityMun[]> {
  const path = isRegion
    ? `/regions/${code}/cities-municipalities/`
    : `/provinces/${code}/cities-municipalities/`;
  return psgcFetch<PsgcCityMun>(path);
}

export function fetchBarangays(cityMunCode: string): Promise<PsgcBarangay[]> {
  return psgcFetch<PsgcBarangay>(`/cities-municipalities/${cityMunCode}/barangays/`);
}

/** All cities/municipalities in one flat call — used for Nominatim → PSGC auto-fill. */
export function fetchAllCitiesMunicipalities(): Promise<PsgcCityMun[]> {
  return psgcFetch<PsgcCityMun>("/cities-municipalities/");
}

export interface PsgcResolvedCity {
  cityName:     string;
  cityCode:     string;
  regionName:   string;
  regionCode:   string;
  provinceName: string;
  provinceCode: string;
}

/**
 * Where the geocoder thinks the pin is, above city level. City names are not
 * unique in PH — "San Juan" is a municipality in Ilocos Sur, La Union, Abra,
 * Batangas and Southern Leyte as well as a city in NCR — so without this the
 * lookup can only return whichever one happens to sort first.
 */
export interface PsgcLookupHint {
  /** Nominatim `address.province`/`state`, e.g. "Metro Manila", "Ilocos Sur". */
  provinceName?: string;
  /** Nominatim `address.region`, when it supplies one. */
  regionName?: string;
}

/** Lowercase and drop the qualifiers PSGC and Nominatim disagree about. */
function normalizePlace(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(city of|municipality of|province of)\s+/, "")
    .replace(/\s+(city|province)$/, "")
    .replace(/[.,]/g, "")
    .trim();
}

/** NCR is spelled a dozen ways; PSGC has no province row for it at all. */
function isNcrHint(hint: string): boolean {
  const h = normalizePlace(hint);
  return (
    h === "metro manila" ||
    h === "national capital region" ||
    h === "ncr" ||
    h === "metropolitan manila"
  );
}

/** Resolve a city's region + province names, tolerating NCR's missing province. */
async function resolveHierarchy(
  city: PsgcCityMun,
  allRegions: PsgcRegion[],
): Promise<PsgcResolvedCity> {
  const region = allRegions.find(r => r.code === city.regionCode);

  let provinceName = isNcr(city.regionCode) ? NCR_PROVINCE_NAME : "";
  let provinceCode = "";
  if (!isNcr(city.regionCode) && city.provinceCode) {
    try {
      const provinces = await fetchProvinces(city.regionCode);
      const province  = provinces.find(p => p.code === city.provinceCode);
      provinceName    = province?.name ?? "";
      provinceCode    = province?.code ?? city.provinceCode;
    } catch { /* leave empty — address details are optional */ }
  }

  return {
    cityName:   city.name,
    cityCode:   city.code,
    regionName: region?.name ?? "",
    regionCode: city.regionCode,
    provinceName,
    provinceCode,
  };
}

/**
 * Fuzzy-match a city name from Nominatim against the PSGC list and resolve
 * the full region + province hierarchy. Returns null if no match found.
 *
 * Pass `hint` whenever the geocoder reported a province/region. Name matching
 * alone picks the first of several same-named municipalities, which is how a
 * Greenhills pin used to come back as San Juan, *Ilocos Sur*. The hint only
 * ever re-orders candidates that already matched by name — it never widens the
 * match — so a wrong hint degrades to the old behaviour rather than misfiring.
 */
export async function psgcLookupCity(
  nominatimCityName: string,
  hint: PsgcLookupHint = {},
): Promise<PsgcResolvedCity | null> {
  if (!nominatimCityName.trim()) return null;

  const [allCities, allRegions] = await Promise.all([
    fetchAllCitiesMunicipalities(),
    fetchRegions(),
  ]);

  const needle = nominatimCityName.toLowerCase().trim();
  const normalizedNeedle = normalizePlace(needle);

  // Tiers, strongest first — same precedence as before, but every match is kept
  // instead of only the first, so the hint has something to choose between.
  const tiers: PsgcCityMun[][] = [
    allCities.filter(c => c.name.toLowerCase() === needle),
    allCities.filter(c => normalizePlace(c.name) === normalizedNeedle),
    allCities.filter(c => c.name.toLowerCase().includes(needle)),
    allCities.filter(c => needle.includes(normalizePlace(c.name))),
  ];

  const seen = new Set<string>();
  const candidates: PsgcCityMun[] = [];
  for (const tier of tiers) {
    for (const c of tier) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      candidates.push(c);
    }
  }
  if (!candidates.length) return null;

  const hintText = (hint.provinceName || hint.regionName || "").trim();
  if (!candidates.length || !hintText) {
    return resolveHierarchy(candidates[0], allRegions);
  }

  // NCR is checked off the region code directly: PSGC exposes no province row
  // for it, so a "Metro Manila" hint can never match a province name.
  if (isNcrHint(hintText)) {
    const ncrMatch = candidates.find(c => isNcr(c.regionCode));
    if (ncrMatch) return resolveHierarchy(ncrMatch, allRegions);
  }

  const wanted = normalizePlace(hintText);
  for (const candidate of candidates) {
    const resolved = await resolveHierarchy(candidate, allRegions);
    if (
      (resolved.provinceName && normalizePlace(resolved.provinceName) === wanted) ||
      (resolved.regionName   && normalizePlace(resolved.regionName)   === wanted)
    ) {
      return resolved;
    }
  }

  // Hint matched nothing — fall back to the strongest name match.
  return resolveHierarchy(candidates[0], allRegions);
}
