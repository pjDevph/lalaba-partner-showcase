// app/register.tsx
// Merchant sign-up — 3 steps (email) or 1 step (Google):
//   1. Account Details — owner name, email, password, mobile  [email only]
//   2. Shop Details   — shop name, address, services, pickup/delivery
//   3. Verify & Finish — Terms & Conditions + Privacy Policy

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Dimensions,
  InteractionManager,
} from "react-native";
import { showAlert } from "../src/lib/dialog";
import { notify } from "../src/stores/notificationStore";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuthStore } from "../src/stores/authStore";
import { useAuth } from "../src/hooks/useAuth";
import { LoadingOverlay } from "../src/components/LoadingOverlay";
import { C } from "../src/theme/tokens";
import { S } from "../src/screens/register/styles";
import { I, LogoMark, Stepper, getAuthRedirectRoute, type Step } from "../src/screens/register/shared";
import { legalModalContent, type LegalModal } from "../src/screens/register/legalContent";
import { emailFormatError, friendlyRegisterError, isEmailTakenError } from "../src/screens/register/helpers";
import { RegistrationSuccess } from "../src/screens/register/RegistrationSuccess";
import { RoleStep } from "../src/screens/register/RoleStep";
import { ReviewStep } from "../src/screens/register/ReviewStep";
import { AccountStep } from "../src/screens/register/AccountStep";
import { signupRoles, type GqlRole } from "../src/services/graphql/auth";
import { ApiError } from "../src/config/graphql";
import { z } from "zod";
import { registerSchema, PH_MOBILE_RE } from "../src/lib/validation";


// Roles are static — cache at module level so the network call only happens once
// per app session regardless of how many times the register screen mounts.
let _rolesCache: GqlRole[] | null = null;


export default function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const setBusinessSetupDeferred  = useAuthStore((s) => s.setBusinessSetupDeferred);
  const setPostRegistrationFlow   = useAuthStore((s) => s.setPostRegistrationFlow);
  const existingUser = useAuthStore((s) => s.user);
  const postRegistrationFlow = useAuthStore((s) => s.postRegistrationFlow);
  const { signInWithGoogle, completeGoogleRegistration, isLoading: googleLoading } = useAuth();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isGoogleFlow = flow === "google";

  // ─── Field refs for keyboard navigation ──────────────────────────────────
  const firstNameRef   = useRef<TextInput>(null);
  const lastNameRef    = useRef<TextInput>(null);
  const emailRef       = useRef<TextInput>(null);
  const mobileRef      = useRef<TextInput>(null);
  const passwordRef    = useRef<TextInput>(null);
  const confirmRef     = useRef<TextInput>(null);

  // ─── Responsive layout ────────────────────────────────────────────────────
  // Track only isLandscape so keyboard open/close (which doesn't flip
  // portrait↔landscape) never triggers a layout re-render.
  // Tablet detection uses the SHORT side (min dimension) — the Android sw600dp
  // standard. Using max would flag tall phones (e.g. Samsung A54 ~851dp tall)
  // as tablets, sending them into the tablet portrait branch incorrectly.
  const [isLandscape, setIsLandscape] = useState(() => {
    const { width, height } = Dimensions.get("screen");
    return width > height;
  });
  const isTablet = useMemo(() => {
    const { width, height } = Dimensions.get("screen");
    return Math.min(width, height) >= 600;
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => {
      setIsLandscape(screen.width > screen.height);
    });
    return () => sub.remove();
  }, []);

  const isTabletPortrait  = isTablet && !isLandscape;
  // Phone in landscape uses the same split-pane (info on the left) as the login
  // screen — just scaled down to fit the shorter viewport.
  const isPhoneLandscape  = isLandscape && !isTablet;
  const insets = useSafeAreaInsets();

  // Only auto-redirect if this is NOT a fresh registration (postRegistrationFlow
  // is true during the window between register() completing and the user
  // choosing "Set up now / later" — without this guard the redirect fires
  // immediately after register() sets existingUser, skipping the success page).
  useEffect(() => {
    if (!existingUser || isGoogleFlow || postRegistrationFlow) return;
    router.replace(getAuthRedirectRoute(existingUser.role as string) as any);
  }, [existingUser, isGoogleFlow, postRegistrationFlow]);

  // Role selection always comes first (step 1), even for Google flow
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  // ─── Role data (fetched on mount — public query, no auth needed) ──────────
  const [roles, setRoles] = useState<GqlRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  // "network" covers everything that isn't a rate limit — the previous
  // version collapsed a 429 into the same "check your connection" message as
  // a real network failure, which is actively misleading: signupRoles is one
  // of the few unauthenticated ops (see GqlThrottlerGuard), rate-limited by
  // IP, and mobile carriers NAT many subscribers behind one address — a
  // cluster of testers on the same carrier can trip it without either of
  // them actually having a bad connection.
  const [rolesError, setRolesError] = useState<"network" | "rate-limited" | null>(null);

  // signupRoles is the very first network request the app makes — fired the
  // instant this screen mounts, often before a real device's radio has
  // finished settling after a cold launch (OS reports "connected" a beat
  // before DNS/routing is actually usable). A single failed attempt here used
  // to surface immediately as a hard, unrecoverable error; a couple of quick
  // silent retries absorb that startup blip instead of walling the user out
  // on the very first screen. A 429 is a real rate limit, not a transient
  // blip, so it skips the retry loop and surfaces right away.
  const fetchRoles = useCallback((force = false) => {
    if (!force && _rolesCache) {
      setRoles(_rolesCache);
      const merchant = _rolesCache.find((x) => x.roleId === "merchant");
      if (merchant) setSelectedRoleId(merchant._id);
      return;
    }
    setRolesError(null);

    const attempt = (retriesLeft: number): void => {
      signupRoles()
        .then((r) => {
          _rolesCache = r;
          setRoles(r);
          const merchant = r.find((x) => x.roleId === "merchant");
          if (merchant) setSelectedRoleId(merchant._id);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 429) {
            setRolesError("rate-limited");
            return;
          }
          if (retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), 1500);
            return;
          }
          setRolesError("network");
        });
    };
    attempt(2);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        firstNameRef.current?.focus();
      });
      return () => task.cancel();
    }, [])
  );
  useEffect(() => {
    if (step !== 2) return;
    const t = setTimeout(() => firstNameRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [step]);

  const [registrationComplete, setRegistrationComplete] = useState(false);

  // Step 2 — Account Details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 3 — Verify & Finish
  const [agreeTerms, setAgreeTerms]         = useState(false);
  const [agreePrivacy, setAgreePrivacy]     = useState(false);
  const [termsScrolled, setTermsScrolled]   = useState(false);
  const [privacyScrolled, setPrivacyScrolled] = useState(false);
  const [legalModal, setLegalModal]         = useState<LegalModal>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateStep1 = useCallback((): boolean => {
    if (!selectedRoleId) {
      setErrors({ role: "Please choose your role to continue." });
      return false;
    }
    setErrors({});
    return true;
  }, [selectedRoleId]);

  const validateStep2 = useCallback((): boolean => {
    const result = registerSchema.safeParse({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      password,
      confirmPassword: confirm,
    });
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);
      setErrors({
        firstName:       fieldErrors.firstName?.[0]       ?? "",
        lastName:        fieldErrors.lastName?.[0]        ?? "",
        email:           fieldErrors.email?.[0]           ?? "",
        mobile:          fieldErrors.mobile?.[0]          ?? "",
        password:        fieldErrors.password?.[0]        ?? "",
        confirm:         fieldErrors.confirmPassword?.[0] ?? "",
      });
      return false;
    }
    setErrors({});
    return true;
  }, [firstName, lastName, email, mobile, password, confirm]);

  const handleEmailBlur = useCallback(() => {
    setErrors((prev) => ({ ...prev, email: emailFormatError(email) }));
  }, [email]);

  const handleMobileBlur = useCallback(() => {
    const trimmed = mobile.trim();
    if (!trimmed) return;
    if (!PH_MOBILE_RE.test(trimmed)) {
      setErrors((prev) => ({ ...prev, mobile: "Enter a valid mobile number (e.g. 09171234567 or 639171234567)." }));
    } else {
      setErrors((prev) => ({ ...prev, mobile: "" }));
    }
  }, [mobile]);

  // ─── Navigation ───────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    setErrors({});
    if (step === 1 && validateStep1()) {
      // Google flow: skip account details (Step 2), go straight to T&C (Step 3)
      setStep(isGoogleFlow ? 3 : 2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  }, [step, isGoogleFlow, validateStep1, validateStep2]);

  const handleBack = useCallback(() => {
    setErrors({});
    if (step === 1) router.back();
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(isGoogleFlow ? 1 : 2);
  }, [step, isGoogleFlow]);

  // ─── Auth handlers ────────────────────────────────────────────────────────
  // NOTE: these only perform the request. Showing the success screen is done by
  // handleRegister *after* the loading overlay has dismissed (see below) so the
  // overlay Modal isn't unmounted mid-animation on iOS.
  const submitEmailRegistration = useCallback(async () => {
    await register(email.trim().toLowerCase(), password, firstName.trim(), lastName.trim(), mobile.trim(), selectedRoleId);
  }, [email, password, firstName, lastName, mobile, selectedRoleId, register]);

  const submitGoogleRegistration = useCallback(async () => {
    await completeGoogleRegistration(mobile.trim(), selectedRoleId);
  }, [mobile, selectedRoleId, completeGoogleRegistration]);

  const handleRegister = useCallback(async () => {
    if (!agreeTerms || !agreePrivacy) {
      showAlert(
        "Agreement required",
        "Please accept the Terms and Privacy Policy to continue.",
      );
      return;
    }

    setSaving(true);
    let caughtErr: unknown = null;

    try {
      if (isGoogleFlow) await submitGoogleRegistration();
      else await submitEmailRegistration();
    } catch (err: unknown) {
      caughtErr = err;
    } finally {
      setSaving(false);
    }

    if (caughtErr) {
      const message = friendlyRegisterError(caughtErr);
      // Google flow has no editable email field (it comes from the Google
      // account) — nothing to route back to, so it keeps the modal.
      if (!isGoogleFlow && isEmailTakenError(caughtErr)) {
        setErrors((prev) => ({ ...prev, email: message }));
        setStep(1);
        notify.error("Registration failed", message);
        requestAnimationFrame(() => emailRef.current?.focus());
      } else {
        // setSaving(false) above and this showAlert() both land in the same
        // React batch, so the LoadingOverlay Modal is still mid-dismiss at
        // the native layer when GlobalDialog's Modal tries to present —
        // iOS rejects the second presentation ("already presenting...") and
        // the error silently never appears. Wait out the dismiss animation
        // (iOS default modal transition is ~350ms) before presenting.
        setTimeout(() => showAlert("Registration failed", message), 350);
      }
    } else {
      // Success. setSaving(false) above starts the LoadingOverlay Modal's
      // fade-out. Swapping to the success screen in the same frame would
      // unmount that Modal mid-animation — iOS renders that as a flicker.
      // Wait out the fade (~350ms, same as the error path) so the overlay
      // dismisses cleanly, then show the success screen.
      setTimeout(() => setRegistrationComplete(true), 350);
    }
  }, [
    isGoogleFlow,
    agreeTerms,
    agreePrivacy,
    submitGoogleRegistration,
    submitEmailRegistration,
  ]);

  // The selected role decides every downstream string and route. Washers have
  // no branches, so the merchant-only "first branch" copy and the /onboarding
  // branch form must not be shown to them.
  const isWasherSignup =
    roles.find((r) => r._id === selectedRoleId)?.roleId === "washer";

  const handleSetupNow = useCallback(() => {
    setRegistrationComplete(false);
    // Google users are pre-verified — go straight to setup.
    // Email/password users must verify first.
    if (!isGoogleFlow) {
      router.replace("/verify-email");
      return;
    }
    // /onboarding is the merchant branch form; a washer sets up their profile.
    router.replace((isWasherSignup ? "/(washer)/profile" : "/onboarding") as any);
  }, [isGoogleFlow, isWasherSignup]);

  const handleSetupLater = useCallback(() => {
    setBusinessSetupDeferred(true);
    setPostRegistrationFlow(false);
    setRegistrationComplete(false);
    // On a fresh signup there is no existingUser yet, so fall back to the role
    // that was actually chosen rather than assuming merchant.
    router.replace(
      getAuthRedirectRoute(
        existingUser?.role ?? (isWasherSignup ? "washer" : "merchant"),
      ) as any,
    );
  }, [existingUser, isWasherSignup, setBusinessSetupDeferred, setPostRegistrationFlow]);

  // ─── CTA label + action ───────────────────────────────────────────────────
  const ctaLabel = (() => {
    if (step === 1) return "Continue";
    if (step === 2) return "Continue to Review";
    return isGoogleFlow ? "Complete Setup" : "Create Partner Account";
  })();

  const pwRules = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^a-zA-Z0-9]/.test(password),
  };

  // Derived from the SAME schema validateStep2 enforces. These were two hand-kept
  // rule sets and they drifted: the local copy had no name-format rule, so a name
  // with digits left the CTA enabled while validateStep2 refused, and its error
  // rendered on a field scrolled off-screen above the fixed button bar — the press
  // looked like a dead button. One source of truth means they cannot drift again.
  const isStep2Valid = registerSchema.safeParse({
    firstName:       firstName.trim(),
    lastName:        lastName.trim(),
    email:           email.trim(),
    mobile:          mobile.trim(),
    password,
    confirmPassword: confirm,
  }).success;

  const ctaDisabled =
    saving ||
    (step === 2 && !isStep2Valid) ||
    (step === 3 && (!agreeTerms || !agreePrivacy));

  const handleCta = step === 3 ? handleRegister : handleNext;

  // ─── Step labels for the stepper ─────────────────────────────────────────
  const stepLabels: Record<Step, string> = {
    1: "Choose your role",
    2: "Sign-in details",
    3: "Review details",
  };

  const PANEL_STEPS = ["Account details", "Shop profile", "Review & submit"];

  // ─── Card form content ────────────────────────────────────────────────────
  // For Google flow, always show step 1 of 1 in stepper
  const stepperStep  = isGoogleFlow ? 1 : step;

  const formCard = (
    <View style={[
      S.card,
      isLandscape       && S.cardLandscape,
      isTabletPortrait  && S.cardTabletPortrait,
      !isTablet && !isLandscape && S.mobileCard,
    ]}>
      {/* Stepper — tablet only; phone shows step progress in the hero (portrait)
          or the left brand panel (landscape) */}
      {isTablet && (
        <Stepper
          step={stepperStep}
          total={isGoogleFlow ? 1 : 3}
          label={stepLabels[step]}
        />
      )}

      {/* ── Step 1: Role Picker ── */}
      {step === 1 && (
        <RoleStep
          roles={roles}
          rolesError={rolesError}
          onRetry={() => fetchRoles(true)}
          selectedRoleId={selectedRoleId}
          setSelectedRoleId={setSelectedRoleId}
          roleError={errors.role}
          isGoogleFlow={isGoogleFlow}
          googleLoading={googleLoading}
          onGoogleSignIn={() => { if (!validateStep1()) return; signInWithGoogle(); }}
        />
      )}

      {/* ── Step 2: Account Details ── */}
      {step === 2 && (
        <AccountStep
          grid={isLandscape}
          values={{ firstName, lastName, email, mobile, password, confirm }}
          onChange={{ firstName: setFirstName, lastName: setLastName, email: setEmail, mobile: setMobile, password: setPassword, confirm: setConfirm }}
          refs={{ firstName: firstNameRef, lastName: lastNameRef, email: emailRef, mobile: mobileRef, password: passwordRef, confirm: confirmRef }}
          errors={errors}
          setErrors={setErrors}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          showConfirm={showConfirm}
          setShowConfirm={setShowConfirm}
          pwRules={pwRules}
          onEmailBlur={handleEmailBlur}
          onMobileBlur={handleMobileBlur}
          onSubmit={handleNext}
        />
      )}

      {/* ── Step 3: Review & Submit ── */}
      {step === 3 && (
        <ReviewStep
          firstName={firstName}
          lastName={lastName}
          email={email}
          mobile={mobile}
          roleName={roles.find((r) => r._id === selectedRoleId)?.roleName ?? "—"}
          isGoogleFlow={isGoogleFlow}
          agreeTerms={agreeTerms}
          agreePrivacy={agreePrivacy}
          onEditAccount={() => { setErrors({}); setStep(2); }}
          onEditRole={() => { setErrors({}); setStep(1); }}
          onOpenTerms={() => { setTermsScrolled(false); setLegalModal("terms"); }}
          onOpenPrivacy={() => { setPrivacyScrolled(false); setLegalModal("privacy"); }}
        />
      )}

      {/* ── Card footer CTA — tablet only ── */}
      {isTablet && (
        <View style={S.cardFooter}>
          <View style={S.cardFooterLine} />
          <View style={S.cardFooterRow}>
            <TouchableOpacity
              style={S.cardBackBtn}
              onPress={step === 1 ? () => router.back() : handleBack}
              activeOpacity={0.7}
            >
              {step > 1 && <I.Back c={C.brand500} />}
              <Text style={S.cardBackText}>
                {step === 1 ? "Sign in instead" : "Back"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[S.cardCtaBtn, ctaDisabled && S.ctaDisabled]}
              onPress={handleCta}
              disabled={ctaDisabled}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={C.white} />
                : <Text style={S.ctaText}>{ctaLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // ─── Sticky CTA bar — mobile only ─────────────────────────────────────────
  const stickyBar = !isTablet ? (
    <View style={[S.stickyBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
      {step > 1 ? (
        <View style={S.stickyBtnRow}>
          <TouchableOpacity onPress={handleBack} style={S.cardBackBtn} activeOpacity={0.7}>
            <I.Back c={C.brand500} />
            <Text style={S.cardBackText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.cta, S.stickyCtaFlex, ctaDisabled && S.ctaDisabled]}
            onPress={handleCta}
            disabled={ctaDisabled}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={S.ctaText}>{ctaLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[S.cta, ctaDisabled && S.ctaDisabled]}
          onPress={handleCta}
          disabled={ctaDisabled}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <Text style={S.ctaText}>{ctaLabel}</Text>
          )}
        </TouchableOpacity>
      )}

      {step === 1 && (
        <TouchableOpacity
          onPress={() => router.back()}
          style={S.signinRow}
        >
          <Text style={S.signinText}>
            Already have an account?{" "}
            <Text style={S.signinLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  // ─── Render: Registration Success ────────────────────────────────────────
  if (registrationComplete) {
    return (
      <RegistrationSuccess
        landscape={isLandscape}
        isGoogleFlow={isGoogleFlow}
        isWasher={isWasherSignup}
        onSetupNow={handleSetupNow}
        onSetupLater={handleSetupLater}
      />
    );
  }

  // ─── Render: Landscape split-pane (tablet + phone) ────────────────────────
  // Any device in landscape gets the "info on the left" split layout, mirroring
  // the login screen. Phone landscape just scales the brand panel down.
  if (isLandscape) {
    return (
      <SafeAreaView className="flex-1 bg-[#00AEEF]" edges={["top", "bottom"]}>
        <LoadingOverlay visible={saving} label="Creating your account…" />
        <KeyboardAvoidingView
          className="flex-1"
          behavior="padding"
        >
          <View className="flex-1 flex-row">
            {/* Left brand panel */}
            <View style={[S.landscapePanel, isPhoneLandscape && S.landscapePanelSmall]}>
              <LogoMark size={isPhoneLandscape ? 36 : 44} />
              <Text style={[S.panelAppName, isPhoneLandscape && S.panelAppNameSmall]}>Lalaba Partner</Text>
              <Text style={[S.panelTitle, isPhoneLandscape && S.panelTitleSmall]}>Create your{"\n"}shop account</Text>
              <Text style={[S.panelSub, isPhoneLandscape && S.panelSubSmall]}>
                Get started in a few{"\n"}simple steps.
              </Text>

              {/* Step progress */}
              {!isGoogleFlow && (
                <View style={[S.panelStepList, isPhoneLandscape && S.panelStepListSmall]}>
                  {PANEL_STEPS.map((name, i) => {
                    const stepNum = i + 1;
                    const done    = stepNum < step;
                    const active  = stepNum === step;
                    return (
                      <View key={name} style={S.panelStepRow}>
                        <View style={[S.panelStepBubble, done && S.panelStepBubbleDone, active && S.panelStepBubbleActive]}>
                          {done
                            ? <I.Check s={10} c={C.brand500} />
                            : <Text style={[S.panelStepNum, active && S.panelStepNumActive]}>{stepNum}</Text>}
                        </View>
                        <Text style={[S.panelStepLabel, active && S.panelStepLabelActive]}>{name}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                onPress={() => showAlert("Merchant Support", "Need help registering?\n\nEmail: support@lalaba.com\nHours: Mon–Sat, 8AM–8PM")}
                style={[S.panelSupport, isPhoneLandscape && S.panelSupportSmall]}
              >
                <Text style={S.panelSupportText}>Need help? Contact support</Text>
              </TouchableOpacity>
            </View>

            {/* Right column: ScrollView + sticky bar */}
            <View className="flex-1 bg-[#F8FAFC]">
              <ScrollView
                className="flex-1"
                contentContainerStyle={[S.landscapeScroll, isPhoneLandscape && S.landscapeScrollSmall]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {formCard}
              </ScrollView>
              {stickyBar}
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Modals */}

        {legalModalContent(legalModal, setLegalModal, termsScrolled, setTermsScrolled, privacyScrolled, setPrivacyScrolled, agreeTerms, setAgreeTerms, agreePrivacy, setAgreePrivacy)}
      </SafeAreaView>
    );
  }

  // ─── Render: Tablet Portrait ──────────────────────────────────────────────
  if (isTabletPortrait) {
    return (
      <SafeAreaView className="flex-1 bg-[#00AEEF]" edges={["top", "bottom"]}>
        <LoadingOverlay visible={saving} label="Creating your account…" />
        <KeyboardAvoidingView
          className="flex-1"
          behavior="padding"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={S.tabletPortraitScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Blue header */}
            <View style={S.hero}>
              <LogoMark size={44} />
              <Text style={S.heroTitle}>Create your account</Text>
              <Text style={S.heroSub}>Set up your shop in 3 quick steps</Text>
            </View>

            {/* White card centered */}
            <View style={S.tabletPortraitCardWrap}>
              {formCard}
            </View>
          </ScrollView>

          {/* Sticky bar below the ScrollView */}
          {stickyBar}
        </KeyboardAvoidingView>


        {legalModalContent(legalModal, setLegalModal, termsScrolled, setTermsScrolled, privacyScrolled, setPrivacyScrolled, agreeTerms, setAgreeTerms, agreePrivacy, setAgreePrivacy)}
      </SafeAreaView>
    );
  }

  // ─── Render: Mobile (default) ─────────────────────────────────────────────
  const laterStepTitle = step === 2 ? "Account Details" : "Review & Submit";
  const heroTitle = step === 1 ? "Create Account" : laterStepTitle;
  return (
    <SafeAreaView className="flex-1 bg-[#00AEEF]" edges={["top"]}>
      <LoadingOverlay visible={saving} label="Creating your account…" />

      {/* Fixed blue hero with step progress indicator */}
      <View style={S.hero}>
        <LogoMark size={36} />
        <Text style={S.heroTitle}>
          {heroTitle}
        </Text>
        {!isGoogleFlow && (
          <View style={S.heroSteps}>
            {[1, 2, 3].map(n => (
              <View
                key={n}
                style={[
                  S.heroStep,
                  n < step && S.heroStepDone,
                  n === step && S.heroStepActive,
                ]}
              />
            ))}
          </View>
        )}
        <Text style={S.heroSub}>
          {isGoogleFlow
            ? "Finish setting up your account"
            : `Step ${step} of 3 · ${stepLabels[step]}`}
        </Text>
      </View>

      {/* White sheet — overlaps hero by 18px via marginTop: -18 */}
      <KeyboardAvoidingView style={S.mobFormArea} behavior="padding">
        <ScrollView
          style={S.mobScroll}
          contentContainerStyle={S.mobScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formCard}
        </ScrollView>
        {stickyBar}
      </KeyboardAvoidingView>

      {legalModalContent(legalModal, setLegalModal, termsScrolled, setTermsScrolled, privacyScrolled, setPrivacyScrolled, agreeTerms, setAgreeTerms, agreePrivacy, setAgreePrivacy)}
    </SafeAreaView>
  );
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

