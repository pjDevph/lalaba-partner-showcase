// src/components/CourierPickerSheet.tsx
// Lets a provider CHOOSE who runs a pickup/return leg instead of the flow
// silently picking couriers[0] for them. Always offers "Assign myself" (the
// provider running the delivery solo) plus every courier on the roster —
// there's no online/load signal to rank by yet, so the list is just the
// roster, most-recently-added first (server order).

import React from "react";
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS, SP } from "../theme/tokens";
import type { GqlStaffLite } from "../services/graphql/onlineOrders";

export type CourierPickerAccent = { base: string; bg: string; dark: string };

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function CourierPickerSheet({
  visible,
  title,
  couriers,
  selfUid,
  selfLabel = "Assign myself",
  accent,
  onPick,
  onClose,
}: Readonly<{
  visible: boolean;
  title: string;
  couriers: GqlStaffLite[];
  /** The signed-in provider's own uid — offered as a self-run option. Omit to hide it. */
  selfUid?: string | null;
  selfLabel?: string;
  accent: CourierPickerAccent;
  onPick: (uid: string) => void;
  onClose: () => void;
}>) {
  const insets = useSafeAreaInsets();

  const pick = (uid: string) => {
    onPick(uid);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SP._24) }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={C.gray500} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {selfUid ? (
              <Pressable style={styles.row} onPress={() => pick(selfUid)} accessibilityRole="button">
                <View style={[styles.avatar, { backgroundColor: accent.bg }]}>
                  <Ionicons name="person" size={18} color={accent.dark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{selfLabel}</Text>
                  <Text style={styles.meta}>Run this delivery yourself</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.gray300} />
              </Pressable>
            ) : null}

            {couriers.map((c) => (
              <Pressable key={c._id} style={styles.row} onPress={() => pick(c._id)} accessibilityRole="button">
                <View style={[styles.avatar, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.avatarText, { color: accent.dark }]}>
                    {initials(`${c.firstName} ${c.lastName}`)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.firstName} {c.lastName}</Text>
                  <Text style={styles.meta}>{c.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.gray300} />
              </Pressable>
            ))}

            {couriers.length === 0 ? (
              <Text style={styles.emptyNote}>
                No couriers on your staff yet — invite one from Staff to add more options here.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SP._16,
    paddingBottom: SP._24,
    maxHeight: "80%",
  },
  grabber: {
    width: 40, height: 4, borderRadius: RADIUS.full,
    backgroundColor: C.gray200, alignSelf: "center", marginVertical: SP._10,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  list: { gap: SP._6, paddingTop: SP._12, paddingBottom: SP._8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: SP._12,
    paddingVertical: SP._10, paddingHorizontal: SP._4,
  },
  avatar: {
    width: 40, height: 40, borderRadius: RADIUS.full,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700" },
  name: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  meta: { fontSize: 12, color: C.gray500, marginTop: 1 },
  emptyNote: { fontSize: 13, color: C.gray500, textAlign: "center", paddingVertical: SP._16, lineHeight: 19 },
});
