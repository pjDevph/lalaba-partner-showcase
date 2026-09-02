// app/(washer)/services.tsx
// Washer › Services — which platform services this washer offers.
//
// Split out of the old single "Business profile" screen, which stacked Services
// and Address & Location under ONE Edit/Save header. That coupling meant a
// washer fixing a typo in her address also re-submitted her whole service list,
// and a validation failure in either half blocked saving the other. They are
// also the two things that must BOTH be set before she can go online, so
// Settings now names them separately and each can be completed on its own.
//
// Pricing is not editable here: services come from the platform catalog
// (offeredServiceTemplateIds) and what she charges lives in the pricing editor
// inside OfferedServicesSection.

import React, { useEffect, useState, useCallback } from "react";
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
import { OfferedServicesSection } from "../../src/screens/washer/profile/OfferedServicesSection";
import { profileStyles as styles } from "../../src/screens/washer/profile/profile.styles";

export default function WasherServices() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const washerId = user?.uid ?? "";

  const { profile, isLoading, loadWasher, updateProfile } = useWasherStore();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [offeredIds, setOfferedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) { loadWasher(washerId); return; }
    setOfferedIds(profile.offeredServiceTemplateIds ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const toggleService = useCallback((templateId: string, offered: boolean) => {
    setOfferedIds((prev) =>
      offered ? [...prev, templateId] : prev.filter((id) => id !== templateId),
    );
  }, []);

  const handleCancel = () => {
    if (profile) setOfferedIds(profile.offeredServiceTemplateIds ?? []);
    setSaveError(null);
    setEditing(false);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      // Only this screen's slice. Sending the address here too is what let a
      // stale render of one section overwrite the other.
      await updateProfile({ offeredServiceTemplateIds: offeredIds });
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
            <Text style={styles.pageTitle}>Services</Text>
            <Text style={styles.pageSub}>What you offer and what you charge</Text>
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

        <OfferedServicesSection
          selectedIds={offeredIds}
          onToggle={toggleService}
          editable={editing}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
