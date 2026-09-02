// Shared "Change Password" modal — used by both the (tabs) Account screen and
// (staff) profile screen so the reauth/update flow lives in exactly one place.
import React, { useState } from "react";
import { errField } from "../../utils/userError";
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../../config/firebase";
import { C, SP } from "../../theme/tokens";
import { showAlert } from "../../lib/dialog";
import { changePasswordSchema } from "../../lib/validation";
import { useNotificationStore } from "../../stores/notificationStore";
import { I } from "./shared";
import { S } from "./styles";

export function ChangePasswordModal({
  visible, onClose,
}: Readonly<{ visible: boolean; onClose: () => void }>) {
  const [currentPassword,     setCurrentPassword]     = useState("");
  const [newPassword,         setNewPassword]         = useState("");
  const [confirmNewPassword,  setConfirmNewPassword]  = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword,     setShowNewPassword]     = useState(false);
  const [changingPassword,    setChangingPassword]    = useState(false);
  const [passwordErrors,      setPasswordErrors]      = useState<{
    currentPassword?: string; newPassword?: string; confirmNewPassword?: string;
  }>({});
  const confirmPasswordMatches  = confirmNewPassword.length > 0 && newPassword === confirmNewPassword;
  const confirmPasswordMismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;

  const resetFields = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setPasswordErrors({});
  };

  const handleClose = () => {
    if (changingPassword) return;
    onClose();
    resetFields();
  };

  const handleChangePassword = async () => {
    const result = changePasswordSchema.safeParse({ currentPassword, newPassword, confirmNewPassword });
    if (!result.success) {
      const fieldErrors: typeof passwordErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof typeof passwordErrors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setPasswordErrors(fieldErrors);
      return;
    }
    setPasswordErrors({});
    setChangingPassword(true);
    try {
      const email = auth.currentUser?.email;
      if (!auth.currentUser || !email) throw new Error("no-session");
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, currentPassword));
      await updatePassword(auth.currentUser, newPassword);
      onClose();
      resetFields();
      useNotificationStore.getState().push({ type: "success", title: "Saved", message: "Password updated successfully." });
    } catch (err: unknown) {
      if (errField(err, "code") === "auth/wrong-password" || errField(err, "code") === "auth/invalid-credential") {
        setPasswordErrors({ currentPassword: "Incorrect password." });
      } else if (errField(err, "code") === "auth/weak-password") {
        setPasswordErrors({ newPassword: "Password is too weak." });
      } else if (errField(err, "code") === "auth/requires-recent-login") {
        showAlert("Please sign in again", "For security, sign out and sign back in before changing your password.");
      } else {
        showAlert("Could not change password", "Please try again.");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView style={S.deleteModalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={S.deleteModalCard}>
          <Text style={S.deleteModalTitle}>Change Password</Text>
          <Text style={S.deleteModalBody}>Enter your current password, then choose a new one.</Text>

          <View style={{ position: "relative", marginTop: SP._12 }}>
            <TextInput
              style={[
                S.deleteConfirmInput,
                { textAlign: "left", letterSpacing: 0, paddingRight: 44 },
                !!passwordErrors.currentPassword && { borderColor: C.error500 },
              ]}
              value={currentPassword}
              onChangeText={(v) => { setCurrentPassword(v); setPasswordErrors((e) => ({ ...e, currentPassword: undefined })); }}
              placeholder="Current password"
              placeholderTextColor={C.gray400}
              secureTextEntry={!showCurrentPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={{ position: "absolute", right: SP._12, top: 0, bottom: 0, justifyContent: "center" }}
              onPress={() => setShowCurrentPassword((v) => !v)}
              activeOpacity={0.7}
            >
              <I.Eye visible={showCurrentPassword} c={passwordErrors.currentPassword ? C.error500 : C.gray400} />
            </TouchableOpacity>
          </View>
          {!!passwordErrors.currentPassword && (
            <Text style={{ color: C.error500, fontSize: 12, marginTop: SP._4 }}>{passwordErrors.currentPassword}</Text>
          )}

          <View style={{ position: "relative", marginTop: SP._12 }}>
            <TextInput
              style={[
                S.deleteConfirmInput,
                { textAlign: "left", letterSpacing: 0, paddingRight: 44 },
                !!passwordErrors.newPassword && { borderColor: C.error500 },
              ]}
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setPasswordErrors((e) => ({ ...e, newPassword: undefined })); }}
              placeholder="New password"
              placeholderTextColor={C.gray400}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={{ position: "absolute", right: SP._12, top: 0, bottom: 0, justifyContent: "center" }}
              onPress={() => setShowNewPassword((v) => !v)}
              activeOpacity={0.7}
            >
              <I.Eye visible={showNewPassword} c={passwordErrors.newPassword ? C.error500 : C.gray400} />
            </TouchableOpacity>
          </View>
          {!!passwordErrors.newPassword && (
            <Text style={{ color: C.error500, fontSize: 12, marginTop: SP._4 }}>{passwordErrors.newPassword}</Text>
          )}

          <TextInput
            style={[
              S.deleteConfirmInput,
              { textAlign: "left", letterSpacing: 0, marginTop: SP._12 },
              confirmPasswordMismatch && { borderColor: C.error500 },
              confirmPasswordMatches && { borderColor: C.success500 },
              !!passwordErrors.confirmNewPassword && { borderColor: C.error500 },
            ]}
            value={confirmNewPassword}
            onChangeText={(v) => { setConfirmNewPassword(v); setPasswordErrors((e) => ({ ...e, confirmNewPassword: undefined })); }}
            placeholder="Confirm new password"
            placeholderTextColor={C.gray400}
            secureTextEntry={!showNewPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {passwordErrors.confirmNewPassword ? (
            <Text style={{ color: C.error500, fontSize: 12, marginTop: SP._4 }}>{passwordErrors.confirmNewPassword}</Text>
          ) : confirmPasswordMismatch ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._4, marginTop: SP._4 }}>
              <I.X c={C.error500} s={13} />
              <Text style={{ color: C.error500, fontSize: 12 }}>Passwords do not match</Text>
            </View>
          ) : confirmPasswordMatches ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._4, marginTop: SP._4 }}>
              <I.Check c={C.success700} />
              <Text style={{ color: C.success700, fontSize: 12 }}>Passwords match</Text>
            </View>
          ) : null}

          <View style={[S.deleteModalActions, { marginTop: SP._16 }]}>
            <TouchableOpacity
              style={S.deleteModalBtnSecondary}
              onPress={handleClose}
              disabled={changingPassword}
              activeOpacity={0.8}
            >
              <Text style={S.deleteModalBtnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.deleteModalBtnPrimary, changingPassword && { opacity: 0.6 }]}
              onPress={() => void handleChangePassword()}
              disabled={changingPassword}
              activeOpacity={0.8}
            >
              {changingPassword
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={S.deleteModalBtnPrimaryText}>Update Password</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
