// src/screens/washer/profile/applyPsgcFromPin.ts
// When the map pin moves, re-derive the PSGC hierarchy from the city the map
// reported — the same behaviour the merchant branch sheets implement
// (src/screens/settings/BranchFormSheets.tsx applyMapChange). The old barangay
// belongs to the old city, so it is cleared to force a re-pick.

import type React from "react";
import { psgcLookupCity } from "../../../utils/psgc";
import type { StructuredAddress } from "../../../components/AddressPicker";

export async function applyPsgcFromPin(
  next: StructuredAddress,
  prevPinRef: React.MutableRefObject<{ lat: number | null; lng: number | null }>,
  setAddress: React.Dispatch<React.SetStateAction<StructuredAddress>>,
  setBusy: (v: boolean) => void,
): Promise<void> {
  const moved =
    next.latitude !== prevPinRef.current.lat ||
    next.longitude !== prevPinRef.current.lng;
  if (!moved) return;
  prevPinRef.current = { lat: next.latitude, lng: next.longitude };

  const reportedCity = next.cityMunicipalityName;
  if (!reportedCity) return;

  setBusy(true);
  try {
    const found = await psgcLookupCity(reportedCity, {
      provinceName: next.provinceName,
      regionName:   next.regionName,
    });
    if (!found) return;
    setAddress((prev) => ({
      ...prev,
      regionCode:           found.regionCode,
      regionName:           found.regionName,
      provinceCode:         found.provinceCode,
      provinceName:         found.provinceName,
      cityMunicipalityCode: found.cityCode,
      cityMunicipalityName: found.cityName,
      barangayCode: "",
      barangayName: "",
    }));
  } catch {
    // Names still render; the washer can re-pick to fix codes.
  } finally {
    setBusy(false);
  }
}
