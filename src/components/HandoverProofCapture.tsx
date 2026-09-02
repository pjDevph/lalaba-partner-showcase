// src/components/HandoverProofCapture.tsx
// Photo evidence for a handover that SUCCEEDED — the courier at the customer's
// door, or staff at the counter.
//
// Camera only, no library picker: a stored photo would defeat the point, which
// is that the frame was taken at the handover. Same reasoning as the
// verification cards (see features/verification/pickDocument.ts).
//
// Each shot uploads immediately and returns a storage key; the keys ride along
// with the collection mutation. Uploading up front rather than inside that
// mutation keeps a database transaction from being held open for the length of
// a mobile upload.

import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { C, RADIUS, SP } from "../theme/tokens";
import { notify } from "../stores/notificationStore";
import { pickFromCamera } from "../features/verification/pickDocument";
import { gqlUploadHandoverProof } from "../services/graphql/onlineOrders";
import { toUserMessage } from "../utils/userError";

const MAX_SHOTS = 3;

export type ProofShot = { uri: string; objectKey: string };

export default function HandoverProofCapture({
  orderId,
  leg,
  accent,
  shots,
  onChange,
}: Readonly<{
  orderId: string;
  leg: "PICKUP" | "RETURN";
  accent: string;
  shots: ProofShot[];
  onChange: (next: ProofShot[]) => void;
}>) {
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    if (busy || shots.length >= MAX_SHOTS) return;
    const picked = await pickFromCamera();
    if (!picked) return; // cancelled — not an error

    setBusy(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(picked.uri, {
        encoding: "base64",
      });
      const objectKey = await gqlUploadHandoverProof(
        orderId,
        leg,
        base64,
        picked.mimeType,
      );
      onChange([...shots, { uri: picked.uri, objectKey }]);
    } catch (e: unknown) {
      notify.error("Photo not saved", toUserMessage(e, "Try taking it again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = (objectKey: string) =>
    onChange(shots.filter((s) => s.objectKey !== objectKey));

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        Handover photo {shots.length > 0 ? `(${shots.length}/${MAX_SHOTS})` : "(optional)"}
      </Text>

      <View style={styles.row}>
        {shots.map((s) => (
          <View key={s.objectKey} style={styles.thumbWrap}>
            <Image source={{ uri: s.uri }} style={styles.thumb} />
            <TouchableOpacity
              style={styles.remove}
              onPress={() => remove(s.objectKey)}
              hitSlop={8}
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={14} color={C.white} />
            </TouchableOpacity>
          </View>
        ))}

        {shots.length < MAX_SHOTS ? (
          <TouchableOpacity
            style={[styles.add, { borderColor: accent }]}
            onPress={capture}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color={accent} />
            ) : (
              <Ionicons name="camera-outline" size={22} color={accent} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.note}>
        Taken now, not from your gallery. The customer and the shop can see these.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SP._8 },
  title: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: SP._8, alignItems: "center" },
  thumbWrap: { position: "relative" },
  thumb: { width: 64, height: 64, borderRadius: RADIUS.md, backgroundColor: C.gray100 },
  remove: {
    position: "absolute", top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.gray700, alignItems: "center", justifyContent: "center",
  },
  add: {
    width: 64, height: 64, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  note: { fontSize: 12, color: C.gray400 },
});
