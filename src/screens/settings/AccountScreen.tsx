// Account settings screen (profile, font size, account deletion) — extracted from settings.tsx.
import React, { useState } from "react";
import { errField } from "../../utils/userError";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../../config/firebase";
import { C, SP } from "../../theme/tokens";
import { HeroHeader } from "../../components/ui";
import { showAlert } from "../../lib/dialog";
import { nameFormatError, phoneFormatError, truncatePhoneDigits } from "../../lib/validation";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { gqlUpdateUser, gqlRequestAccountDeletion, gqlAccountDeletionBlockers, type UpdateAddressInput } from "../../services/graphql/auth";
import { ApiError, ApiErrorBlocker } from "../../config/graphql";
import { useAuthStore } from "../../stores/authStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { AddressPickerSection, EMPTY_ADDRESS, formatStructuredAddress, type StructuredAddress } from "../../components/AddressPicker";
import { I } from "./shared";
import { S } from "./styles";
import { BiometricToggle } from "../../components/BiometricToggle";
import { toUserMessage } from "../../utils/userError";

function addressFromUser(u: { homeAddress?: { unit: string | null; streetAddress: string | null; barangayName: string | null; barangayCode: string | null; cityMunicipalityName: string | null; cityMunicipalityCode: string | null; provinceName: string | null; provinceCode: string | null; regionName: string | null; regionCode: string | null; zipCode: string | null } | null } | null | undefined): StructuredAddress {
  const ha = u?.homeAddress;
  return {
    ...EMPTY_ADDRESS,
    unit: ha?.unit ?? "",
    street: ha?.streetAddress ?? "",
    zipCode: ha?.zipCode ?? "",
    barangayName: ha?.barangayName ?? "",
    barangayCode: ha?.barangayCode ?? "",
    cityMunicipalityName: ha?.cityMunicipalityName ?? "",
    cityMunicipalityCode: ha?.cityMunicipalityCode ?? "",
    provinceName: ha?.provinceName ?? "",
    provinceCode: ha?.provinceCode ?? "",
    regionName: ha?.regionName ?? "",
    regionCode: ha?.regionCode ?? "",
  };
}

function toHomeAddress(a: StructuredAddress): UpdateAddressInput {
  return {
    unit: a.unit.trim() || undefined,
    streetAddress: a.street.trim(),
    barangayName: a.barangayName || undefined,
    barangayCode: a.barangayCode || undefined,
    cityMunicipalityName: a.cityMunicipalityName || undefined,
    cityMunicipalityCode: a.cityMunicipalityCode || undefined,
    provinceName: a.provinceName || undefined,
    provinceCode: a.provinceCode || undefined,
    regionName: a.regionName || undefined,
    regionCode: a.regionCode || undefined,
    zipCode: a.zipCode || undefined,
  };
}

export function AccountScreenInline({
  onBack, onNavigateToBranches, onNavigateToStaff,
}: Readonly<{ onBack: () => void; onNavigateToBranches?: () => void; onNavigateToStaff?: () => void }>) {
  const user             = useAuthStore((s) => s.user);
  const role             = useAuthStore((s) => s.role);

  const merchant         = useMerchantStore((s) => s.profile);
  const isOwner = role !== "STAFF";



  const [profileEditing, setProfileEditing] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [savingAddress,  setSavingAddress]  = useState(false);

  const [firstName,     setFirstName]     = useState(user?.firstName ?? "");
  const [lastName,      setLastName]      = useState(user?.lastName ?? "");
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError,  setLastNameError]  = useState("");
  const [phone,         setPhone]         = useState(merchant?.phone ?? "");
  const [phoneError,    setPhoneError]    = useState("");
  const [savedFirstName, setSavedFirstName] = useState(user?.firstName ?? "");
  const [savedLastName,  setSavedLastName]  = useState(user?.lastName ?? "");
  const [savedPhone,     setSavedPhone]     = useState(merchant?.phone ?? "");

  const [homeAddress,      setHomeAddress]      = useState<StructuredAddress>(() => addressFromUser(user));
  const [savedHomeAddress, setSavedHomeAddress] = useState<StructuredAddress>(() => addressFromUser(user));

  const profileDirty = firstName.trim() !== savedFirstName.trim()
    || lastName.trim() !== savedLastName.trim()
    || phone.trim() !== savedPhone.trim();
  const addressDirty = JSON.stringify(homeAddress) !== JSON.stringify(savedHomeAddress);

  const [showChangePassword,   setShowChangePassword]   = useState(false);

  const [deleting,      setDeleting]      = useState(false);
  const [checkingBlockers, setCheckingBlockers] = useState(false);
  const [deleteStep,    setDeleteStep]    = useState<0 | 1 | 2>(0);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [blockers,      setBlockers]      = useState<ApiErrorBlocker[]>([]);
  const signOut = useAuthStore((s) => s.signOut);

  // Only email/password accounts can re-authenticate with a password (used to
  // gate both Change Password and Deactivate Account). A Google-only account
  // has none to check — sending those through Contact Support instead of a
  // fake/skippable password field.
  const isPasswordAccount = (auth.currentUser?.providerData ?? []).some(
    (p) => p.providerId === "password"
  );

  // Informational only — there is no automated purge/expiry on the backend yet.
  // A disabled account is restored by support/an admin, not by a countdown.
  const supportRecoveryWindow = "30 days";

  const handleSaveProfile = async () => {
    if (!isOwner || !profileDirty || !!phoneError || !!firstNameError || !!lastNameError) return;
    setSavingProfile(true);
    try {
      await gqlUpdateUser({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phoneNumber: phone.trim() || undefined,
      });
      setSavedFirstName(firstName.trim());
      setSavedLastName(lastName.trim());
      setSavedPhone(phone.trim());
      useAuthStore.setState((s) => s.user ? {
        user: {
          ...s.user,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          displayName: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
        },
      } : {});
      setProfileEditing(false);
      useNotificationStore.getState().push({ type: "success", title: "Saved", message: "Profile updated successfully." });
    } catch {
      showAlert("Could not save profile", "Please check your details and try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelProfile = () => {
    setFirstName(savedFirstName);
    setLastName(savedLastName);
    setPhone(savedPhone);
    setPhoneError("");
    setFirstNameError("");
    setLastNameError("");
    setProfileEditing(false);
  };

  const handleSaveAddress = async () => {
    if (!isOwner || !addressDirty) return;
    setSavingAddress(true);
    try {
      await gqlUpdateUser({ homeAddress: toHomeAddress(homeAddress) });
      setSavedHomeAddress(homeAddress);
      setAddressEditing(false);
      useNotificationStore.getState().push({ type: "success", title: "Saved", message: "Home address updated successfully." });
    } catch {
      showAlert("Could not save address", "Please check your details and try again.");
    } finally {
      setSavingAddress(false);
    }
  };

  const handleCancelAddress = () => {
    setHomeAddress(savedHomeAddress);
    setAddressEditing(false);
  };

  // Pre-check before entering the deactivate flow: if wind-down steps are
  // still open, show the checklist instead of the confirmation modals. The
  // mutation re-runs the same guards at commit time, so this is UX-only.
  const handleDeleteEntry = () => {
    // Deactivation permanently erases PII — only an account that can
    // re-authenticate with a password gets the self-service flow. A
    // Google-only sign-in has no password to verify, so route those to
    // support rather than skip re-auth entirely.
    if (!isPasswordAccount) {
      showAlert(
        "Contact support to deactivate",
        "This account signs in with Google and has no password to verify. Contact support to deactivate it."
      );
      return;
    }
    void (async () => {
      setCheckingBlockers(true);
      try {
        const found = await gqlAccountDeletionBlockers();
        if (found.length > 0) {
          setBlockers(found);
          return;
        }
        setDeletePassword("");
        setDeletePasswordError("");
        setDeleteStep(1);
      } catch {
        // Advisory only — if the pre-check itself fails (offline, older
        // backend), let the flow open; the mutation still enforces blockers.
        setDeletePassword("");
        setDeletePasswordError("");
        setDeleteStep(1);
      } finally {
        setCheckingBlockers(false);
      }
    })();
  };

  const handleDeleteConfirm = () => {
    if (!deletePassword) return;
    void (async () => {
      setDeleting(true);
      setDeletePasswordError("");
      try {
        // Re-authenticate before an irreversible, PII-erasing action — proves
        // whoever is holding this signed-in device actually knows the account
        // password, not just that the session happens to still be active.
        const email = auth.currentUser?.email;
        if (!auth.currentUser || !email) throw new Error("no-session");
        await reauthenticateWithCredential(
          auth.currentUser,
          EmailAuthProvider.credential(email, deletePassword)
        );

        // Disables login on the backend (and Firebase) — does NOT delete the
        // Firebase identity. Calling auth.currentUser?.delete() here would
        // destroy the login identity while leaving the backend record (and all
        // business data) untouched, orphaning the account.
        await gqlRequestAccountDeletion();
        await signOut();
      } catch (err: unknown) {
        setDeleting(false);
        if (errField(err, "code") === "auth/wrong-password" || errField(err, "code") === "auth/invalid-credential") {
          setDeletePasswordError("Incorrect password.");
          return;
        }
        setDeleteStep(0);
        setDeletePassword("");
        // Blocker rejections (active orders/branches/staff, unpaid balance, etc.)
        // come back as a 400 with a structured checklist — show that instead of
        // a generic failure so the user knows exactly what to resolve first.
        // Fall back to the server's own message (not a hardcoded string) for a
        // 400 with no checklist attached, so a real reason is never silently
        // swallowed behind a generic alert.
        if (err instanceof ApiError && err.status === 400 && err.blockers?.length) {
          setBlockers(err.blockers);
        } else if (err instanceof ApiError && err.status === 400 && errField(err, "message")) {
          // Structured 400 with a single message but no checklist — surface it
          // in the same blocking panel (sanitised) instead of a raw alert.
          setBlockers([{
            code: "DELETION_BLOCKED",
            message: toUserMessage(err, "Your account can't be deactivated yet. Please resolve any active orders, branches, or balances first."),
            count: 1,
            ids: [],
          }]);
        } else {
          showAlert("Could not deactivate account", "Please try again or contact support for help.");
        }
      }
    })();
  };

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <HeroHeader
        compact
        noWave
        title="Account"
        subtitle="Manage your profile and preferences"
        onBack={onBack}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: C.gray100, maxWidth: 880, width: "100%", alignSelf: "center" }}
          contentContainerStyle={{ padding: SP._16, paddingBottom: 60, alignItems: "stretch" }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ maxWidth: 640, width: "100%", alignSelf: "center" }}>
          {isOwner && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._12 }}>
                <Text style={S.subGroupLabel}>PROFILE</Text>
                <TouchableOpacity
                  onPress={() => (profileEditing ? handleCancelProfile() : setProfileEditing(true))}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  {profileEditing ? <I.X c={C.gray400} /> : <I.Edit c={C.brand500} />}
                </TouchableOpacity>
              </View>
              <View style={S.subCard}>
                {profileEditing ? (
                  <>
                    <View style={{ padding: SP._16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gray100 }}>
                      <Text style={S.fieldLabel}>First Name</Text>
                      <TextInput
                        style={[S.bFieldInput, !!firstNameError && { borderColor: C.error500 }]}
                        value={firstName}
                        onChangeText={(v) => {
                          setFirstName(v);
                          setFirstNameError(nameFormatError(v));
                        }}
                        placeholder="First name"
                        placeholderTextColor={C.gray400}
                        autoCapitalize="words"
                      />
                      {!!firstNameError && <Text style={{ color: C.error500, fontSize: 12, marginTop: 4 }}>{firstNameError}</Text>}
                    </View>
                    <View style={{ padding: SP._16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gray100 }}>
                      <Text style={S.fieldLabel}>Last Name</Text>
                      <TextInput
                        style={[S.bFieldInput, !!lastNameError && { borderColor: C.error500 }]}
                        value={lastName}
                        onChangeText={(v) => {
                          setLastName(v);
                          setLastNameError(nameFormatError(v));
                        }}
                        placeholder="Last name"
                        placeholderTextColor={C.gray400}
                        autoCapitalize="words"
                      />
                      {!!lastNameError && <Text style={{ color: C.error500, fontSize: 12, marginTop: 4 }}>{lastNameError}</Text>}
                    </View>
                    <View style={{ padding: SP._16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gray100 }}>
                      <Text style={S.fieldLabel}>Phone</Text>
                      <TextInput
                        style={[S.bFieldInput, !!phoneError && { borderColor: C.error500 }]}
                        value={phone}
                        onChangeText={(v) => {
                          const digits = truncatePhoneDigits(v);
                          setPhone(digits);
                          setPhoneError(phoneFormatError(digits));
                        }}
                        placeholder="09171234567 or 639171234567"
                        placeholderTextColor={C.gray400}
                        keyboardType="phone-pad"
                        maxLength={phone.startsWith("6") ? 12 : 11}
                      />
                      {!!phoneError && <Text style={{ color: C.error500, fontSize: 12, marginTop: 4 }}>{phoneError}</Text>}
                    </View>
                    <View style={{ padding: SP._16 }}>
                      <TouchableOpacity
                        style={[S.saveBtn, (!profileDirty || savingProfile || !!phoneError || !!firstNameError || !!lastNameError) && { opacity: 0.4 }]}
                        onPress={() => void handleSaveProfile()}
                        disabled={!profileDirty || savingProfile || !!phoneError || !!firstNameError || !!lastNameError}
                        activeOpacity={0.8}
                      >
                        {savingProfile
                          ? <ActivityIndicator color={C.white} size="small" />
                          : <Text style={S.saveBtnText}>Save</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={S.infoRow}>
                      <Text style={S.infoLabel}>First Name</Text>
                      <Text style={S.infoValue} numberOfLines={1}>{savedFirstName || "—"}</Text>
                    </View>
                    <View style={[S.divider, { marginHorizontal: SP._16 }]} />
                    <View style={S.infoRow}>
                      <Text style={S.infoLabel}>Last Name</Text>
                      <Text style={S.infoValue} numberOfLines={1}>{savedLastName || "—"}</Text>
                    </View>
                    <View style={[S.divider, { marginHorizontal: SP._16 }]} />
                    <View style={S.infoRow}>
                      <Text style={S.infoLabel}>Phone</Text>
                      <Text style={S.infoValue} numberOfLines={1}>{savedPhone || "—"}</Text>
                    </View>
                  </>
                )}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._12, marginTop: SP._20 }}>
                <Text style={S.subGroupLabel}>HOME ADDRESS</Text>
                <TouchableOpacity
                  onPress={() => (addressEditing ? handleCancelAddress() : setAddressEditing(true))}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  {addressEditing ? <I.X c={C.gray400} /> : <I.Edit c={C.brand500} />}
                </TouchableOpacity>
              </View>
              <View style={S.subCard}>
                {addressEditing ? (
                  <View style={{ padding: SP._16 }}>
                    <AddressPickerSection
                      value={homeAddress}
                      onChange={setHomeAddress}
                      variant="mailing"
                      label="Home Address"
                    />
                    <TouchableOpacity
                      style={[S.saveBtn, { marginTop: SP._12 }, (!addressDirty || savingAddress) && { opacity: 0.4 }]}
                      onPress={() => void handleSaveAddress()}
                      disabled={!addressDirty || savingAddress}
                      activeOpacity={0.8}
                    >
                      {savingAddress
                        ? <ActivityIndicator color={C.white} size="small" />
                        : <Text style={S.saveBtnText}>Save</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ padding: SP._16 }}>
                    <Text style={{ fontSize: 13, color: C.gray800, lineHeight: 19 }}>
                      {formatStructuredAddress(savedHomeAddress) || "Not set"}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          <Text style={[S.subGroupLabel, { marginBottom: SP._12 }]}>ACCOUNT</Text>
          <View style={S.subCard}>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>Email</Text>
              <Text style={S.infoValue} numberOfLines={1}>{user?.email ?? "—"}</Text>
            </View>
            <View style={[S.divider, { marginHorizontal: SP._16 }]} />

          </View>

          {/* ── Security ── */}
          <Text style={[S.subGroupLabel, { marginBottom: SP._12, marginTop: SP._20 }]}>SECURITY</Text>
          <View style={S.subCard}>
            <BiometricToggle />
            {isPasswordAccount && (
              <>
                <View style={[S.divider, { marginHorizontal: SP._16 }]} />
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", padding: SP._16, gap: SP._12 }}
                  onPress={() => setShowChangePassword(true)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray900 }}>Change Password</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      Update the password you use to sign in.
                    </Text>
                  </View>
                  <I.Chevron c={C.gray300} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* ── Danger Zone ── */}
          <Text style={[S.subGroupLabel, { marginBottom: SP._12, marginTop: SP._20, color: C.error500 }]}>DANGER ZONE</Text>
          <View style={[S.subCard, { borderWidth: 1, borderColor: C.error100 }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", padding: SP._16, gap: SP._12 }}
              onPress={handleDeleteEntry}
              disabled={deleting || checkingBlockers}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.error500 }}>Deactivate Account</Text>
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                  Disables your login immediately. Contact support within {supportRecoveryWindow} if you change your mind.
                </Text>
              </View>
              {deleting || checkingBlockers
                ? <ActivityIndicator color={C.error500} size="small" />
                : <I.Chevron c={C.error500} />
              }
            </TouchableOpacity>
          </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Deactivate Account: Step 1 — Impact & Recovery ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={deleteStep === 1}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteStep(0)}
      >
        <View style={S.deleteModalOverlay}>
          <View style={S.deleteModalCard}>
            <Text style={S.deleteModalTitle}>Deactivate Account?</Text>
            <Text style={S.deleteModalBody}>
              Your login access will be disabled immediately. Your business workspace and required records will remain available.
            </Text>

            <View style={S.deleteImpactBox}>
              <Text style={S.deleteImpactHeading}>What happens</Text>
              {[
                "You'll be signed out immediately",
                "You will no longer be able to log in",
                "Business and transaction records will be retained",
                "Staff access will continue unless separately removed",
              ].map((line) => (
                <View key={line} style={S.deleteImpactRow}>
                  <Text style={S.deleteImpactBullet}>·</Text>
                  <Text style={S.deleteImpactText}>{line}</Text>
                </View>
              ))}
            </View>

            <View style={S.deleteRecoveryBox}>
              <Text style={S.deleteRecoveryLabel}>Changed your mind?</Text>
              <Text style={S.deleteRecoveryValue}>Contact support</Text>
              <Text style={S.deleteRecoveryHint}>
                Contact support within {supportRecoveryWindow} to request reactivation. After that, some records may no longer be recoverable — required transaction, security, and accounting records are retained regardless.
              </Text>
            </View>

            <View style={S.deleteModalActions}>
              <TouchableOpacity
                style={S.deleteModalBtnSecondary}
                onPress={() => setDeleteStep(0)}
                activeOpacity={0.8}
              >
                <Text style={S.deleteModalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={S.deleteModalBtnPrimary}
                onPress={() => setDeleteStep(2)}
                activeOpacity={0.8}
              >
                <Text style={S.deleteModalBtnPrimaryText}>Review & Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Deactivate Account: Step 2 — password confirmation ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={deleteStep === 2}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteStep(1)}
      >
        <KeyboardAvoidingView style={S.deleteModalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={S.deleteModalCard}>
            <Text style={S.deleteModalTitle}>Final Confirmation</Text>
            <Text style={S.deleteModalBody}>
              Enter your password to confirm deactivation.
            </Text>

            <View style={{ position: "relative", marginBottom: SP._8 }}>
              <TextInput
                style={[
                  S.deleteConfirmInput,
                  { textAlign: "left", letterSpacing: 0, paddingRight: 44, marginBottom: 0 },
                  !!deletePasswordError && { borderColor: C.error500 },
                ]}
                value={deletePassword}
                onChangeText={(v) => { setDeletePassword(v); setDeletePasswordError(""); }}
                placeholder="Password"
                placeholderTextColor={C.gray400}
                secureTextEntry={!showDeletePassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={{ position: "absolute", right: SP._12, top: 0, bottom: 0, justifyContent: "center" }}
                onPress={() => setShowDeletePassword((v) => !v)}
                activeOpacity={0.7}
              >
                <I.Eye visible={showDeletePassword} c={deletePasswordError ? C.error500 : C.gray400} />
              </TouchableOpacity>
            </View>
            {!!deletePasswordError && (
              <Text style={{ color: C.error500, fontSize: 12, marginBottom: SP._12 }}>{deletePasswordError}</Text>
            )}

            <View style={S.deleteRecoveryBox}>
              <Text style={S.deleteRecoveryLabel}>Changed your mind?</Text>
              <Text style={[S.deleteRecoveryValue, { fontSize: 15 }]}>Contact support</Text>
              <Text style={S.deleteRecoveryHint}>Contact support within {supportRecoveryWindow} to request reactivation.</Text>
            </View>

            <View style={S.deleteModalActions}>
              <TouchableOpacity
                style={S.deleteModalBtnSecondary}
                onPress={() => setDeleteStep(1)}
                activeOpacity={0.8}
              >
                <Text style={S.deleteModalBtnSecondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  S.deleteModalBtnDanger,
                  (!deletePassword || deleting) && { opacity: 0.4 },
                ]}
                onPress={handleDeleteConfirm}
                disabled={!deletePassword || deleting}
                activeOpacity={0.8}
              >
                {deleting
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={S.deleteModalBtnDangerText}>Deactivate Account</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Deactivate Account: blocked — wind-down checklist ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={blockers.length > 0}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockers([])}
      >
        <View style={S.deleteModalOverlay}>
          <View style={S.deleteModalCard}>
            <View style={S.deleteModalHeader}>
              <Text style={[S.deleteModalTitle, { flex: 1, marginBottom: 0 }]}>Complete these steps first</Text>
              <TouchableOpacity
                style={S.deleteModalCloseBtn}
                onPress={() => setBlockers([])}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close"
              >
                <Text style={S.deleteModalCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={S.deleteModalBody}>
              Before you can deactivate your account:
            </Text>

            <View style={S.deleteImpactBox}>
              {blockers.map((b) => (
                <View key={b.code} style={S.deleteImpactRow}>
                  <View style={S.deleteStepCheckbox} />
                  <Text style={S.deleteImpactText}>{b.message}</Text>
                </View>
              ))}
            </View>

            <View style={S.deleteModalActionsStacked}>
              {blockers.some((b) => b.code === "ACTIVE_BRANCH_EXISTS") && onNavigateToBranches && (
                <TouchableOpacity
                  style={S.deleteModalBtnPrimaryStacked}
                  onPress={() => { setBlockers([]); onNavigateToBranches(); }}
                  activeOpacity={0.8}
                >
                  <Text style={S.deleteModalBtnPrimaryText}>Manage Branches</Text>
                </TouchableOpacity>
              )}
              {blockers.some((b) => b.code === "ACTIVE_STAFF_EXISTS") && onNavigateToStaff && (
                <TouchableOpacity
                  style={S.deleteModalBtnPrimaryStacked}
                  onPress={() => { setBlockers([]); onNavigateToStaff(); }}
                  activeOpacity={0.8}
                >
                  <Text style={S.deleteModalBtnPrimaryText}>Manage Staff</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

    </SafeAreaView>
  );
}
