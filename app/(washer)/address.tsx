// app/(washer)/address.tsx
// Washer › Address & Location — where this washer operates and how far she
// travels.
//
// Split out of the old single "Business profile" screen (see services.tsx for
// why). This half is a hard gate on going online: discovery matches customers
// to washers by distance, so a washer with no pin and no radius cannot be
// found or booked at all. The dashboard shows a reminder card for exactly that
// state, and the backend refuses to quote for her.
//
// The address is a structured PSGC hierarchy — the same picker merchant
// branches use. Partial addresses are rejected: the BE wants all five levels
// plus a street line, or nothing.

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, SP } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { useAuthStore } from "../../src/stores/authStore";
import { useWasherStore } from "../../src/stores/washerStore";
import { gqlMaxServiceRadiusKm } from "../../src/services/graphql/bookingAvailability";
import type { WasherProfile } from "../../src/types/washer.types";
import {
  AddressSection,
  EMPTY_ADDRESS_DRAFT,
  draftComplete,
  draftFromAddress,
  draftStarted,
  draftToAddress,
  draftToMapLocation,
  type AddressDraft,
} from "../../src/screens/washer/profile/AddressSection";
import { applyPsgcFromPin } from "../../src/screens/washer/profile/applyPsgcFromPin";
import { profileStyles as styles } from "../../src/screens/washer/profile/profile.styles";

export default function WasherAddress() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const washerId = user?.uid ?? "";

  const { profile, isLoading, loadWasher, updateProfile } = useWasherStore();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [psgcBusy, setPsgcBusy] = useState(false);

  const [draft, setDraft] = useState<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  const [serviceRadius, setServiceRadius] = useState("3");
  // Admin-set ceiling on the slider below — null while loading, so the
  // slider stays disabled rather than briefly allowing an unbounded drag.
  const [maxRadiusKm, setMaxRadiusKm] = useState<number | null>(null);

  // Last pin position, so a PSGC re-derivation only fires when the pin really moved.
  const prevPin = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  useEffect(() => {
    if (!profile) { loadWasher(washerId); return; }
    const next = draftFromAddress(profile.address ?? null, profile.mapLocation ?? null);
    setDraft(next);
    prevPin.current = { lat: next.latitude, lng: next.longitude };
    setServiceRadius(String(profile.serviceRadiusKm ?? 3));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    let alive = true;
    void gqlMaxServiceRadiusKm().then((km) => { if (alive) setMaxRadiusKm(km); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Moving the pin re-derives the PSGC hierarchy from the city the map reported,
  // exactly as the merchant branch sheets do.
  const handleMapChange = useCallback((next: AddressDraft) => {
    setDraft(next);
    void applyPsgcFromPin(next, prevPin, setDraft, setPsgcBusy);
  }, []);

  const handleCancel = () => {
    if (profile) {
      const next = draftFromAddress(profile.address ?? null, profile.mapLocation ?? null);
      setDraft(next);
      prevPin.current = { lat: next.latitude, lng: next.longitude };
      setServiceRadius(String(profile.serviceRadiusKm ?? 3));
    }
    setAddressError(null);
    setSaveError(null);
    setEditing(false);
  };

  const handleSave = async () => {
    setSaveError(null);
    setAddressError(null);

    const radius = parseFloat(serviceRadius);
    if (isNaN(radius) || radius <= 0) {
      setSaveError("Enter a service radius greater than 0 km.");
      return;
    }
    // Fast local feedback — the backend rejects this too (WasherService
    // .updateProfile), so this only saves a round trip, not a real gate.
    if (maxRadiusKm != null && radius > maxRadiusKm) {
      setSaveError(`Service radius cannot exceed ${maxRadiusKm} km, the platform maximum.`);
      return;
    }

    const payload: Partial<WasherProfile> = { serviceRadiusKm: radius };

    // A partial address is invalid to the BE — all five PSGC levels plus a
    // street line, or nothing at all.
    if (draftStarted(draft)) {
      if (!draftComplete(draft)) {
        setAddressError("Pick your address down to the barangay so customers can find you.");
        return;
      }
      payload.address = draftToAddress(draft);
      const pin = draftToMapLocation(draft);
      if (pin) payload.mapLocation = pin;
    }

    setSaving(true);
    try {
      await updateProfile(payload);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={C.accent500} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex1}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SP._16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <BackLink label="Settings" fallback="/(washer)/settings" />

        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.pageTitle}>Address & Location</Text>
            <Text style={styles.pageSub}>Where you operate and how far you travel</Text>
          </View>
          {editing ? (
            <>
              <TouchableOpacity style={styles.editBtn} onPress={handleCancel} disabled={saving}>
                <Text style={styles.editBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, styles.editBtnSave]}
                onPress={() => void handleSave()}
                disabled={saving}
              >
                <Text style={[styles.editBtnText, styles.editBtnTextSave]}>
                  {saving ? "Saving…" : "Save"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {saveError && (
          <View style={styles.saveErrorBanner}>
            <Ionicons name="alert-circle" size={18} color={C.error700} />
            <Text style={styles.saveErrorText}>{saveError}</Text>
          </View>
        )}

        <AddressSection
          draft={draft}
          onChange={setDraft}
          onMapChange={handleMapChange}
          serviceRadius={serviceRadius}
          onRadiusChange={setServiceRadius}
          maxRadiusKm={maxRadiusKm}
          editable={editing}
          onRequestEdit={() => setEditing(true)}
          error={addressError}
          psgcBusy={psgcBusy}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
