// src/screens/settings/BranchBrandingEditor.tsx
// Branch branding editor — logo, cover photo, and description for a merchant
// branch (the fields customers see on the marketplace card / store page).
// Saves via merchantStore.updateBranch → BE UpdateBranchInput
// (logoUrl / coverPhotoUrl / description); images upload through the same
// uploadMedia mutation the washer store screen uses.

import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Image, Modal,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
// `/legacy`: SDK 54 moved the function API here. The root export still has a
// `readAsStringAsync`, but it is a deprecation stub that throws at runtime.
import * as FileSystem from "expo-file-system/legacy";
import { C, SP, COMP } from "../../theme/tokens";
import { useMerchantStore, type Branch } from "../../stores/merchantStore";
import { gqlUploadMedia } from "../../services/graphql/media";
import { notify } from "../../stores/notificationStore";
import { showAlert } from "../../lib/dialog";
import { toUserMessage } from "../../utils/userError";
import { brandingStyles as styles } from "./BranchBrandingEditor.styles";

const MAX_DESCRIPTION = 400;

// Built once. As an inline array this allocated a new object every keystroke,
// and a multiline TextInput re-applies its style when that identity changes.
const descField = [COMP.field, styles.descInput];

async function pickImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    showAlert("Permission required", "Please allow photo access to upload branch images.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

// Upload destinations. The backend allowlists the FIRST path segment only —
// branding / branches / washers / products / profiles / uploads, see
// media.service.ts (RISK-P0-002). These were "branch-logo" / "branch-cover",
// whose root segment is on no list, so every logo and cover upload failed with
// "Invalid upload destination." and the sheet could not be saved at all.
//
// Nest under `branches/` rather than widening the allowlist: that list is a
// deliberate boundary keeping caller-supplied folders away from kyc/evidence
// paths. The washer store screen hit this exact bug and was fixed the same way.
const LOGO_FOLDER = "branches/logo";
const COVER_FOLDER = "branches/cover";

async function uploadIfLocal(uri: string, folder: string): Promise<string> {
  if (uri.startsWith("http")) return uri;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  return gqlUploadMedia(base64, mimeType, folder);
}

interface Props {
  /** Branch being edited, or null when the sheet is closed. */
  readonly branch: Branch | null;
  readonly onClose: () => void;
  /** Called after a successful save (e.g. refresh the branches list). */
  readonly onSaved?: () => void;
}

export function BranchBrandingEditor({ branch, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const updateBranch = useMerchantStore((s) => s.updateBranch);

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hydrate from the branch each time the sheet opens.
  useEffect(() => {
    if (!branch) return;
    setLogoUri(branch.logoUrl ?? null);
    setCoverUri(branch.coverPhotoUrl ?? null);
    setDescription(branch.description ?? "");
    setDirty(false);
    setSaveError(null);
  }, [branch]);

  const pickCover = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setCoverUri(uri);
    setDirty(true);
  };

  const pickLogo = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setLogoUri(uri);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!branch || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const uploadedLogo  = logoUri  ? await uploadIfLocal(logoUri,  LOGO_FOLDER)  : null;
      const uploadedCover = coverUri ? await uploadIfLocal(coverUri, COVER_FOLDER) : null;
      await updateBranch(branch.id, {
        logoUrl:       uploadedLogo,
        coverPhotoUrl: uploadedCover,
        description:   description.trim() || null,
      });
      notify.success("Branding updated", `${branch.name}'s branding has been saved.`);
      onSaved?.();
      onClose();
    } catch (err) {
      setSaveError(toUserMessage(err, "Couldn't save branding. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={!!branch}
      animationType="slide"
      transparent
      onRequestClose={() => { if (!saving) onClose(); }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex1}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + SP._20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.headRow}>
              <View style={styles.headText}>
                <Text style={styles.title}>Branch branding</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{branch?.name ?? ""}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12} disabled={saving}>
                <Ionicons name="close" size={22} color={C.gray500} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {saveError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={C.error700} />
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              ) : null}

              {/* Cover photo */}
              <Text style={styles.sectionTitle}>Cover Photo</Text>
              <TouchableOpacity style={styles.coverPicker} onPress={pickCover} activeOpacity={0.8}>
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={styles.coverImg} resizeMode="cover" />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Ionicons name="camera-outline" size={32} color={C.gray300} />
                    <Text style={styles.coverPlaceholderText}>Tap to add a cover photo</Text>
                  </View>
                )}
                <View style={styles.coverEditBadge}>
                  <Ionicons name="camera-outline" size={15} color={C.white} />
                </View>
              </TouchableOpacity>
              <Text style={styles.hint}>Landscape photo, 16:9 ratio, at least 1200×675 px.</Text>

              {/* Logo */}
              <Text style={styles.sectionTitle}>Logo</Text>
              <View style={styles.logoRow}>
                <TouchableOpacity style={styles.logoPicker} onPress={pickLogo} activeOpacity={0.8}>
                  {logoUri ? (
                    <Image source={{ uri: logoUri }} style={styles.logoImg} resizeMode="cover" />
                  ) : (
                    <Ionicons name="camera-outline" size={24} color={C.gray300} />
                  )}
                </TouchableOpacity>
                <Text style={styles.logoHint}>
                  Shown on this branch&apos;s marketplace card. Square image, at least 240×240 px.
                </Text>
              </View>

              {/* Description */}
              <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Description</Text>
              {/* Two things here are deliberate, both about the flicker this
                  field had while typing:

                  `descField` is a hoisted, stable style — the inline array
                  `[COMP.field, styles.descInput]` built a NEW array on every
                  keystroke, and a multiline TextInput re-applies its style on
                  identity change, which shows up as a visible flicker.

                  `maxLength` enforces the cap natively instead of slicing in
                  onChangeText. Slicing means the native input paints the typed
                  character and React then writes the value back, so the caret
                  and text jump at the limit. */}
              <TextInput
                style={descField}
                value={description}
                onChangeText={(t) => { setDescription(t); setDirty(true); }}
                maxLength={MAX_DESCRIPTION}
                placeholder="Tell customers about this branch — services, specialties, what makes it stand out…"
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.hint}>
                Max {MAX_DESCRIPTION} characters — {Math.max(0, MAX_DESCRIPTION - description.length)} remaining
              </Text>

              <TouchableOpacity
                style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
                onPress={() => void handleSave()}
                disabled={!dirty || saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <Text style={styles.saveBtnText}>Save Branding</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
