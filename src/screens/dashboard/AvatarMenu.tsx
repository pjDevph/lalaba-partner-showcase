// src/screens/dashboard/AvatarMenu.tsx
//
// Header avatar that opens a small dropdown menu with a Logout action.
// Fully self-contained: it owns its open/close state, its styling, and the
// sign-out flow (confirm dialog → authStore.signOut). Screens just render
// <AvatarMenu initials="A" /> — no logout logic lives in the screen.

import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";
import { showConfirm } from "../../lib/dialog";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";

interface AvatarMenuProps {
  /** Single-letter initial shown inside the avatar circle. */
  initials: string;
  /**
   * Opaque brand-filled circle instead of the translucent-white default.
   * Use when the avatar floats over arbitrary/light backgrounds (e.g. the
   * global landscape overlay) so it stays visible; the default translucent
   * style is meant for a colored header like the Dashboard's.
   */
  solid?: boolean;
}

export function AvatarMenu({ initials, solid = false }: AvatarMenuProps) {
  const insets  = useSafeAreaInsets();
  const signOut = useAuthStore((s) => s.signOut);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = useCallback(() => {
    setMenuOpen(false);
    showConfirm(
      "Sign Out",
      "Are you sure you want to sign out?",
      () => { void signOut(); },
      { confirmLabel: "Sign Out", destructive: true },
    );
  }, [signOut]);

  return (
    <>
      <TouchableOpacity
        style={[S.avatar, solid && S.avatarSolid]}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
      >
        <Text style={[S.avatarText, solid && S.avatarSolidText]}>{initials}</Text>
      </TouchableOpacity>

      {/* Dropdown menu (Logout) */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        supportedOrientations={["portrait", "landscape"]}
      >
        <Pressable style={S.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[S.menuCard, { top: insets.top + 56, right: SP._20 }]}>
            <TouchableOpacity style={S.menuItem} onPress={handleLogout} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={18} color={C.error500} />
              <Text style={S.menuItemText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const S = StyleSheet.create({
  // Headers are white app-wide, so the default avatar is a brand-tinted chip.
  // It used to be translucent white with a white border — legible only on the
  // brand-blue headers that no longer exist, and invisible on a white one.
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: C.brand50, borderWidth: 2, borderColor: C.brand100, alignItems: "center", justifyContent: "center" },
  // Opaque brand circle for floating over arbitrary/light backgrounds.
  avatarSolid: { backgroundColor: C.brand500, borderColor: "rgba(255,255,255,0.9)", ...SHADOW.brand },
  avatarSolidText: { color: C.white },
  avatarText: { fontSize: 14, fontWeight: "800", color: C.brand700 },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.15)" },
  menuCard:     { position: "absolute", minWidth: 160, backgroundColor: C.white, borderRadius: RADIUS.md, paddingVertical: SP._4, ...SHADOW.brand },
  menuItem:     { flexDirection: "row", alignItems: "center", gap: SP._10, paddingHorizontal: SP._16, paddingVertical: SP._12 },
  menuItemText: { fontSize: 14, fontWeight: "600", color: C.error500 },
});
