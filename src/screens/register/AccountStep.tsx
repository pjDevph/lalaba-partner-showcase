// Step 2 — account details form (name, mobile, email, password). Extracted from app/register.tsx.
// State lives in RegisterScreen; passed as grouped objects (values/onChange/refs) to keep
// the interface explicit and swap-resistant, then destructured back to local names here.
import React, { type RefObject, type Dispatch, type SetStateAction } from "react";
import { View, Text, TextInput } from "react-native";
import { Field, PasswordRules, type PwRules } from "./shared";
import { phoneFormatError, nameFormatError } from "../../lib/validation";
import { emailFormatError, capitalizeWords } from "./helpers";
import { S } from "./styles";

type Str6 = { firstName: string; lastName: string; email: string; mobile: string; password: string; confirm: string };
type Setter6 = { firstName: (v: string) => void; lastName: (v: string) => void; email: (v: string) => void; mobile: (v: string) => void; password: (v: string) => void; confirm: (v: string) => void };
type Ref6 = { firstName: RefObject<TextInput | null>; lastName: RefObject<TextInput | null>; email: RefObject<TextInput | null>; mobile: RefObject<TextInput | null>; password: RefObject<TextInput | null>; confirm: RefObject<TextInput | null> };

export function AccountStep({
  grid, values, onChange, refs, errors, setErrors,
  showPassword, setShowPassword, showConfirm, setShowConfirm, pwRules,
  onEmailBlur, onMobileBlur, onSubmit,
}: Readonly<{
  grid: boolean; values: Str6; onChange: Setter6; refs: Ref6;
  errors: Record<string, string>; setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  showPassword: boolean; setShowPassword: Dispatch<SetStateAction<boolean>>;
  showConfirm: boolean; setShowConfirm: Dispatch<SetStateAction<boolean>>;
  pwRules: PwRules; onEmailBlur: () => void; onMobileBlur: () => void; onSubmit: () => void;
}>) {
  const isTabletLandscape = grid;
  const { firstName, lastName, email, mobile, password, confirm } = values;
  const { firstName: setFirstName, lastName: setLastName, email: setEmail, mobile: setMobile, password: setPassword, confirm: setConfirm } = onChange;
  const { firstName: firstNameRef, lastName: lastNameRef, email: emailRef, mobile: mobileRef, password: passwordRef, confirm: confirmRef } = refs;
  return (
        <View>
          <Text style={S.stepTitle}>Set up your account</Text>
          <Text style={S.stepSub}>Add your name, contact number, email, and password.</Text>
          <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
            <Text style={{ color: "#EF4444", fontWeight: "700" }}>*</Text> Required fields
          </Text>

          {(() => {
            // Fields are defined ONCE here; the `isTabletLandscape` flag controls
            // the only genuine per-layout differences (required-asterisk labels,
            // 2-column grid vs stacked, and the mobile hint / password placeholder).
            const asterisk = isTabletLandscape ? " *" : "";
            const firstNameField = (
              <Field
                ref={firstNameRef}
                label={`First name${asterisk}`}
                value={firstName}
                onChange={(v) => {
                  setFirstName(capitalizeWords(v));
                  // Live, like the mobile field: the CTA disables on a bad name,
                  // so without this the form would refuse to advance in silence.
                  setErrors((p) => ({ ...p, firstName: nameFormatError(v) }));
                }}
                placeholder="Juan"
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                error={errors.firstName}
              />
            );
            const lastNameField = (
              <Field
                ref={lastNameRef}
                label={`Last name${asterisk}`}
                value={lastName}
                onChange={(v) => {
                  setLastName(capitalizeWords(v));
                  setErrors((p) => ({ ...p, lastName: nameFormatError(v) }));
                }}
                placeholder="dela Cruz"
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => mobileRef.current?.focus()}
                error={errors.lastName}
              />
            );
            const mobileField = (
              <Field
                ref={mobileRef}
                label={`Mobile number${asterisk}`}
                value={mobile}
                onChange={(v) => {
                  setMobile(v);
                  setErrors((p) => ({ ...p, mobile: phoneFormatError(v) }));
                }}
                onBlur={onMobileBlur}
                placeholder="09171234567"
                keyboardType="phone-pad"
                autoCapitalize="none"
                numeric
                maxLength={mobile.startsWith("6") ? 12 : 11}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                hint={isTabletLandscape
                  ? "Used only for account security and recovery. Local (09...) or country-code (639...) format."
                  : (errors.mobile ? undefined : "Local (09...) or country-code (639...) format.")}
                error={errors.mobile}
              />
            );
            const emailField = (
              <Field
                ref={emailRef}
                label={`Email address${asterisk}`}
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setErrors((p) => ({ ...p, email: emailFormatError(v) }));
                }}
                onBlur={onEmailBlur}
                placeholder="juan@myshop.com"
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                error={errors.email}
              />
            );
            const passwordField = (
              <Field
                ref={passwordRef}
                label={`Password${asterisk}`}
                value={password}
                onChange={setPassword}
                placeholder={isTabletLandscape ? "Min 8 chars, A-Z, 0-9, symbol" : "Min 8 chars, A-Z, a-z, 0-9, symbol"}
                secure
                showToggle={showPassword}
                onToggleSecure={() => setShowPassword((v) => !v)}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                error={errors.password}
                autoCapitalize="none"
              />
            );
            const pwRulesEl = password.length > 0
              ? <PasswordRules rules={pwRules} style={isTabletLandscape ? undefined : { marginTop: 4, marginBottom: 4 }} />
              : null;
            const confirmField = (
              <Field
                ref={confirmRef}
                label={`Confirm password${asterisk}`}
                value={confirm}
                onChange={setConfirm}
                placeholder="Re-enter your password"
                secure
                showToggle={showConfirm}
                onToggleSecure={() => setShowConfirm((v) => !v)}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                error={
                  confirm.length > 0 && confirm !== password
                    ? "Passwords do not match."
                    : errors.confirm
                }
                success={
                  confirm.length > 0 && confirm === password ? "Passwords match" : undefined
                }
                autoCapitalize="none"
              />
            );

            return isTabletLandscape ? (
              <>
                <View style={S.gridRow}>
                  <View style={S.gridCell}>{firstNameField}</View>
                  <View style={S.gridCell}>{lastNameField}</View>
                </View>
                <View style={S.gridRow}>
                  <View style={S.gridCell}>{mobileField}</View>
                  <View style={S.gridCell}>{emailField}</View>
                </View>
                <View style={S.gridRow}>
                  <View style={S.gridCell}>{passwordField}{pwRulesEl}</View>
                  <View style={S.gridCell}>{confirmField}</View>
                </View>
              </>
            ) : (
              <>
                {firstNameField}
                {lastNameField}
                {mobileField}
                {emailField}
                {passwordField}
                {pwRulesEl}
                {confirmField}
              </>
            );
          })()}
        </View>
  );
}
