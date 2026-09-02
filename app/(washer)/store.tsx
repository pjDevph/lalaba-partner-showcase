// app/(washer)/store.tsx
// Online Store Setup — cover photo, featured photos, store description.
// Includes "View as Customer" preview mode to see how the profile looks.

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
// `/legacy`: SDK 54 moved the function API here. The root export still has a
// `readAsStringAsync`, but it is a deprecation stub that throws at runtime.
import * as FileSystem from "expo-file-system/legacy";
import { C, RADIUS, SP, COMP } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { CustomerPreviewBody } from "../../src/components/CustomerPreviewBody";
import { useAuthStore } from "../../src/stores/authStore";
import { useWasherStore } from "../../src/stores/washerStore";
import { useNotificationStore } from "../../src/stores/notificationStore";
import { showAlert } from "../../src/lib/dialog";
import {
  gqlMyProviderProfile,
  gqlProviderServices,
  type MyProviderProfile,
  type ProviderServiceItem,
} from "../../src/services/graphql/discovery";
import { gqlUploadMedia } from "../../src/services/graphql/media";

const TEAL = C.accent500;

// ─── SVG Icons ────────────────────────────────────────────────────────────────

type IconProps = Readonly<{ size?: number; color?: string }>;

function IconCamera({ size = 28, color = TEAL }: IconProps) {
  return <Ionicons name="camera-outline" size={size} color={color} />;
}

function IconPlus({ size = 20, color = TEAL }: IconProps) {
  return <Ionicons name="add" size={size} color={color} />;
}

function IconTrash({ size = 16, color = C.error500 }: IconProps) {
  return <Ionicons name="trash-outline" size={size} color={color} />;
}

function IconEye({ size = 18, color = C.white }: IconProps) {
  return <Ionicons name="eye-outline" size={size} color={color} />;
}

// ─── Request image picker permission ─────────────────────────────────────────

async function pickImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    showAlert("Permission required", "Please allow photo access to upload store images.");
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

// ─── Customer Preview Modal ───────────────────────────────────────────────────

interface PreviewProps {
  /** Unsaved edits, overlaid on the real profile. */
  storeName: string;
  headerUri: string | null;
  featuredUris: string[];
  description: string;
  onClose: () => void;
}

/**
 * "View as customer" for the store editor — the SAME body the dashboard's
 * /(washer)/preview uses, so the two can't visually drift, with the three
 * fields this screen edits overlaid as unsaved drafts on top of the server
 * profile (`myProviderProfile` / `providerServices`, the exact resolvers the
 * customer app reads).
 *
 * The overlay is the whole reason this is a modal fetching its own copy of
 * the profile rather than a link to /(washer)/preview: before saving, the
 * cover/featured photos are `file://` URIs the server has never seen.
 */
function CustomerPreview({
  storeName,
  headerUri,
  featuredUris,
  description,
  onClose,
}: Readonly<PreviewProps>) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<MyProviderProfile | null>(null);
  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const p = await gqlMyProviderProfile();
        if (!alive) return;
        setProfile(p);
        if (p) {
          const svc = await gqlProviderServices(p.branchId, p.providerType);
          if (alive) setServices(svc);
        }
      } catch {
        /* keep whatever loaded; the empty state below covers a total failure */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible animationType="slide" onRequestClose={onClose}>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.white }}>
          <ActivityIndicator color={TEAL} />
        </View>
      ) : !profile ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.white, padding: SP._24 }}>
          <Text style={{ color: C.gray600, textAlign: "center" }}>
            Couldn&apos;t load your public profile.
          </Text>
        </View>
      ) : (
        <CustomerPreviewBody
          profile={profile}
          services={services}
          onBack={onClose}
          topInset={insets.top}
          bottomInset={insets.bottom}
          overrides={{
            name: storeName,
            coverPhotoUrl: headerUri,
            featuredPhotos: featuredUris,
            description,
          }}
        />
      )}
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WasherStore() {
  const insets   = useSafeAreaInsets();
  const user     = useAuthStore((s) => s.user);
  const washerId = user?.uid ?? "";

  const { profile, isLoading, loadWasher, updateProfile } = useWasherStore();

  const [storeName,    setStoreName]    = useState("");
  const [nameError,    setNameError]    = useState<string | null>(null);
  const [headerUri,    setHeaderUri]    = useState<string | null>(null);
  const [logoUri,      setLogoUri]      = useState<string | null>(null);
  // An unreachable URL (wrong host, deleted object) must show the "tap to add"
  // placeholder, not a silent empty box that reads as "no photo saved".
  const [headerBroken, setHeaderBroken] = useState(false);
  const [logoBroken,   setLogoBroken]   = useState(false);
  const [featured,     setFeatured]     = useState<string[]>([]);
  const [description,  setDescription]  = useState("");
  const [saving,       setSaving]       = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);
  const [dirty,        setDirty]        = useState(false);

  useEffect(() => {
    if (!profile) { loadWasher(washerId); return; }
    setStoreName(profile.storeName ?? "");
    setHeaderUri(profile.storeHeaderUrl ?? null);
    setLogoUri(profile.logoUrl ?? null);
    setFeatured(profile.storeFeaturedPhotos ?? []);
    setDescription(profile.storeDescription ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => { setHeaderBroken(false); }, [headerUri]);
  useEffect(() => { setLogoBroken(false); }, [logoUri]);

  const markDirty = useCallback(() => setDirty(true), []);

  const pickHeader = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setHeaderUri(uri);
    markDirty();
  };

  const addFeatured = async () => {
    if (featured.length >= 8) {
      showAlert("Limit reached", "You can add up to 8 featured photos.");
      return;
    }
    const uri = await pickImage();
    if (!uri) return;
    setFeatured((prev) => [...prev, uri]);
    markDirty();
  };

  const removeFeatured = (idx: number) => {
    setFeatured((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  // Upload destinations. The BE only accepts folders whose FIRST path segment is
  // on its public-branding allowlist (branding / branches / washers / products /
  // profiles / uploads — see media.service.ts, RISK-P0-002). These were
  // "washer-store-header" / "washer-store-featured", whose root segment is on no
  // list, so every cover and featured photo upload failed with
  // "Invalid upload destination." Nest them under `washers/` instead — widening
  // the BE allowlist would weaken a deliberate security boundary.
  const STORE_HEADER_FOLDER = "washers/store-header";
  const STORE_FEATURED_FOLDER = "washers/store-featured";
  // No logo folder: the logo is the verification selfie, written server-side.

  const uploadIfLocal = async (uri: string, folder: string): Promise<string> => {
    if (uri.startsWith("http")) return uri;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64",
    });
    const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";
    return gqlUploadMedia(base64, mimeType, folder);
  };

  const handleSave = async () => {
    // Required, with nothing behind it: the BE rejects a blank name outright and
    // her shop has no other name to be listed under. Checked here so she gets
    // the field flagged rather than a generic "Failed to save".
    if (!storeName.trim()) {
      setNameError("Enter a store name — customers see this on your profile.");
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      const uploadedHeader = headerUri ? await uploadIfLocal(headerUri, STORE_HEADER_FOLDER) : null;
      const uploadedFeatured = await Promise.all(
        featured.map((uri) => uploadIfLocal(uri, STORE_FEATURED_FOLDER))
      );
      // logoUrl is deliberately absent: it is owned by the selfie pipeline, and
      // sending the value we merely displayed would let a stale render
      // overwrite a selfie retaken since this screen loaded.
      await updateProfile({
        storeName:           storeName.trim(),
        storeHeaderUrl:      uploadedHeader,
        storeFeaturedPhotos: uploadedFeatured,
        storeDescription:    description.trim() || null,
      });
      if (uploadedHeader && uploadedHeader !== headerUri) setHeaderUri(uploadedHeader);
      setFeatured(uploadedFeatured);
      setDirty(false);
      useNotificationStore.getState().push({ type: "success", title: "Saved", message: "Your store profile has been updated." });
    } catch (err) {
      // Log it: an upload can fail for reasons the user can do nothing about
      // (bad folder, unreadable file, dead API), and a bare `catch {}` left
      // "Failed to save" as the only evidence anywhere — including the BE,
      // which never sees a request when the failure is client-side.
      console.warn("[store] save failed:", err);
      showAlert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SP._8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back + title. Two entry points now — Settings › My Online Store and
            Home's "Edit store" — so the label is generic and BackLink handles
            the no-history case (deep link, reload) instead of dead-ending. */}
        <BackLink label="Back" fallback="/(washer)/settings" />
        <Text style={styles.pageTitle}>My Online Store</Text>
        <Text style={styles.pageSub}>
          Customise how customers see your washer profile in the Lalaba app.
        </Text>

        {/* Store name — REQUIRED, and the first field on the screen because it
            is the one thing customers read before anything else. Nothing stands
            in for it: her personal name is not a shop name, and is shown to
            customers only as the separate "Operated by" line on her card. */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Store Name</Text>
          <Text style={styles.requiredTag}>Required</Text>
        </View>
        <TextInput
          style={[COMP.field, !!nameError && styles.fieldError]}
          value={storeName}
          onChangeText={(t) => {
            setStoreName(t);
            markDirty();
            // Clear the error as soon as she starts fixing it, rather than
            // leaving it up until the next save attempt.
            if (nameError && t.trim()) setNameError(null);
          }}
          placeholder="Your store name"
          maxLength={60}
          autoCapitalize="words"
        />
        <Text style={[styles.coverHint, !!nameError && styles.errorHint]}>
          {nameError ?? "Customers see this name in search and on your profile."}
        </Text>

        {/* Cover photo */}
        <Text style={styles.sectionTitle}>Cover Photo</Text>
        <TouchableOpacity style={styles.coverPickerWrap} onPress={pickHeader} activeOpacity={0.8}>
          {headerUri && !headerBroken ? (
            <Image source={{ uri: headerUri }} onError={() => setHeaderBroken(true)} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <IconCamera size={36} color={C.gray300} />
              <Text style={styles.coverPlaceholderText}>Tap to add a cover photo</Text>
            </View>
          )}
          <View style={styles.coverEditBadge}>
            <IconCamera size={16} color={C.white} />
          </View>
        </TouchableOpacity>
        <Text style={styles.coverHint}>Recommended: landscape photo, 16:9 ratio, at least 1200×675 px</Text>

        {/* Business logo — READ-ONLY, and the same image as the washer's own
            portrait (photoUrl).

            A home washer has no shopfront and no signage, so asking her to
            upload a "business mark" produced either an empty circle or a stock
            image. Her verification selfie is the honest answer: the backend
            publishes it to logoUrl and photoUrl together the moment it lands
            (see KycService.applyWasherSelfieAsPublicPhoto), so there is nothing
            to pick here. Merchant branches keep their uploader — a laundromat's
            logo really is its signage. */}
        <Text style={[styles.sectionTitle, { marginTop: SP._16 }]}>Business Logo</Text>
        <View style={styles.logoRow}>
          <View style={styles.logoPicker}>
            {logoUri && !logoBroken ? (
              <Image source={{ uri: logoUri }} onError={() => setLogoBroken(true)} style={styles.logoImg} resizeMode="cover" />
            ) : (
              <IconCamera size={26} color={C.gray300} />
            )}
          </View>
          <View style={{ flex: 1, gap: SP._4 }}>
            <Text style={styles.logoHint}>
              {logoUri
                ? "This is your verification selfie. Customers see it beside your name."
                : "Your verification selfie becomes your store logo. Take it to finish setting up your storefront."}
            </Text>
            {/* Not "Retake": once a selfie is approved the verification card
                locks, and only a reviewer rejecting it opens the camera again.
                A link promising a retake would have led to a card with no
                button on it. */}
            <TouchableOpacity onPress={() => router.push("/(washer)/verification")}>
              <Text style={styles.logoRemove}>
                {logoUri ? "View verification" : "Take your selfie"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Featured photos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Photos</Text>
          <Text style={styles.sectionCount}>{featured.length}/8</Text>
        </View>

        <View style={styles.featuredGrid}>
          {featured.map((uri, idx) => (
            <View key={`f-${idx}`} style={styles.featThumb}>
              <Image source={{ uri }} style={styles.featThumbImg} resizeMode="cover" />
              <TouchableOpacity
                style={styles.featRemoveBtn}
                onPress={() => removeFeatured(idx)}
              >
                <IconTrash size={13} color={C.white} />
              </TouchableOpacity>
            </View>
          ))}
          {featured.length < 8 && (
            <TouchableOpacity style={styles.addFeatBtn} onPress={addFeatured}>
              <IconPlus size={24} color={C.gray300} />
              <Text style={styles.addFeatText}>Add photo</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.coverHint}>
          Show customers your equipment, workspace, and finished laundry. Up to 8 photos.
        </Text>

        {/* Store description */}
        <Text style={[styles.sectionTitle, { marginTop: SP._16 }]}>Store Description</Text>
        <TextInput
          style={[COMP.field, styles.descInput]}
          value={description}
          onChangeText={(t) => { setDescription(t); markDirty(); }}
          placeholder="Tell customers about your laundry service — your experience, specialties, what makes you stand out…"
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.coverHint}>Max 400 characters — {Math.max(0, 400 - description.length)} remaining</Text>

        {/* Save + Preview buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.previewBtn]}
            onPress={() => setShowPreview(true)}
          >
            <IconEye size={18} color={TEAL} />
            <Text style={styles.previewBtnText}>View as Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: SP._40 }} />
      </ScrollView>

      {/* Customer Preview Modal */}
      {showPreview && (
        <CustomerPreview
          storeName={storeName}
          headerUri={headerUri}
          featuredUris={featured}
          description={description}
          onClose={() => setShowPreview(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  scroll: { paddingHorizontal: SP._16, paddingBottom: SP._40 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  backBtn:  { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: SP._8 },
  backText: { fontSize: 15, color: TEAL, fontWeight: "600" },

  pageTitle: { fontSize: 24, fontWeight: "700", color: C.gray900, marginBottom: 4 },
  pageSub:   { fontSize: 14, color: C.gray500, lineHeight: 20, marginBottom: SP._20 },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SP._8 },
  sectionTitle:  { fontSize: 14, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 },
  sectionCount:  { fontSize: 13, color: C.gray400, fontWeight: "600" },
  requiredTag:   { fontSize: 11, fontWeight: "700", color: C.error500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 },

  // Store name validation
  fieldError:    { borderColor: C.error500 },
  errorHint:     { color: C.error500 },

  // Cover photo
  coverPickerWrap:  { borderRadius: RADIUS.lg, overflow: "hidden", marginBottom: SP._8, position: "relative" },
  coverImg:         { width: "100%", height: 180 },
  coverPlaceholder: { width: "100%", height: 180, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", gap: SP._8, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: C.gray200, borderStyle: "dashed" },
  coverPlaceholderText: { fontSize: 13, color: C.gray400, fontWeight: "600" },
  coverEditBadge:   { position: "absolute", bottom: SP._10, right: SP._10, width: 34, height: 34, borderRadius: RADIUS.full, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  coverHint:        { fontSize: 12, color: C.gray400, marginBottom: SP._16, lineHeight: 16 },
  logoRow:          { flexDirection: "row", alignItems: "center", gap: SP._12, marginBottom: SP._16 },
  logoPicker:       { width: 76, height: 76, borderRadius: RADIUS.md, backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg:          { width: "100%", height: "100%" },
  logoHint:         { fontSize: 12, color: C.gray500, lineHeight: 16 },
  logoRemove:       { fontSize: 12, fontWeight: "700", color: C.error500 },

  // Featured photos grid
  featuredGrid:  { flexDirection: "row", flexWrap: "wrap", gap: SP._8, marginBottom: SP._8 },
  featThumb:     { width: 88, height: 88, borderRadius: RADIUS.md, overflow: "hidden", position: "relative" },
  featThumbImg:  { width: "100%", height: "100%" },
  featRemoveBtn: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: RADIUS.full, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  addFeatBtn:    { width: 88, height: 88, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  addFeatText:   { fontSize: 11, color: C.gray400 },

  // Description
  descInput: { height: 120, textAlignVertical: "top", marginBottom: SP._4 },

  // Action row
  actionRow:       { flexDirection: "row", gap: SP._10, marginTop: SP._16 },
  previewBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8, borderWidth: 1.5, borderColor: TEAL, borderRadius: RADIUS.lg, height: 48 },
  previewBtnText:  { fontSize: 14, fontWeight: "700", color: TEAL },
  saveBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: TEAL, borderRadius: RADIUS.lg, height: 48 },
  saveBtnText:     { fontSize: 14, fontWeight: "700", color: C.white },
});
