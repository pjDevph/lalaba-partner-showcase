import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useDialogStore } from "../stores/dialogStore";
import { C, SP, RADIUS } from "../theme/tokens";

export function GlobalDialog() {
  const dialog = useDialogStore((s) => s.dialog);
  const hide   = useDialogStore((s) => s.hide);

  const isConfirm = dialog?.variant === "confirm";
  const isChoice  = dialog?.variant === "choice";
  // Both dismissible variants must run onCancel, so a caller awaiting an answer
  // gets one from the backdrop and the back button too, not only from Cancel.
  const dismissible = isConfirm || isChoice;

  const handleConfirm = () => {
    const cb = dialog?.onConfirm;
    hide();
    cb?.();
  };

  const handleCancel = () => {
    const cb = dialog?.onCancel;
    hide();
    cb?.();
  };

  return (
    <Modal
      transparent
      // iOS <Modal> defaults to portrait-only, so presenting it in landscape
      // force-rotates the whole UI to portrait while the device stays landscape.
      // Allow both so the dialog keeps the current orientation.
      supportedOrientations={["portrait", "landscape"]}
      // Android's transparent+fade Modal briefly flashes an opaque black
      // window before the JS content paints (the native fade-in isn't synced
      // with the JS mount). "none" skips that flash; iOS doesn't have the bug.
      animationType={Platform.OS === "android" ? "none" : "fade"}
      visible={!!dialog}
      onRequestClose={dismissible ? handleCancel : hide}
      statusBarTranslucent
    >
      <Pressable style={S.backdrop} onPress={isConfirm ? undefined : isChoice ? handleCancel : hide}>
        <Pressable style={S.card}>
          <Text style={S.title}>{dialog?.title}</Text>
          {!!dialog?.message && (
            <Text style={S.message}>{dialog.message}</Text>
          )}

          {isChoice ? (
            <View style={S.buttons}>
              {(dialog?.choices ?? []).map((c) => (
                <TouchableOpacity
                  key={c.label}
                  style={[S.btn, S.okBtn, c.destructive && S.destructiveBtn]}
                  onPress={() => { hide(); c.onPress(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[S.confirmText, c.destructive && S.destructiveText]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[S.btn, S.cancelBtn]}
                onPress={handleCancel}
                activeOpacity={0.75}
              >
                <Text style={S.cancelText}>{dialog?.cancelLabel ?? "Cancel"}</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={[S.buttons, isConfirm && S.buttonsRow]}>
            {isConfirm && (
              <TouchableOpacity
                style={[S.btn, S.rowBtn, S.cancelBtn]}
                onPress={handleCancel}
                activeOpacity={0.75}
              >
                <Text style={S.cancelText}>{dialog?.cancelLabel ?? "Cancel"}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                S.btn,
                isConfirm ? [S.rowBtn, S.confirmBtn] : S.okBtn,
                dialog?.destructive && S.destructiveBtn,
              ]}
              onPress={isConfirm ? handleConfirm : hide}
              activeOpacity={0.8}
            >
              <Text style={[S.confirmText, dialog?.destructive && S.destructiveText]}>
                {dialog?.confirmLabel ?? (isConfirm ? "Confirm" : "OK")}
              </Text>
            </TouchableOpacity>
          </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const S = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP._32,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SP._24,
    paddingTop: SP._24,
    paddingBottom: SP._16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: C.gray900,
    marginBottom: SP._8,
  },
  message: {
    fontSize: 14,
    color: C.gray600,
    lineHeight: 20,
    marginBottom: SP._20,
  },
  buttons: {
    marginTop: SP._4,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: SP._8,
  },
  btn: {
    // No `flex: 1` here. The confirm variant lays these out in a ROW, where
    // flex:1 splits the width — but the info variant's container is a plain
    // COLUMN, and there flex:1 means flexBasis:0 on the MAIN axis. The card's
    // height is content-driven, so there is no free space to grow into and the
    // lone OK button collapsed to zero height: an alert with no visible way to
    // dismiss it but a backdrop tap. Row-only flex now lives in `rowBtn`.
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBtn: {
    flex: 1,
  },
  okBtn: {
    backgroundColor: C.brand500,
    marginTop: SP._8,
    alignSelf: "stretch",
  },
  cancelBtn: {
    backgroundColor: C.gray100,
  },
  confirmBtn: {
    backgroundColor: C.brand500,
  },
  destructiveBtn: {
    backgroundColor: C.error500,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "600",
    color: C.white,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "500",
    color: C.gray700,
  },
  destructiveText: {
    color: C.white,
  },
});
