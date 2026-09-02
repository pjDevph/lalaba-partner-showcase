// src/components/StaticMapPreview.tsx
// A small, non-interactive map with a single pin — "here's where you are,
// tap to change it" for a read-only address summary. Not the picker itself
// (see AddressPicker.tsx); this never accepts input, only shows one.
//
// Same degrade-gracefully approach as CourierMap.tsx: react-native-maps is a
// native module, so it's require()'d behind a try/catch and swapped for a
// placeholder rather than risking a redbox on a build without it.

import React from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";

export interface StaticMapPreviewProps {
  latitude: number | null;
  longitude: number | null;
  /** Zoom — smaller is closer. 0.01 reads at roughly a neighbourhood level. */
  delta?: number;
  style?: StyleProp<ViewStyle>;
}

interface NativeMaps {
  MapView: React.ComponentType<Record<string, unknown>>;
  Marker: React.ComponentType<Record<string, unknown>>;
  PROVIDER_GOOGLE?: unknown;
}

function loadNativeMaps(): NativeMaps | null {
  try {
    // require(), not a static import: a hoisted import throws at module-eval
    // time on a build without the native module and takes the screen down
    // instead of falling back to the placeholder below.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-maps") as {
      default?: NativeMaps["MapView"];
      Marker?: NativeMaps["Marker"];
      PROVIDER_GOOGLE?: unknown;
    };
    if (!mod?.default) return null;
    return { MapView: mod.default, Marker: mod.Marker as NativeMaps["Marker"], PROVIDER_GOOGLE: mod.PROVIDER_GOOGLE };
  } catch {
    return null;
  }
}

const NATIVE = loadNativeMaps();

const MAPS_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS
    : process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID;

export function StaticMapPreview({ latitude, longitude, delta = 0.01, style }: Readonly<StaticMapPreviewProps>) {
  const androidMissingKey = Platform.OS === "android" && !MAPS_KEY;

  if (!NATIVE || androidMissingKey || latitude == null || longitude == null) {
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="location-outline" size={28} color={C.gray300} />
        <Text style={styles.placeholderText}>
          {latitude == null || longitude == null ? "No location pinned yet" : "Map unavailable"}
        </Text>
      </View>
    );
  }

  const { MapView: RNMap, Marker, PROVIDER_GOOGLE } = NATIVE;

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <RNMap
        style={StyleSheet.absoluteFill}
        provider={MAPS_KEY || Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
      >
        <Marker coordinate={{ latitude, longitude }} pinColor={C.washer500} />
      </RNMap>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: RADIUS.md, overflow: "hidden", backgroundColor: C.gray100 },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: SP._6,
    backgroundColor: C.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.gray200,
    borderStyle: "dashed",
  },
  placeholderText: { fontSize: 12.5, color: C.gray400, fontWeight: "600" },
});
