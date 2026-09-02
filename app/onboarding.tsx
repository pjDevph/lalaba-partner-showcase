// app/onboarding.tsx
// Branch setup — shown when an authenticated merchant has no branch yet.
// Account is already created at registration; this step creates the first branch (skippable).
//
// On finish / skip → router.replace("/(tabs)/dashboard")

import React, { useState, useEffect, useCallback, useRef } from "react";
import { errField } from "../src/utils/userError";
import { auth } from "../src/config/firebase";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  useWindowDimensions,
} from "react-native";
import { showConfirm } from "../src/lib/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "../src/stores/authStore";
import { useMerchantStore } from "../src/stores/merchantStore";
import { useNotificationStore } from "../src/stores/notificationStore";
import { C, RADIUS, SHADOW, SP } from "../src/theme/tokens";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AddressPickerSection,
  StructuredAddress,
  EMPTY_ADDRESS,
} from "../src/components/AddressPicker";
import { psgcLookupCity } from "../src/utils/psgc";
import { branchSchema, mailingAddressSchema, PH_MOBILE_RE, truncatePhoneDigits, phoneFormatError } from "../src/lib/validation";

const LOGO_MARK = require("../assets/logo-mark.png");

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  SignOut: ({ c = C.gray500, s = 18 }: Readonly<{ c?: string; s?: number }>) => (
    <Ionicons name="log-out-outline" size={s} color={c} />
  ),
  Building: ({ c = C.brand500, s = 28 }: Readonly<{ c?: string; s?: number }>) => (
    <MaterialCommunityIcons name="office-building-outline" size={s} color={c} />
  ),
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const isTablet          = Math.min(width, height) >= 600;
  const isLandscape       = width > height;
  const isTabletLandscape = isTablet && isLandscape;

  const user                     = useAuthStore((s) => s.user);
  const signOut                  = useAuthStore((s) => s.signOut);
  const setBusinessSetupDeferred = useAuthStore((s) => s.setBusinessSetupDeferred);
  const setPostRegistrationFlow  = useAuthStore((s) => s.setPostRegistrationFlow);

  useEffect(() => {
    if (!user) {
      if (!auth.currentUser) router.replace("/login");
      return;
    }
    if ((user.role as string)?.toUpperCase() === "WASHER") {
      router.replace("/(washer)/dashboard");
    }
  }, [user]);

  const goFinish = () => {
    setBusinessSetupDeferred(false);
    setPostRegistrationFlow(false);
    router.replace("/(tabs)/dashboard");
  };

  const handleSignOut = () => {
    showConfirm(
      "Sign out",
      user?.email
        ? `You are signed in as ${user.email}.\n\nSign out to use a different account.`
        : "Sign out of this account?",
      () => {
        void (async () => {
          await signOut();
          router.replace("/login");
        })();
      },
      { confirmLabel: "Sign out", destructive: true }
    );
  };

  if (user && (user.role as string)?.toUpperCase() === "WASHER") return null;

  const brandHeader = (
    <View style={S.brandHeader}>
      <Image source={LOGO_MARK} style={S.brandLogo} resizeMode="contain" />
      <Text style={S.brandName}>Lalaba Partner</Text>
      <View style={{ flex: 1 }} />
      {user?.email ? (
        <Text style={S.accountEmail} numberOfLines={1}>{user.email}</Text>
      ) : null}
      <TouchableOpacity style={S.signOutBtn} onPress={handleSignOut} hitSlop={12} activeOpacity={0.7}>
        <Icon.SignOut />
        <Text style={S.signOutText}>Switch</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Tablet landscape: sidebar + detail pane ──────────────────────────────
  if (isTabletLandscape) {
    return (
      <SafeAreaView style={[S.safe, S.safeTablet]} edges={["top", "bottom"]}>
        <View style={S.splitOuter}>
          <View style={S.splitSidebar}>
            <View style={S.splitBrandRow}>
              <Image source={LOGO_MARK} style={S.splitLogo} resizeMode="contain" />
              <Text style={S.splitBrandName}>Lalaba Partner</Text>
            </View>
            <View style={S.splitDivider} />
            <Text style={S.splitBadge}>First-time setup</Text>
            <Text style={S.splitSidebarBody}>
              Set up your first branch so orders, POS, staff, and reports are connected to the right location.
              {"\n\n"}You can skip this and add a branch later in Settings → Branches.
            </Text>
            <View style={{ flex: 1 }} />
            {user?.email ? (
              <Text style={S.splitEmail} numberOfLines={1}>{user.email}</Text>
            ) : null}
            <TouchableOpacity style={S.splitSignOut} onPress={handleSignOut} activeOpacity={0.7}>
              <Icon.SignOut c={C.gray500} s={16} />
              <Text style={S.splitSignOutText}>Switch account</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={S.splitDetail} behavior="padding">
            <ScrollView
              contentContainerStyle={S.splitDetailScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={S.splitCard}>
                <View style={S.splitCardHead}>
                  <View style={S.splitIconCircle}><Icon.Building /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.stepTitle}>Set up your first branch</Text>
                    <Text style={S.stepSubtitle}>Connect orders, POS, and staff to a location.</Text>
                  </View>
                </View>
                <View style={S.cardDivider} />
                <BranchStep isTablet onDone={goFinish} onSkip={goFinish} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    );
  }

  // ── Tablet portrait: centered card ──────────────────────────────────────
  if (isTablet) {
    return (
      <SafeAreaView style={[S.safe, S.safeTablet]} edges={["top", "bottom"]}>
        {brandHeader}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={S.tabletScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={S.tabletCard}>
              <Text style={S.setupBadge}>First-time setup</Text>
              <View style={S.cardHeadRow}>
                <View style={S.iconCircle}><Icon.Building /></View>
                <View style={{ flex: 1 }}>
                  <Text style={S.stepTitle}>Set up your first branch</Text>
                  <Text style={S.stepSubtitle}>Connect orders, POS, and staff to a location.</Text>
                </View>
              </View>
              <View style={S.cardDivider} />
              <BranchStep isTablet onDone={goFinish} onSkip={goFinish} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Mobile: full-width, sticky CTA ────────────────────────────────────────
  return (
    <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
      {brandHeader}
      <View style={S.headingRow}>
        <Text style={S.setupBadge}>First-time setup</Text>
        <Text style={S.stepTitle}>Set up your first branch</Text>
        <Text style={S.stepSubtitle}>
          Connect orders, POS, and staff to a location. You can skip this and do it later.
        </Text>
      </View>
      <BranchStep onDone={goFinish} onSkip={goFinish} />
    </SafeAreaView>
  );
}

// ─── Branch setup step ────────────────────────────────────────────────────────
function BranchStep({
  onDone,
  onSkip,
  isTablet = false,
}: Readonly<{
  onDone: () => void;
  onSkip?: () => void;
  isTablet?: boolean;
}>) {
  const merchantId         = useAuthStore((s) => s.merchantId);
  const user               = useAuthStore((s) => s.user);
  const refreshMemberships = useAuthStore((s) => s.refreshMemberships);
  const addBranch          = useMerchantStore((s) => s.addBranch);
  const push               = useNotificationStore((s) => s.push);

  const [name,            setName]            = useState("");
  const [phone,           setPhone]           = useState("");
  const [phoneError,      setPhoneError]      = useState("");
  const [address,         setAddress]         = useState<StructuredAddress>(EMPTY_ADDRESS);
  const [busy,            setBusy]            = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [psgcAutoFilling, setPsgcAutoFilling] = useState(false);
  const prevCoordsRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  const handleMapChange = useCallback(async (newAddr: StructuredAddress) => {
    setAddress(newAddr);
    const coordsChanged =
      newAddr.latitude  !== prevCoordsRef.current.lat ||
      newAddr.longitude !== prevCoordsRef.current.lng;
    if (!coordsChanged) return;
    prevCoordsRef.current = { lat: newAddr.latitude, lng: newAddr.longitude };

    const nominatimCity = newAddr.cityMunicipalityName;
    if (!nominatimCity) return;

    setPsgcAutoFilling(true);
    try {
      const found = await psgcLookupCity(nominatimCity, {
        provinceName: newAddr.provinceName,
        regionName:   newAddr.regionName,
      });
      if (found) {
        setAddress(prev => ({
          ...prev,
          regionCode:           found.regionCode,
          regionName:           found.regionName,
          provinceCode:         found.provinceCode,
          provinceName:         found.provinceName,
          cityMunicipalityCode: found.cityCode,
          cityMunicipalityName: found.cityName,
          barangayCode: "",
        }));
      }
    } catch { /* silently skip */ }
    finally { setPsgcAutoFilling(false); }
  }, []);

  const isBranchNameValid = name.trim().length >= 2;
  const isPhoneValid      = PH_MOBILE_RE.test(phone.trim());
  const hasMapLocation    = Boolean(address.latitude) && Boolean(address.longitude);
  const hasAddress        = Boolean(address.cityMunicipalityCode) && Boolean(address.barangayName.trim());
  const canSubmit         = isBranchNameValid && isPhoneValid && hasMapLocation && hasAddress && !busy;

  const handleCreate = async () => {
    setShowConfirm(false);
    const nameResult = branchSchema.shape.name.safeParse(name.trim());
    if (!nameResult.success) {
      push({ type: "error", title: "Invalid branch name", message: nameResult.error.issues[0]?.message ?? "Enter a valid branch name." });
      return;
    }
    const phoneResult = branchSchema.shape.phone.safeParse(phone.trim());
    if (!phoneResult.success) {
      push({ type: "error", title: "Invalid phone number", message: phoneResult.error.issues[0]?.message ?? "Enter a valid phone number." });
      return;
    }
    if (!address.latitude || !address.longitude) {
      push({ type: "error", title: "Map location required", message: "Pin your branch location on the map." });
      return;
    }
    const geoResult = mailingAddressSchema.pick({ latitude: true, longitude: true }).safeParse(address);
    if (!geoResult.success) {
      push({ type: "error", title: "Invalid map location", message: "Please re-pin your branch location on the map." });
      return;
    }
    if (!address.cityMunicipalityCode) {
      push({ type: "error", title: "Branch address required", message: "Select at least the city / municipality." });
      return;
    }
    if (!address.barangayName.trim()) {
      push({ type: "error", title: "Branch address required", message: "Select a barangay to complete the address." });
      return;
    }
    if (!merchantId) {
      push({ type: "error", title: "Not authenticated", message: "Please sign in again." });
      return;
    }
    setBusy(true);
    try {
      await addBranch(merchantId, {
        name,
        phone: phone.trim(),
        structuredAddress: address,
        merchantType: "LAUNDROMAT",
      });
      if (user?.uid) await refreshMemberships(user.uid).catch(() => {});
      push({ type: "success", title: "Branch created!", message: name.trim() });
      onDone();
    } catch (err: unknown) {
      const isConflict = errField(err, "code") === "CONFLICT" || errField(err, "message")?.toLowerCase().includes("already exist");
      push({ type: "error", title: "Could not create branch", message: isConflict ? "A branch with this name already exists." : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const fields = (
    <>
      <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
        <Text style={{ color: "#EF4444", fontWeight: "700" }}>*</Text> Required fields
      </Text>

      <Text style={S.fieldLabel}>Branch Name<Text style={{ color: "#EF4444", fontWeight: "700" }}> *</Text></Text>
      <TextInput
        style={S.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Main Branch, SM North Outlet"
        placeholderTextColor={C.gray400}
        returnKeyType="next"
        autoFocus={!isTablet}
      />

      <Text style={S.fieldLabel}>Branch Phone Number<Text style={{ color: "#EF4444", fontWeight: "700" }}> *</Text></Text>
      <TextInput
        style={[S.input, !!phoneError && { borderColor: C.error500 }]}
        value={phone}
        onChangeText={(v) => {
          const digits = truncatePhoneDigits(v);
          setPhone(digits);
          setPhoneError(phoneFormatError(digits));
        }}
        onBlur={() => {
          if (phone && !PH_MOBILE_RE.test(phone)) {
            setPhoneError("Enter a valid mobile number (e.g. 09171234567 or 639171234567).");
          }
        }}
        placeholder="09XXXXXXXXX or 639XXXXXXXXX"
        placeholderTextColor={C.gray400}
        keyboardType="phone-pad"
        maxLength={phone.startsWith("6") ? 12 : 11}
        returnKeyType="next"
      />
      {!!phoneError && <Text style={{ fontSize: 12, color: C.error500, marginTop: 4 }}>{phoneError}</Text>}

      <View style={{ marginTop: SP._8, gap: SP._12 }}>
        <AddressPickerSection
          value={address}
          onChange={handleMapChange}
          variant="map"
        />
        {psgcAutoFilling && (
          <View style={S.psgcAutoFillRow}>
            <ActivityIndicator size="small" color={C.brand500} />
            <Text style={S.psgcAutoFillText}>Detecting address from location…</Text>
          </View>
        )}
        <AddressPickerSection
          value={address}
          onChange={setAddress}
          variant="mailing"
          requireDetails
        />
      </View>
    </>
  );

  const primaryCta = (
    <TouchableOpacity
      style={[S.primaryBtn, !canSubmit && S.primaryBtnDisabled]}
      onPress={() => setShowConfirm(true)}
      disabled={!canSubmit}
      activeOpacity={0.85}
    >
      {busy
        ? <ActivityIndicator color={C.white} />
        : <Text style={[S.primaryBtnText, !canSubmit && S.primaryBtnTextDisabled]}>
            {canSubmit ? "Create Branch & Continue" : "Complete required fields"}
          </Text>
      }
    </TouchableOpacity>
  );

  const confirmModal = (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
      <View style={S.confirmBackdrop}>
        <View style={S.confirmCard}>
          <Text style={S.confirmTitle}>Review branch details</Text>
          <Text style={S.confirmSub}>Confirm these details before creating your branch.</Text>

          <View style={S.confirmSection}>
            <Text style={S.confirmSectionLabel}>Branch name</Text>
            <Text style={S.confirmSectionValue}>{name.trim()}</Text>
          </View>
          <View style={S.confirmSection}>
            <Text style={S.confirmSectionLabel}>Phone</Text>
            <Text style={S.confirmSectionValue}>{phone.trim()}</Text>
          </View>
          {!!address.displayName && (
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Map location</Text>
              <Text style={S.confirmSectionValue}>{address.displayName}</Text>
            </View>
          )}
          {!!address.unit.trim() && (
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>House No. / Unit / Floor</Text>
              <Text style={S.confirmSectionValue}>{address.unit.trim()}</Text>
            </View>
          )}
          {!!address.street.trim() && (
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>Street / Road / Building</Text>
              <Text style={S.confirmSectionValue}>{address.street.trim()}</Text>
            </View>
          )}
          <View style={S.confirmSection}>
            <Text style={S.confirmSectionLabel}>Barangay</Text>
            <Text style={S.confirmSectionValue}>{address.barangayName}</Text>
          </View>
          <View style={S.confirmSection}>
            <Text style={S.confirmSectionLabel}>Municipality / City</Text>
            <Text style={S.confirmSectionValue}>{address.cityMunicipalityName}</Text>
          </View>
          <View style={S.confirmSection}>
            <Text style={S.confirmSectionLabel}>Province</Text>
            <Text style={S.confirmSectionValue}>{address.provinceName}</Text>
          </View>
          {!!address.zipCode.trim() && (
            <View style={S.confirmSection}>
              <Text style={S.confirmSectionLabel}>ZIP / Postal Code</Text>
              <Text style={S.confirmSectionValue}>{address.zipCode.trim()}</Text>
            </View>
          )}

          <View style={S.confirmBtns}>
            <TouchableOpacity style={S.confirmBtnGhost} onPress={() => setShowConfirm(false)} activeOpacity={0.8}>
              <Text style={S.confirmBtnGhostText}>Go back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.confirmBtnPrimary} onPress={() => void handleCreate()} activeOpacity={0.85} disabled={busy}>
              {busy
                ? <ActivityIndicator color={C.white} />
                : <Text style={S.confirmBtnPrimaryText}>Confirm &amp; Create</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isTablet) {
    return (
      <>
        {fields}
        {primaryCta}
        {onSkip && (
          <TouchableOpacity onPress={onSkip} style={S.skipBtn} activeOpacity={0.7}>
            <Text style={S.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        )}
        <Text style={S.reassureText}>You can add a branch later in Settings → Branches.</Text>
        {confirmModal}
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={S.stepBody} keyboardShouldPersistTaps="handled">
        {fields}
        <View style={{ height: 80 }} />
      </ScrollView>
      <View style={S.mobileStickyBar}>
        {onSkip ? (
          <View style={S.stickyBtnRow}>
            <TouchableOpacity onPress={onSkip} style={S.skipBtnAlt} activeOpacity={0.7}>
              <Text style={S.skipBtnAltText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.primaryBtn, S.stickyCtaFlex, !canSubmit && S.primaryBtnDisabled]}
              onPress={() => setShowConfirm(true)}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {busy
                ? <ActivityIndicator color={C.white} />
                : <Text style={[S.primaryBtnText, !canSubmit && S.primaryBtnTextDisabled]}>
                    {canSubmit ? "Create Branch" : "Complete fields"}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        ) : primaryCta}
        <Text style={S.reassureText}>You can add a branch later in Settings → Branches.</Text>
      </View>
      {confirmModal}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.white },
  safeTablet: { backgroundColor: C.gray50 },

  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP._24,
    paddingTop: SP._12,
    paddingBottom: SP._8,
    gap: SP._8,
  },
  brandLogo:    { width: 28, height: 28, tintColor: C.brand500 },
  brandName:    { fontSize: 15, fontWeight: "700", color: C.brand500, letterSpacing: -0.3 },
  accountEmail: { fontSize: 11, color: C.gray400, fontWeight: "500", maxWidth: 120, flexShrink: 1 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SP._10,
    paddingVertical: SP._6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: C.gray50,
  },
  signOutText: { fontSize: 12, fontWeight: "600", color: C.gray500 },

  setupBadge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: C.brand700,
    backgroundColor: C.brand50,
    borderRadius: 12,
    paddingHorizontal: SP._10,
    paddingVertical: SP._4,
    marginBottom: SP._8,
    overflow: "hidden",
  },

  headingRow: {
    paddingHorizontal: SP._24,
    paddingVertical: SP._16,
  },
  stepTitle:    { fontSize: 20, fontWeight: "800", color: C.gray900, marginBottom: SP._4 },
  stepSubtitle: { fontSize: 14, color: C.gray500, lineHeight: 20 },

  tabletScroll: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: SP._24,
    paddingHorizontal: SP._24,
  },
  tabletCard: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: SP._24,
    ...SHADOW.lg,
  },
  cardHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SP._16,
    marginBottom: SP._4,
  },
  cardDivider: { height: 1, backgroundColor: C.gray100, marginVertical: SP._16 },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP._20,
    alignSelf: "flex-start",
  },

  stepBody: { paddingHorizontal: SP._24, paddingBottom: 40 },

  mobileStickyBar: {
    paddingHorizontal: SP._20,
    paddingVertical: SP._12,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    backgroundColor: C.white,
  },
  stickyBtnRow: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  stickyCtaFlex: { flex: 1, marginTop: 0 },

  skipBtnAlt: {
    height: 52,
    paddingHorizontal: SP._20,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: C.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtnAltText: { fontSize: 14, fontWeight: "700", color: C.gray700 },

  skipBtn: { alignItems: "center", paddingVertical: SP._12 },
  skipBtnText: { fontSize: 14, fontWeight: "600", color: C.gray400 },

  reassureText: {
    fontSize: 12,
    color: C.gray400,
    textAlign: "center",
    marginTop: SP._8,
    lineHeight: 18,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray700,
    marginBottom: SP._6,
    marginTop: SP._16,
  },
  input: {
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SP._14,
    paddingVertical: SP._12,
    fontSize: 15,
    color: C.gray900,
    backgroundColor: C.gray50,
  },

  primaryBtn: {
    backgroundColor: C.brand500,
    borderRadius: RADIUS.lg,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SP._24,
    ...SHADOW.brand,
  },
  primaryBtnText:         { fontSize: 15, fontWeight: "700", color: C.white },
  primaryBtnDisabled:     { backgroundColor: C.gray200, shadowOpacity: 0, elevation: 0 },
  primaryBtnTextDisabled: { color: C.gray400 },

  psgcAutoFillRow:  { flexDirection: "row", alignItems: "center", gap: SP._8, paddingHorizontal: SP._4 },
  psgcAutoFillText: { fontSize: 12, color: C.brand500, fontWeight: "500" },

  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: SP._24,
  },
  confirmCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: SP._20,
    width: "100%",
    maxWidth: 460,
    ...SHADOW.lg,
  },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  confirmSub:   { fontSize: 13, color: C.gray500, marginTop: 4, marginBottom: SP._12 },
  confirmSection: { marginBottom: SP._14 },
  confirmSectionLabel: { fontSize: 12, color: C.gray500, marginBottom: SP._6 },
  confirmSectionValue: { fontSize: 14, fontWeight: "600", color: C.gray800 },
  confirmBtns:  { flexDirection: "row", gap: SP._12, marginTop: SP._20 },
  confirmBtnGhost: {
    flex: 1,
    height: 50,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: C.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnGhostText:   { fontSize: 15, fontWeight: "700", color: C.gray700 },
  confirmBtnPrimary: {
    flex: 1.4,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnPrimaryText: { fontSize: 15, fontWeight: "700", color: C.white },

  // Tablet landscape split view
  splitOuter:   { flex: 1, flexDirection: "row" },
  splitSidebar: {
    width: 260,
    backgroundColor: C.white,
    borderRightWidth: 1,
    borderRightColor: C.gray100,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  splitBrandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, marginBottom: 16 },
  splitLogo:     { width: 28, height: 28 },
  splitBrandName: { fontSize: 15, fontWeight: "800", color: C.gray900, letterSpacing: -0.3 },
  splitDivider:  { height: 1, backgroundColor: C.gray100, marginBottom: 16 },
  splitBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: C.brand500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  splitSidebarBody: {
    fontSize: 13,
    color: C.gray500,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  splitEmail: { fontSize: 11, color: C.gray400, paddingHorizontal: 8, marginBottom: 6 },
  splitSignOut: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 10 },
  splitSignOutText: { fontSize: 12, fontWeight: "600", color: C.gray500 },
  splitDetail:       { flex: 1, backgroundColor: C.gray50 },
  splitDetailScroll: { flexGrow: 1, alignItems: "center", paddingVertical: 24, paddingHorizontal: 24 },
  splitCard: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: SP._24,
    ...SHADOW.lg,
  },
  splitCardHead: { flexDirection: "row", alignItems: "flex-start", gap: SP._16, marginBottom: SP._4 },
  splitIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
});
