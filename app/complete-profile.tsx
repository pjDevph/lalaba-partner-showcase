// app/complete-profile.tsx
// Shown after Google Sign-In for new users who have no backend profile yet.
// Name and email are read from auth.currentUser — only phone + role collected.

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { showAlert } from "../src/lib/dialog";
import { PH_MOBILE_RE, truncatePhoneDigits } from "../src/lib/validation";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { auth } from "../src/config/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../src/stores/authStore";
import { signupRoles, type GqlRole } from "../src/services/graphql/auth";
import { LoadingOverlay } from "../src/components/LoadingOverlay";
import { C } from "../src/theme/tokens";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CompleteProfile() {
  const completeGoogleRegistration = useAuthStore((s) => s.completeGoogleRegistration);

  const firebaseUser = auth.currentUser;
  const displayName  = firebaseUser?.displayName ?? null;
  const email        = firebaseUser?.email ?? "";
  const photoURL     = firebaseUser?.photoURL ?? null;

  const [phone, setPhone]               = useState("");
  const [phoneError, setPhoneError]     = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roles, setRoles]               = useState<GqlRole[]>([]);
  const [saving, setSaving]             = useState(false);

  const phoneRef = useRef<TextInput>(null);

  useEffect(() => {
    signupRoles()
      .then((r) => {
        const filtered = r.filter((x) => x.roleId === "merchant");
        setRoles(filtered);
        const merchant = filtered.find((x) => x.roleId === "merchant");
        if (merchant) setSelectedRoleId(merchant._id);
      })
      .catch(() => {});
  }, []);

  const validate = (): boolean => {
    if (!phone.trim()) {
      setPhoneError("Mobile number is required.");
      phoneRef.current?.focus();
      return false;
    }
    if (!PH_MOBILE_RE.test(phone.trim())) {
      setPhoneError("Enter a valid mobile number (e.g. 09171234567 or 639171234567).");
      phoneRef.current?.focus();
      return false;
    }
    if (!selectedRoleId) {
      showAlert("Select a role", "Please select your role to continue.");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    let caughtErr: unknown = null;
    try {
      await completeGoogleRegistration(phone.trim(), selectedRoleId);
      router.replace("/onboarding");
    } catch (err: unknown) {
      caughtErr = err;
    } finally {
      setSaving(false);
    }

    // Show the error AFTER setSaving(false) so the LoadingOverlay modal has
    // dismissed before GlobalDialog tries to present — iOS rejects two
    // simultaneous Modal presentations (same fix as register.tsx).
    if (caughtErr) {
      const msg: string = (caughtErr as any)?.message ?? "Registration failed. Please try again.";
      showAlert("Registration failed", msg);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#00AEEF]" edges={["top", "bottom"]}>
      <LoadingOverlay visible={saving} label="Creating your account…" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Blue header ── */}
          <View className="items-center pt-10 pb-8 px-8 gap-3">
            {photoURL ? (
              <Image
                source={{ uri: photoURL }}
                className="w-20 h-20 rounded-full"
                style={{ width: 80, height: 80, borderRadius: 40 }}
              />
            ) : (
              <View
                className="items-center justify-center"
                style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <Text style={{ fontSize: 32, fontWeight: "800", color: C.white }}>
                  {initials(displayName)}
                </Text>
              </View>
            )}
            <View className="items-center gap-1">
              <Text style={{ fontSize: 18, fontWeight: "800", color: C.white }}>
                {displayName ?? "New User"}
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{email}</Text>
            </View>
            <View className="items-center gap-1 mt-1">
              <Text style={{ fontSize: 20, fontWeight: "800", color: C.white }}>
                Complete your profile
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.80)", textAlign: "center" }}>
                Just two more things to get you started.
              </Text>
            </View>
          </View>

          {/* ── White card ── */}
          <View style={{ flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: C.white }}>
          <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", padding: 24, gap: 24 }}>
            {/* Role picker */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.gray700 }}>I am a…</Text>
              <View className="flex-row gap-3">
                {roles.length === 0 ? (
                  [0, 1].map((i) => (
                    <View
                      key={i}
                      className="flex-1 rounded-2xl"
                      style={{ height: 110, backgroundColor: C.gray100 }}
                    />
                  ))
                ) : (
                  roles.map((r) => {
                    const selected = selectedRoleId === r._id;
                    return (
                      <TouchableOpacity
                        key={r._id}
                        className={`flex-1 rounded-2xl border-[1.5px] py-5 px-4 items-center gap-2 relative ${
                          selected ? "border-[#00AEEF] bg-[#E6F7FE]" : "border-[#CBD5E1] bg-white"
                        }`}
                        onPress={() => setSelectedRoleId(r._id)}
                        activeOpacity={0.8}
                      >
                        <View
                          className={`items-center justify-center rounded-full ${
                            selected ? "bg-[#00AEEF]" : "bg-[#F1F5F9]"
                          }`}
                          style={{ width: 48, height: 48 }}
                        >
                          <Ionicons
                            name="storefront-outline"
                            size={24}
                            color={selected ? C.white : C.brand500}
                          />
                        </View>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: selected ? C.brand700 : C.gray700,
                            textAlign: "center",
                          }}
                        >
                          {r.roleName.toUpperCase()}
                        </Text>
                        {selected && (
                          <View
                            className="absolute top-3 right-3 items-center justify-center rounded-full bg-[#00AEEF]"
                            style={{ width: 20, height: 20 }}
                          >
                            <Ionicons name="checkmark" size={12} color={C.white} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>

            {/* Phone field */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.gray700 }}>Mobile number</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1.5,
                  borderColor: phoneError ? C.error500 : C.gray200,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  backgroundColor: C.white,
                }}
              >
                <TextInput
                  ref={phoneRef}
                  style={{ flex: 1, paddingVertical: 14, fontSize: 15, color: C.gray900 }}
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(truncatePhoneDigits(v));
                    if (phoneError) setPhoneError("");
                  }}
                  placeholder="09171234567"
                  placeholderTextColor={C.gray400}
                  keyboardType="phone-pad"
                  maxLength={phone.startsWith("6") ? 12 : 11}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
              {phoneError ? (
                <Text style={{ fontSize: 12, color: C.error500 }}>{phoneError}</Text>
              ) : (
                <Text style={{ fontSize: 12, color: C.gray400 }}>
                  Used only for account security and recovery.
                </Text>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={{
                height: 52,
                borderRadius: 16,
                backgroundColor: saving ? C.brand400 : C.brand500,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 4,
              }}
              onPress={handleSubmit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={{ color: C.white, fontSize: 16, fontWeight: "700" }}>
                  Complete Registration
                </Text>
              )}
            </TouchableOpacity>

            {/* Info */}
            <Text style={{ fontSize: 12, color: C.gray400, textAlign: "center", lineHeight: 18 }}>
              By completing registration you agree to our{" "}
              <Text style={{ color: C.brand500, fontWeight: "600" }}>Terms & Conditions</Text>
              {" "}and{" "}
              <Text style={{ color: C.brand500, fontWeight: "600" }}>Privacy Policy</Text>.
            </Text>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
