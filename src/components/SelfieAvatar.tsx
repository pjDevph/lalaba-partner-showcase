// src/components/SelfieAvatar.tsx
// A liveness selfie rendered as an avatar, with initials as the fallback.
//
// Used by both roles whose profile picture IS their verification selfie: the
// courier (app/(courier)/{profile,dashboard}.tsx, which each carried their own
// verbatim copy of `initials()` before this existed) and the home washer, whose
// KYC selfie the backend publishes to photoUrl and logoUrl the moment it lands.
//
// Falls back to initials in three cases, not one: no photo taken yet, a photo
// that was revoked or rejected (photoUrl goes null server-side), and a URL that
// fails to load. The last matters more than it looks — the image lives in a
// public bucket and is deleted outright on revoke and on retake, so an app
// holding a stale URL will get a 404 and must degrade quietly rather than
// render a broken box.

import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import type { StyleProp, ViewStyle, TextStyle } from "react-native";

// "CD" is a last-resort placeholder for a nameless account — every caller
// passes a name that has already fallen back to something ("Home Laundry" on
// the washer side), so it is close to unreachable in practice.
export function initials(name?: string | null): string {
  if (!name) return "CD";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = Readonly<{
  photoUrl?: string | null;
  displayName?: string | null;
  /** Container style — carries size, radius and the fallback background. */
  style: StyleProp<ViewStyle>;
  /** Text style for the initials fallback. */
  textStyle: StyleProp<TextStyle>;
}>;

export default function SelfieAvatar({
  photoUrl,
  displayName,
  style,
  textStyle,
}: Props) {
  const [failed, setFailed] = useState(false);

  // A new URL deserves a fresh attempt — otherwise one 404 would pin the
  // avatar to initials for the rest of the session, including after a retake.
  useEffect(() => setFailed(false), [photoUrl]);

  const showPhoto = !!photoUrl && !failed;

  return (
    <View style={[style, showPhoto && styles.clip]}>
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={textStyle}>{initials(displayName)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
