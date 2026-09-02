// src/screens/washer/profile/AddressSection.tsx
// "Service coverage" — the washer's structured address, collected with the SAME
// PSGC picker the merchant branch flow uses (AddressPickerSection), so washer
// addresses carry canonical PSGC names/codes and a map pin instead of free
// text. Produces a BE WasherAddressInput (5 required levels + optional
// unit/zip) plus the WasherMapLocationInput pin.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../../../theme/tokens";
import {
  AddressPickerSection,
  EMPTY_ADDRESS,
  type StructuredAddress,
} from "../../../components/AddressPicker";
import { StaticMapPreview } from "../../../components/StaticMapPreview";
import { RadiusSlider } from "../../../components/RadiusSlider";
import type { WasherAddress, WasherMapLocation } from "../../../types/washer.types";
import { Section, FieldLabel } from "./profileParts";
import { profileStyles as styles } from "./profile.styles";

export type AddressDraft = StructuredAddress;
export const EMPTY_ADDRESS_DRAFT: AddressDraft = EMPTY_ADDRESS;

/** Hydrate the picker from a saved profile address + pin. */
export function draftFromAddress(
  a: WasherAddress | null,
  pin?: WasherMapLocation | null,
): AddressDraft {
  return {
    ...EMPTY_ADDRESS,
    latitude:             pin?.latitude ?? null,
    longitude:            pin?.longitude ?? null,
    unit:                 a?.unit ?? "",
    street:               a?.streetAddress ?? "",
    zipCode:              a?.zipCode ?? "",
    barangayName:         a?.barangayName ?? "",
    cityMunicipalityName: a?.cityMunicipalityName ?? "",
    provinceName:         a?.provinceName ?? "",
    regionName:           a?.regionName ?? "",
  };
}

/** The BE requires all 5 PSGC levels plus a street line. */
export function draftComplete(d: AddressDraft): boolean {
  const street = d.street.trim() || d.displayName.split(",")[0]?.trim() || "";
  return (
    street.length > 0 &&
    d.barangayName.trim().length > 0 &&
    d.cityMunicipalityName.trim().length > 0 &&
    d.provinceName.trim().length > 0 &&
    d.regionName.trim().length > 0
  );
}

/** True when the washer has begun entering an address — a partial one is invalid. */
export function draftStarted(d: AddressDraft): boolean {
  return [
    d.street, d.displayName, d.unit, d.zipCode,
    d.barangayName, d.cityMunicipalityName, d.provinceName, d.regionName,
  ].some((v) => v.trim().length > 0) || d.latitude != null;
}

/** Serialize to the BE WasherAddressInput shape. */
export function draftToAddress(d: AddressDraft): WasherAddress {
  return {
    // streetAddress is required — fall back to the map's first line, exactly as
    // the merchant branch converter does.
    streetAddress:        d.street.trim() || d.displayName.split(",")[0]?.trim() || "",
    barangayName:         d.barangayName.trim(),
    cityMunicipalityName: d.cityMunicipalityName.trim(),
    provinceName:         d.provinceName.trim(),
    regionName:           d.regionName.trim(),
    unit:                 d.unit.trim() || null,
    zipCode:              d.zipCode.trim() || null,
  };
}

/** The map pin, or null when the picker never resolved coordinates. */
export function draftToMapLocation(d: AddressDraft): WasherMapLocation | null {
  if (d.latitude == null || d.longitude == null) return null;
  return { latitude: d.latitude, longitude: d.longitude };
}

interface Props {
  readonly draft: AddressDraft;
  readonly onChange: (next: AddressDraft) => void;
  readonly onMapChange: (next: AddressDraft) => void;
  readonly serviceRadius: string;
  readonly onRadiusChange: (v: string) => void;
  readonly editable: boolean;
  /** Admin-set ceiling (Booking Policy → safety limits). Null while loading. */
  readonly maxRadiusKm: number | null;
  /** "Edit Location" inside the map card triggers the same edit mode as the
   * page-level Edit button — this component doesn't own that state. */
  readonly onRequestEdit: () => void;
  readonly error?: string | null;
  /** True while the pin move is being resolved back to PSGC codes. */
  readonly psgcBusy?: boolean;
}

/** One label/value cell in the tiered address breakdown. */
function AddressField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={fieldStyles.cell}>
      <Text style={fieldStyles.label}>{label}</Text>
      <Text style={fieldStyles.value}>{value || "—"}</Text>
    </View>
  );
}

export function AddressSection({
  draft, onChange, onMapChange, serviceRadius, onRadiusChange, maxRadiusKm, editable, onRequestEdit, error, psgcBusy,
}: Props) {
  const hasPin = draft.latitude != null && draft.longitude != null;
  const fullAddress = [
    draft.unit, draft.street, draft.barangayName,
    draft.cityMunicipalityName, draft.provinceName,
  ].filter((v) => v && v.trim()).join(", ");
  const hasAddress = fullAddress.length > 0;

  const radiusNum = Number.parseFloat(serviceRadius);
  // Clamp to whatever the ceiling turns out to be — a value saved before the
  // admin lowered it must still render inside the track, not past its end.
  const radiusValue = Math.min(
    Number.isFinite(radiusNum) && radiusNum > 0 ? radiusNum : 3,
    maxRadiusKm ?? Number.POSITIVE_INFINITY,
  );

  if (editable) {
    return (
      <Section title="Service Coverage">
        {/* Map pin + Nominatim search — same component/behaviour as the
            merchant branch sheets, including PSGC re-derivation on pin move. */}
        <AddressPickerSection
          value={draft}
          onChange={onMapChange}
          variant="map"
          error={error ?? undefined}
        />
        {psgcBusy && (
          <Text style={styles.psgcBusyText}>Detecting address from location…</Text>
        )}
        {/* Cascading PSGC dropdowns + unit/street/ZIP */}
        <AddressPickerSection
          value={draft}
          onChange={onChange}
          variant="mailing"
          detailsCollapsible
        />

        <FieldLabel label="Service Radius (km)" />
        {maxRadiusKm == null ? (
          <Text style={fieldStyles.radiusLoading}>Loading the platform limit…</Text>
        ) : (
          <>
            <RadiusSlider
              value={radiusValue}
              onChange={(km) => onRadiusChange(String(km))}
              max={maxRadiusKm}
            />
            <Text style={fieldStyles.radiusCeilingHint}>
              Up to {maxRadiusKm} km — set by Lalaba.
            </Text>
          </>
        )}
      </Section>
    );
  }

  return (
    <>
      <Section title="Your Location">
        <TouchableOpacity style={fieldStyles.editLocationBtn} onPress={onRequestEdit}>
          <Text style={fieldStyles.editLocationBtnText}>Edit Location</Text>
        </TouchableOpacity>

        <StaticMapPreview
          latitude={draft.latitude}
          longitude={draft.longitude}
          style={fieldStyles.map}
        />

        <Text style={fieldStyles.mapAddressLine}>
          {hasAddress ? fullAddress : "No address set — tap Edit Location to add one."}
        </Text>
        {hasPin && <Text style={fieldStyles.verifyHint}>Verify your Operating Address</Text>}
      </Section>

      {hasAddress && (
        <Section title="Address">
          <Text style={fieldStyles.fullAddress}>{fullAddress}</Text>

          <View style={fieldStyles.row}>
            <AddressField label="Street / Road / Building" value={draft.street} />
            <AddressField label="Barangay" value={draft.barangayName} />
          </View>
          <View style={fieldStyles.row}>
            <AddressField label="City / Municipality" value={draft.cityMunicipalityName} />
            <AddressField label="Province" value={draft.provinceName} />
          </View>
          <View style={fieldStyles.row}>
            <AddressField label="Region" value={draft.regionName} />
          </View>
        </Section>
      )}

      <Section title="Service Radius">
        <RadiusSlider
          value={radiusValue}
          onChange={() => {}}
          max={maxRadiusKm ?? undefined}
          disabled
        />
        {maxRadiusKm != null && (
          <Text style={fieldStyles.radiusCeilingHint}>
            Up to {maxRadiusKm} km — set by Lalaba.
          </Text>
        )}
      </Section>
    </>
  );
}

const fieldStyles = StyleSheet.create({
  editLocationBtn: {
    borderWidth: 1.5,
    borderColor: C.washer500,
    borderRadius: RADIUS.md,
    paddingVertical: SP._10,
    alignItems: "center",
    marginBottom: SP._12,
  },
  editLocationBtnText: { fontSize: 14, fontWeight: "700", color: C.washer500 },
  map: { height: 160, marginBottom: SP._12 },
  mapAddressLine: { fontSize: 14, color: C.gray800, fontWeight: "600", lineHeight: 20 },
  verifyHint: { fontSize: 12.5, color: C.gray500, marginTop: 2 },

  radiusLoading: { fontSize: 13, color: C.gray400 },
  radiusCeilingHint: { fontSize: 12, color: C.gray400, textAlign: "center", marginTop: SP._8 },

  fullAddress: { fontSize: 15, fontWeight: "800", color: C.gray900, lineHeight: 21, marginBottom: SP._12 },
  row: { flexDirection: "row", gap: SP._16, paddingVertical: SP._10, borderTopWidth: 1, borderTopColor: C.gray100 },
  cell: { flex: 1 },
  label: { fontSize: 12, color: C.gray500, marginBottom: 2 },
  value: { fontSize: 14.5, color: C.gray900, fontWeight: "600" },
});
