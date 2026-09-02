// app/verify-email.tsx
// Shown after email/password registration.
// User must verify their email before continuing to onboarding.
// Google-registered users are already verified and skip this screen.

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../src/config/firebase";
import { sendEmailVerification } from "firebase/auth";
import { useAuthStore } from "../src/stores/authStore";
import { C, SP, RADIUS } from "../src/theme/tokens";

const LOGO_MARK = require("../assets/logo-mark.png");

const POLL_INTERVAL_MS = 4000;

export default function VerifyEmailScreen() {
  const user                     = useAuthStore((s) => s.user);
  const signOut                  = useAuthStore((s) => s.signOut);
  const setBusinessSetupDeferred = useAuthStore((s) => s.setBusinessSetupDeferred);
  const setPostRegistrationFlow  = useAuthStore((s) => s.setPostRegistrationFlow);
  const email             = user?.email ?? auth.currentUser?.email ?? "";
  const [verified, setVerified]   = useState(false);
  const [checking, setChecking]   = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ─── Poll Firebase every 4 s; auto-advance once emailVerified ────────────
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        await auth.currentUser?.reload();
        if (!active) return;
        if (auth.currentUser?.emailVerified) {
          setVerified(true);
          return;
        }
      } catch { /* best-effort */ }
      if (active) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);

  // ─── Resend cooldown countdown ────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ─── Manual check ─────────────────────────────────────────────────────────
  const handleCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        setVerified(true);
      } else {
        setError("Email not verified yet. Check your inbox and click the link.");
      }
    } catch {
      setError("Could not check verification status. Try again.");
    } finally {
      setChecking(false);
    }
  }, []);

  // ─── Resend ───────────────────────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setError(null);
    try {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
      setResendCooldown(60);
    } catch {
      setError("Could not resend email. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  }, [resendCooldown]);

  // ─── Sign out ─────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [signOut]);

  // ─── Post-verification branch setup choice ────────────────────────────────
  const handleSetupNow = useCallback(() => {
    router.replace("/onboarding");
  }, []);

  const handleSetupLater = useCallback(() => {
    setBusinessSetupDeferred(true);
    setPostRegistrationFlow(false);
    router.replace(
      (user?.role?.toUpperCase() === "WASHER" ? "/(washer)/dashboard" : "/(tabs)/dashboard") as any,
    );
  }, [user, setBusinessSetupDeferred, setPostRegistrationFlow]);

  // ─── Verified success screen ──────────────────────────────────────────────
  if (verified) {
    // Washers have no branches — offering them "Set Up My First Branch" sent a
    // home washer into the merchant onboarding form.
    const isWasher = user?.role?.toUpperCase() === "WASHER";
    return (
      <SafeAreaView style={S.safe}>
        <View style={S.content}>
          <Image source={LOGO_MARK} style={S.logo} resizeMode="contain" />
          <View style={S.iconRing}>
            <Text style={S.iconEmoji}>✅</Text>
          </View>
          <Text style={S.title}>Email Verified!</Text>
          <Text style={S.sub}>
            {isWasher
              ? `Your account is activated and ready.\nSet up your profile to start accepting orders.`
              : `Your account is activated and ready.\nSet up your first branch to start accepting orders.`}
          </Text>
          <TouchableOpacity
            style={S.primaryBtn}
            onPress={isWasher ? handleSetupLater : handleSetupNow}
            activeOpacity={0.85}
          >
            <Text style={S.primaryBtnText}>
              {isWasher ? "Go to My Dashboard" : "Set Up My First Branch"}
            </Text>
          </TouchableOpacity>
          {!isWasher && (
            <TouchableOpacity style={S.secondaryBtn} onPress={handleSetupLater} activeOpacity={0.75}>
              <Text style={S.secondaryBtnText}>{"I'll set it up later"}</Text>
            </TouchableOpacity>
          )}
          <Text style={S.note}>You can always complete setup from your dashboard at any time.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe}>
      <View style={S.content}>
        <Image source={LOGO_MARK} style={S.logo} resizeMode="contain" />

        <View style={S.iconRing}>
          <Text style={S.iconEmoji}>✉️</Text>
        </View>

        <Text style={S.title}>Check your email</Text>
        <Text style={S.sub}>
          We sent a verification link to{"\n"}
          <Text style={S.email}>{email}</Text>
        </Text>
        <Text style={S.hint}>
          Click the link in the email to verify your account, then tap the button below.
        </Text>

        {!!error && <Text style={S.error}>{error}</Text>}

        <TouchableOpacity
          style={[S.primaryBtn, checking && S.btnDisabled]}
          onPress={handleCheck}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking
            ? <ActivityIndicator color={C.white} />
            : <Text style={S.primaryBtnText}>I&apos;ve verified my email</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.secondaryBtn, (resending || resendCooldown > 0) && S.btnDisabled]}
          onPress={handleResend}
          disabled={resending || resendCooldown > 0}
          activeOpacity={0.75}
        >
          {resending
            ? <ActivityIndicator color={C.brand500} />
            : <Text style={S.secondaryBtnText}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
              </Text>}
        </TouchableOpacity>

        <TouchableOpacity style={S.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={S.signOutText}>Sign out and use a different account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: C.white },
  content:        { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._24, paddingBottom: SP._32, width: "100%", maxWidth: 480, alignSelf: "center" },
  logo:           { width: 48, height: 48, marginBottom: SP._24 },
  iconRing:       { width: 72, height: 72, borderRadius: 36, backgroundColor: C.brand50, alignItems: "center", justifyContent: "center", marginBottom: SP._20 },
  iconEmoji:      { fontSize: 32 },
  title:          { fontSize: 22, fontWeight: "700", color: C.gray900, textAlign: "center", marginBottom: SP._8 },
  sub:            { fontSize: 14, color: C.gray600, textAlign: "center", lineHeight: 20, marginBottom: SP._8 },
  email:          { fontWeight: "600", color: C.gray800 },
  hint:           { fontSize: 13, color: C.gray400, textAlign: "center", lineHeight: 18, marginBottom: SP._24 },
  error:          { fontSize: 13, color: C.error500, textAlign: "center", marginBottom: SP._12 },
  primaryBtn:     { backgroundColor: C.brand500, borderRadius: RADIUS.lg, height: 48, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: SP._12 },
  primaryBtnText: { color: C.white, fontSize: 15, fontWeight: "600" },
  secondaryBtn:   { borderWidth: 1.5, borderColor: C.brand500, borderRadius: RADIUS.lg, height: 48, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: SP._24 },
  secondaryBtnText:{ color: C.brand500, fontSize: 15, fontWeight: "500" },
  btnDisabled:    { opacity: 0.5 },
  signOutBtn:     { marginTop: SP._8 },
  signOutText:    { fontSize: 13, color: C.gray400, textDecorationLine: "underline" },
  note:           { fontSize: 12, color: C.gray400, textAlign: "center", lineHeight: 18, marginTop: SP._24 },
});
