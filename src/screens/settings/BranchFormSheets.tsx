// src/screens/settings/BranchFormSheets.tsx
// Add-branch and Edit-branch sheets, extracted from BranchesScreen.tsx so both
// files stay under the size budget. Each sheet owns its own form state; the
// parent only controls visibility and reacts to onDone.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../../theme/tokens";
import { AddressPickerSection, StructuredAddress, EMPTY_ADDRESS } from "../../components/AddressPicker";
import { psgcLookupCity, fetchBarangays } from "../../utils/psgc";
import { toBranchAddress } from "../../services/graphql/branches";
import { branchSchema, PH_MOBILE_RE, truncatePhoneDigits, phoneFormatError } from "../../lib/validation";
import { notify } from "../../stores/notificationStore";
import { useAuthStore } from "../../stores/authStore";
import { useMerchantStore } from "../../stores/merchantStore";
import type { Branch } from "../../stores/merchantStore";
import { I } from "./shared";
import { S } from "./styles";

type BusinessType = NonNullable<Branch["businessType"]>;

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "SOLE_PROPRIETORSHIP", label: "Sole Proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "CORPORATION", label: "Corporation" },
  { value: "COOPERATIVE", label: "Cooperative" },
];

const sameText = (a?: string, b?: string) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Pin moved → re-derive the PSGC hierarchy from the city Nominatim reported. */
async function applyMapChange(
  newAddr: StructuredAddress,
  setAddr: React.Dispatch<React.SetStateAction<StructuredAddress>>,
  prevCoordsRef: React.MutableRefObject<{ lat: number | null; lng: number | null }>,
  setBusy: (v: boolean) => void,
) {
  setAddr(newAddr);
  const coordsChanged =
    newAddr.latitude  !== prevCoordsRef.current.lat ||
    newAddr.longitude !== prevCoordsRef.current.lng;
  if (!coordsChanged) return;
  prevCoordsRef.current = { lat: newAddr.latitude, lng: newAddr.longitude };

  const nominatimCity = newAddr.cityMunicipalityName;
  if (!nominatimCity) return;

  setBusy(true);
  try {
    const found = await psgcLookupCity(nominatimCity, {
      provinceName: newAddr.provinceName,
      regionName:   newAddr.regionName,
    });
    if (found) {
      setAddr(prev => ({
        ...prev,
        regionCode:           found.regionCode,
        regionName:           found.regionName,
        provinceCode:         found.provinceCode,
        provinceName:         found.provinceName,
        cityMunicipalityCode: found.cityCode,
        cityMunicipalityName: found.cityName,
        // The old barangay belongs to the old city — force a re-pick.
        barangayCode: "",
        barangayName: "",
      }));
    }
  } catch { /* skip — address fields are optional detail */ }
  finally { setBusy(false); }
}

/** True when the picker holds coordinates that differ from the branch's saved pin. */
function movedPin(a: StructuredAddress, saved?: { latitude: number; longitude: number }): boolean {
  if (a.latitude === null || a.longitude === null) return false; // nothing resolved → nothing to send
  if (!saved) return true;
  const EPS = 1e-6;
  return Math.abs(a.latitude - saved.latitude) > EPS || Math.abs(a.longitude - saved.longitude) > EPS;
}

// Light PH mobile formatter: digits only → "09XX XXX XXXX" (local) or
// "63 9XX XXX XXXX" (country-code).
function formatPhone(raw: string) {
  const d = truncatePhoneDigits(raw);
  if (d.startsWith("6")) {
    return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12)].filter(Boolean).join(" ");
  }
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(" ");
}

function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= 600;
}

// ─── Add Branch sheet ─────────────────────────────────────────────────────────

export function AddBranchSheet({
  visible,
  merchantId,
  onClose,
  onCreated,
}: Readonly<{
  visible: boolean;
  merchantId: string | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}>) {
  const addBranch          = useMerchantStore((s) => s.addBranch);
  const user               = useAuthStore((s) => s.user);
  const refreshMemberships = useAuthStore((s) => s.refreshMemberships);
  const isTablet = useIsTablet();

  const [step,            setStep]            = useState<"form" | "confirm">("form");
  const [saving,          setSaving]          = useState(false);
  const [bName,           setBName]           = useState("");
  const [bAddress,        setBAddress]        = useState<StructuredAddress>(EMPTY_ADDRESS);
  const [bPhone,          setBPhone]          = useState("");
  const [errors,          setErrors]          = useState<Record<string, string>>({});
  const [psgcAutoFilling, setPsgcAutoFilling] = useState(false);
  const prevCoordsRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setBName(""); setBAddress(EMPTY_ADDRESS); setBPhone(""); setErrors({});
    setStep("form");
    prevCoordsRef.current = { lat: null, lng: null };
  }, [visible]);

  const handleMapChange = useCallback(
    (newAddr: StructuredAddress) =>
      applyMapChange(newAddr, setBAddress, prevCoordsRef, setPsgcAutoFilling),
    []
  );

  const canAdd =
    bName.trim().length >= 2 &&
    bAddress.regionName.trim().length > 0 &&
    bAddress.provinceName.trim().length > 0 &&
    bAddress.cityMunicipalityName.trim().length > 0 &&
    bAddress.barangayName.trim().length > 0 &&
    PH_MOBILE_RE.test(bPhone.replace(/\D/g, "")) &&
    !errors.bPhone;

  const handleAdd = async () => {
    const e: Record<string, string> = {};
    const nameResult = branchSchema.shape.name.safeParse(bName.trim());
    if (!nameResult.success) e.bName = nameResult.error.issues[0]?.message ?? "Enter a valid branch name.";
    if (!bAddress.barangayName.trim()) e.bAddress = "Select a complete address (region through barangay).";
    const phoneDigits = bPhone.replace(/\D/g, "");
    const phoneResult = branchSchema.shape.phone.safeParse(phoneDigits);
    if (!phoneResult.success) e.bPhone = phoneResult.error.issues[0]?.message ?? "Enter a valid mobile number.";
    if (Object.keys(e).length) { setErrors(e); return; }
    if (!merchantId) return;
    const branchName = bName.trim();
    setSaving(true);
    try {
      await addBranch(merchantId, { name: bName, structuredAddress: bAddress, phone: phoneDigits, merchantType: "LAUNDROMAT" });
      if (user?.uid) await refreshMemberships(user.uid).catch(() => {});
      await onCreated();
      onClose();
      notify.success("Branch created", `${branchName} has been added to your branches.`);
    } catch {
      notify.error("Could not create branch", "Please check your details and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={visible}
      // Android's transparent+fade Modal briefly flashes an opaque black
      // window before the JS content paints — "none" skips that flash.
      animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"}
      transparent={isTablet}
      presentationStyle={isTablet ? "overFullScreen" : "pageSheet"}
      onRequestClose={() => {
        if (saving) return;
        if (step === "confirm") setStep("form");
        else onClose();
      }}
    >
      <View style={isTablet ? S.sheetTabletOverlay : S.sheetFlexFill}>
      {step === "form" ? (
        <SafeAreaView style={[S.sheetSafeArea, isTablet && S.sheetTabletCard]} edges={isTablet ? [] : ["top", "bottom"]}>
          <View style={S.sheetHeader}>
            <Text style={S.sheetTitle}>New Branch</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <I.X c={C.gray500} s={20} />
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={S.sheetFlexFill} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView style={S.sheetFlexFill} contentContainerStyle={S.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={S.sheetFieldLabel}>Branch Name<Text style={S.requiredStar}> *</Text></Text>
              <TextInput
                style={[S.sheetInput, errors.bName && S.sheetInputError]}
                value={bName}
                onChangeText={setBName}
                placeholder="e.g. Main Branch, SM North Outlet"
                placeholderTextColor={C.gray400}
                autoFocus
              />
              {!!errors.bName && <Text style={S.sheetFieldError}>{errors.bName}</Text>}

              <Text style={[S.sheetFieldLabel, S.sheetFieldLabelSpaced]}>Branch Phone Number<Text style={S.requiredStar}> *</Text></Text>
              <TextInput
                style={[S.sheetInput, errors.bPhone && S.sheetInputError]}
                value={bPhone}
                onChangeText={(v) => {
                  const formatted = formatPhone(v);
                  setBPhone(formatted);
                  setErrors((p) => ({ ...p, bPhone: phoneFormatError(formatted.replace(/\D/g, "")) }));
                }}
                onBlur={() => {
                  const digits = bPhone.replace(/\D/g, "");
                  if (digits && !PH_MOBILE_RE.test(digits)) {
                    setErrors((p) => ({ ...p, bPhone: "Enter a valid mobile number (e.g. 09171234567 or 639171234567)." }));
                  }
                }}
                placeholder="e.g. 09171234567 or 639171234567"
                placeholderTextColor={C.gray400}
                keyboardType="phone-pad"
                maxLength={bPhone.replace(/\D/g, "").startsWith("6") ? 15 : 13}
              />
              {!!errors.bPhone && <Text style={S.sheetFieldError}>{errors.bPhone}</Text>}

              <AddressPickerSection
                value={bAddress}
                onChange={handleMapChange}
                variant="map"
                error={errors.bAddress}
              />
              {psgcAutoFilling && (
                <View style={S.psgcBusyRow}>
                  <ActivityIndicator size="small" color={C.brand500} />
                  <Text style={S.psgcBusyText}>Detecting address from location…</Text>
                </View>
              )}
              <AddressPickerSection
                value={bAddress}
                onChange={setBAddress}
                variant="mailing"
                detailsCollapsible
              />
            </ScrollView>

            {/* ── Sticky action footer (matches Edit Branch) ── */}
            <View style={S.sheetFooter}>
              <TouchableOpacity style={S.sheetCancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={S.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.sheetCta, S.sheetCtaFooter, !canAdd && S.sheetCtaDisabled]}
                onPress={() => setStep("confirm")}
                disabled={!canAdd}
                activeOpacity={0.85}
              >
                <Text style={S.sheetCtaText}>Review & Create</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      ) : (
        <View style={S.confirmOverlay}>
          <View style={S.confirmCard}>
            <Text style={S.confirmTitle}>Review branch details</Text>
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Branch name</Text>
              <Text style={S.confirmSectionValue}>{bName.trim()}</Text>
            </View>
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Phone</Text>
              <Text style={S.confirmSectionValue}>{bPhone.trim()}</Text>
            </View>
            {!!bAddress.displayName.trim() && (
              <View style={S.confirmSection}>
                <Text style={S.confirmSectionLabel}>Map location</Text>
                <Text style={S.confirmSectionValue}>{bAddress.displayName.trim()}</Text>
              </View>
            )}
            {!!bAddress.unit.trim() && (
              <View style={S.confirmSection}>
                <Text style={S.confirmSectionLabel}>House No. / Unit / Floor</Text>
                <Text style={S.confirmSectionValue}>{bAddress.unit.trim()}</Text>
              </View>
            )}
            {!!bAddress.street.trim() && (
              <View style={S.confirmSection}>
                <Text style={S.confirmSectionLabel}>Street / Road / Building</Text>
                <Text style={S.confirmSectionValue}>{bAddress.street.trim()}</Text>
              </View>
            )}
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Barangay</Text>
              <Text style={S.confirmSectionValue}>{bAddress.barangayName}</Text>
            </View>
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Municipality / City</Text>
              <Text style={S.confirmSectionValue}>{bAddress.cityMunicipalityName}</Text>
            </View>
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Province</Text>
              <Text style={S.confirmSectionValue}>{bAddress.provinceName}</Text>
            </View>
            {!!bAddress.zipCode.trim() && (
              <View style={S.confirmSection}>
                <Text style={S.confirmSectionLabel}>ZIP / Postal Code</Text>
                <Text style={S.confirmSectionValue}>{bAddress.zipCode.trim()}</Text>
              </View>
            )}
            <View style={S.confirmActions}>
              <TouchableOpacity style={S.confirmCancelBtn} onPress={() => setStep("form")} disabled={saving} activeOpacity={0.7}>
                <Text style={S.confirmCancelText}>Go back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.confirmActionBtn, saving && S.dim70]} onPress={() => void handleAdd()} disabled={saving} activeOpacity={0.85}>
                {saving
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={S.confirmActionText}>Confirm & Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      </View>
    </Modal>
  );
}

// ─── Edit Branch sheet ────────────────────────────────────────────────────────

export function EditBranchSheet({
  branch,
  onClose,
  onSaved,
}: Readonly<{
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}>) {
  const updateBranch = useMerchantStore((s) => s.updateBranch);
  const isTablet = useIsTablet();

  const [editName,    setEditName]    = useState("");
  const [editAddress, setEditAddress] = useState<StructuredAddress>(EMPTY_ADDRESS);
  const [editPhone,   setEditPhone]   = useState("");
  const [saving,      setSaving]      = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [psgcHydrating, setPsgcHydrating] = useState(false);
  // Business registration details — collected here rather than on the add form,
  // since a merchant gathers them when they get round to verification.
  const [editBusinessType,  setEditBusinessType]  = useState<BusinessType | "">("");
  const [editDtiNumber,     setEditDtiNumber]     = useState("");
  const [editTin,           setEditTin]           = useState("");
  const [editBusinessEmail, setEditBusinessEmail] = useState("");
  const hydrateRef = useRef<string | null>(null);
  const prevCoordsRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  // The BE stores PSGC names but not codes, and the cascading dropdowns key off
  // codes — so resolve them from the names before the selectors can work.
  const hydratePsgcCodes = useCallback(async (branchId: string, addr: StructuredAddress) => {
    if (!addr.cityMunicipalityName.trim()) return;
    setPsgcHydrating(true);
    try {
      // The saved province is the strongest signal we have here: without it,
      // re-opening a saved NCR branch would re-resolve "San Juan" to Ilocos Sur
      // and write those codes back over a correct address.
      const found = await psgcLookupCity(addr.cityMunicipalityName, {
        provinceName: addr.provinceName,
        regionName:   addr.regionName,
      });
      if (!found) return;
      let barangayCode = "";
      if (addr.barangayName.trim()) {
        const barangays = await fetchBarangays(found.cityCode);
        const match = barangays.find(
          (x) => x.name.toLowerCase().trim() === addr.barangayName.toLowerCase().trim()
        );
        barangayCode = match?.code ?? "";
      }
      // A second branch may have been opened while these requests were in flight.
      if (hydrateRef.current !== branchId) return;
      setEditAddress((prev) => ({
        ...prev,
        regionCode:           found.regionCode,
        regionName:           found.regionName   || prev.regionName,
        provinceCode:         found.provinceCode,
        provinceName:         found.provinceName || prev.provinceName,
        cityMunicipalityCode: found.cityCode,
        cityMunicipalityName: found.cityName     || prev.cityMunicipalityName,
        barangayCode,
      }));
    } catch { /* names still render; the merchant can re-pick to fix codes */ }
    finally {
      if (hydrateRef.current === branchId) setPsgcHydrating(false);
    }
  }, []);

  // Hydrate the form whenever a branch is opened for editing.
  useEffect(() => {
    if (!branch) return;
    setEditName(branch.name);
    setEditPhone(branch.phone ?? "");
    setErrors({});
    setEditBusinessType(branch.businessType ?? "");
    setEditDtiNumber(branch.dtiRegistrationNumber ?? "");
    setEditTin(branch.tin ?? "");
    setEditBusinessEmail(branch.businessEmail ?? "");

    const ba = branch.branchAddress;
    const hydrated: StructuredAddress = {
      ...EMPTY_ADDRESS,
      displayName:          branch.address,
      latitude:             branch.branchMapLocation?.latitude  ?? null,
      longitude:            branch.branchMapLocation?.longitude ?? null,
      unit:                 ba?.unit ?? "",
      street:               ba?.streetAddress ?? "",
      zipCode:              ba?.zipCode ?? "",
      barangayName:         ba?.barangayName ?? "",
      cityMunicipalityName: ba?.cityMunicipalityName ?? "",
      provinceName:         ba?.provinceName ?? "",
      regionName:           ba?.regionName ?? "",
    };
    setEditAddress(hydrated);
    // Seed the pin so simply opening the sheet doesn't read as a pin move and
    // kick off a lookup that would clobber the hydration below.
    prevCoordsRef.current = { lat: hydrated.latitude, lng: hydrated.longitude };
    hydrateRef.current = branch.id;
    void hydratePsgcCodes(branch.id, hydrated);
  }, [branch, hydratePsgcCodes]);

  const handleMapChange = useCallback(
    (newAddr: StructuredAddress) =>
      applyMapChange(newAddr, setEditAddress, prevCoordsRef, setPsgcHydrating),
    []
  );

  // Compare against what's stored rather than a snapshot of the form: opening the
  // sheet fills in PSGC codes asynchronously, and those aren't edits the merchant made.
  const editDirty = useMemo(() => {
    if (!branch) return false;
    if (editName.trim() !== branch.name) return true;
    if (editPhone.replace(/\D/g, "") !== (branch.phone ?? "").replace(/\D/g, "")) return true;

    if (editBusinessType !== (branch.businessType ?? "")) return true;
    if (!sameText(editDtiNumber, branch.dtiRegistrationNumber ?? "")) return true;
    if (!sameText(editTin, branch.tin ?? "")) return true;
    if (!sameText(editBusinessEmail, branch.businessEmail ?? "")) return true;

    const stored = branch.branchAddress;
    if (!stored) return true; // nothing to compare against — let them save

    const next = toBranchAddress(editAddress);
    const changed =
      !sameText(next.unit,                 stored.unit) ||
      !sameText(next.streetAddress,        stored.streetAddress) ||
      !sameText(next.barangayName,         stored.barangayName) ||
      !sameText(next.cityMunicipalityName, stored.cityMunicipalityName) ||
      !sameText(next.provinceName,         stored.provinceName) ||
      !sameText(next.regionName,           stored.regionName) ||
      !sameText(next.zipCode,              stored.zipCode);
    if (changed) return true;

    return movedPin(editAddress, branch.branchMapLocation);
  }, [
    branch,
    editName,
    editPhone,
    editAddress,
    editBusinessType,
    editDtiNumber,
    editTin,
    editBusinessEmail,
  ]);

  const canSaveEdit =
    editDirty &&
    editName.trim().length >= 2 &&
    editAddress.regionName.trim().length > 0 &&
    editAddress.provinceName.trim().length > 0 &&
    editAddress.cityMunicipalityName.trim().length > 0 &&
    editAddress.barangayName.trim().length > 0 &&
    PH_MOBILE_RE.test(editPhone.replace(/\D/g, "")) &&
    !errors.editName && !errors.editPhone;

  const handleEdit = async () => {
    if (!branch) return;
    const e: Record<string, string> = {};
    const nameResult = branchSchema.shape.name.safeParse(editName.trim());
    if (!nameResult.success) e.editName = nameResult.error.issues[0]?.message ?? "Enter a valid branch name.";
    const editPhoneDigits = editPhone.replace(/\D/g, "");
    const phoneResult = branchSchema.shape.phone.safeParse(editPhoneDigits);
    if (!phoneResult.success) e.editPhone = phoneResult.error.issues[0]?.message ?? "Enter a valid mobile number.";
    if (!editAddress.barangayName.trim()) e.editAddress = "Select a complete address (region through barangay).";

    // Business details are optional, so only validate what was actually filled.
    const tin = editTin.trim();
    if (tin && !branchSchema.shape.tin.safeParse(tin).success) {
      e.editTin = "TIN must look like 000-000-000 or 000-000-000-00000.";
    }
    const businessEmail = editBusinessEmail.trim();
    if (businessEmail && !branchSchema.shape.businessEmail.safeParse(businessEmail).success) {
      e.editBusinessEmail = "Enter a valid email address.";
    }

    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await updateBranch(branch.id, {
        name: editName.trim(),
        structuredAddress: editAddress,
        phone: editPhoneDigits,
        // Blank clears the field rather than leaving a stale value behind.
        businessType: editBusinessType || null,
        dtiRegistrationNumber: editDtiNumber.trim() || null,
        tin: tin || null,
        businessEmail: businessEmail || null,
      });
      await onSaved();
      onClose();
      notify.success("Branch updated");
    } catch {
      notify.error("Could not update branch", "Please check your details and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={!!branch} animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} transparent={isTablet} presentationStyle={isTablet ? "overFullScreen" : "pageSheet"} onRequestClose={onClose}>
      <View style={isTablet ? S.sheetTabletOverlay : S.sheetFlexFill}>
      <SafeAreaView style={[S.sheetSafeArea, isTablet && S.sheetTabletCard]} edges={isTablet ? [] : ["top", "bottom"]}>
        <View style={[S.sheetHeader, S.sheetHeaderTop]}>
          <View style={S.sheetHeadText}>
            <Text style={S.sheetTitle}>Edit Branch</Text>
            <Text style={S.sheetSubtitle}>Update branch details.</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7} style={S.sheetHeadClose}>
            <I.X c={C.gray500} s={20} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={S.sheetFlexFill} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={S.sheetFlexFill} contentContainerStyle={S.sheetBody} keyboardShouldPersistTaps="handled">
            {/* ── Branch information ── */}
            <Text style={[S.sheetSectionLabel, S.mt0]}>BRANCH INFORMATION</Text>

            <Text style={S.sheetFieldLabel}>Branch Name<Text style={S.requiredStar}> *</Text></Text>
            <TextInput
              style={[S.sheetInput, errors.editName && S.sheetInputError]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Branch name"
              placeholderTextColor={C.gray400}
            />
            {!!errors.editName && <Text style={S.sheetFieldError}>{errors.editName}</Text>}

            <Text style={[S.sheetFieldLabel, S.sheetFieldLabelSpaced12]}>Phone Number<Text style={S.requiredStar}> *</Text></Text>
            <TextInput
              style={[S.sheetInput, errors.editPhone && S.sheetInputError]}
              value={editPhone}
              onChangeText={(v) => {
                const formatted = formatPhone(v);
                setEditPhone(formatted);
                setErrors((p) => ({ ...p, editPhone: phoneFormatError(formatted.replace(/\D/g, "")) }));
              }}
              onBlur={() => {
                const digits = editPhone.replace(/\D/g, "");
                if (digits && !PH_MOBILE_RE.test(digits)) {
                  setErrors((p) => ({ ...p, editPhone: "Enter a valid mobile number (e.g. 09171234567 or 639171234567)." }));
                }
              }}
              placeholder="09XX XXX XXXX or 63 9XX XXX XXXX"
              placeholderTextColor={C.gray400}
              keyboardType="phone-pad"
              maxLength={editPhone.replace(/\D/g, "").startsWith("6") ? 15 : 13}
            />
            {!!errors.editPhone && <Text style={S.sheetFieldError}>{errors.editPhone}</Text>}

            <AddressPickerSection
              value={editAddress}
              onChange={handleMapChange}
              variant="map"
              error={errors.editAddress}
            />
            {psgcHydrating && (
              <View style={S.psgcBusyRow}>
                <ActivityIndicator size="small" color={C.brand500} />
                <Text style={S.psgcBusyText}>Loading current address…</Text>
              </View>
            )}
            <AddressPickerSection
              value={editAddress}
              onChange={setEditAddress}
              variant="mailing"
              detailsCollapsible
            />

            {/* Optional: a branch works without these. They're what a reviewer
                checks the DTI and BIR certificates against during verification,
                so the Business Information checklist row reads its completeness
                from exactly these fields. */}
            <Text style={S.sheetSectionLabel}>BUSINESS REGISTRATION</Text>
            <Text style={[S.sheetFieldLabel, S.sheetFieldLabelMuted]}>
              Used for your Verified Merchant badge. You can add these later.
            </Text>

            <Text style={[S.sheetFieldLabel, S.sheetFieldLabelSpaced12]}>Business Type</Text>
            <View style={S.chipRow}>
              {BUSINESS_TYPE_OPTIONS.map((opt) => {
                const selected = editBusinessType === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setEditBusinessType(selected ? "" : opt.value)}
                    activeOpacity={0.8}
                    style={[S.chip, selected && S.chipSelected]}
                  >
                    <Text style={[S.chipText, selected && S.chipTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[S.sheetFieldLabel, S.sheetFieldLabelSpaced12]}>DTI Registration Number</Text>
            <TextInput
              style={S.sheetInput}
              value={editDtiNumber}
              onChangeText={setEditDtiNumber}
              placeholder="As printed on your DTI certificate"
              placeholderTextColor={C.gray400}
              autoCapitalize="characters"
            />

            <Text style={[S.sheetFieldLabel, S.sheetFieldLabelSpaced12]}>TIN</Text>
            <TextInput
              style={[S.sheetInput, errors.editTin && S.sheetInputError]}
              value={editTin}
              onChangeText={(v) => {
                setEditTin(v);
                setErrors((p) => ({ ...p, editTin: "" }));
              }}
              placeholder="000-000-000"
              placeholderTextColor={C.gray400}
              keyboardType="numbers-and-punctuation"
              maxLength={19}
            />
            {!!errors.editTin && <Text style={S.sheetFieldError}>{errors.editTin}</Text>}

            <Text style={[S.sheetFieldLabel, S.sheetFieldLabelSpaced12]}>Business Email</Text>
            <TextInput
              style={[S.sheetInput, errors.editBusinessEmail && S.sheetInputError]}
              value={editBusinessEmail}
              onChangeText={(v) => {
                setEditBusinessEmail(v);
                setErrors((p) => ({ ...p, editBusinessEmail: "" }));
              }}
              placeholder="billing@yourshop.ph"
              placeholderTextColor={C.gray400}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {!!errors.editBusinessEmail && <Text style={S.sheetFieldError}>{errors.editBusinessEmail}</Text>}
          </ScrollView>

          {/* ── Sticky action footer ── */}
          <View style={S.sheetFooter}>
            <TouchableOpacity style={S.sheetCancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={S.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                S.sheetCta,
                S.sheetCtaFooter,
                saving && S.dim60,
                !canSaveEdit && !saving && S.sheetCtaDisabled,
              ]}
              onPress={() => void handleEdit()}
              disabled={saving || !canSaveEdit}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={C.white} />
                : <Text style={S.sheetCtaText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </View>
    </Modal>
  );
}
