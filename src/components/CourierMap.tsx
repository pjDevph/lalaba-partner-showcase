// src/components/CourierMap.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Thin, typed wrapper over `react-native-maps` for the courier stack, ported
// from the customer app's src/components/MapView.tsx but trimmed to a single
// interactive mode: destination pins + the rider's own position.
//
// Degrades gracefully. `react-native-maps` is a native module, so a JS bundle
// that reached a device without the matching native build would otherwise
// redbox on import — we require() it behind a try/catch and render a placeholder
// instead. Same for a missing API key, which the SDK reports only as blank grey
// tiles.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { C, SP } from "../theme/tokens";
import type { LatLng } from "../services/graphql/onlineOrders";

export type { LatLng };

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface CourierMarker {
  id: string;
  coordinate: LatLng;
  /** Drives the pin colour: a leg not yet started vs one in progress. */
  kind: "new" | "active";
  /** Short glyph rendered inside the pin — we use the stop number. */
  badge?: string;
  onPress?: () => void;
}

export interface CourierMapProps {
  region: MapRegion;
  markers?: CourierMarker[];
  /** Draw the device's own blue dot. Safe to leave on — the SDK just omits it
   *  when the location permission is denied. */
  showsUserLocation?: boolean;
  /** Keep-clear insets when auto-fitting, e.g. room for a card over the bottom. */
  fitPadding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Force the placeholder regardless of native availability (useful in tests). */
  forcePlaceholder?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Tightest auto-fit zoom, so a lone marker lands at street level rather than
// filling the screen with one building.
const SINGLE_PIN_DELTA = 0.008;

// Maps keys are split per platform (each Google Cloud key carries only one
// application-restriction type), so resolve the one matching this build. These
// must be written as full static literals — Metro inlines EXPO_PUBLIC_* by exact
// name, so a computed lookup like process.env["..." + platform] is undefined.
const MAPS_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS
    : process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID;

interface NativeMaps {
  MapView: React.ComponentType<Record<string, unknown>>;
  Marker: React.ComponentType<Record<string, unknown>>;
  PROVIDER_GOOGLE?: unknown;
}

function loadNativeMaps(): NativeMaps | null {
  try {
    // Deliberately require() rather than import: a static import is hoisted and
    // would throw at module-eval time on a build without the native module,
    // taking the whole screen down instead of falling back to the placeholder.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-maps") as {
      default?: NativeMaps["MapView"];
      Marker?: NativeMaps["Marker"];
      PROVIDER_GOOGLE?: unknown;
    };
    if (!mod?.default) return null;
    return {
      MapView: mod.default,
      Marker: mod.Marker as NativeMaps["Marker"],
      PROVIDER_GOOGLE: mod.PROVIDER_GOOGLE,
    };
  } catch {
    return null;
  }
}

const NATIVE = loadNativeMaps();

/** True when a real map can render — lets screens pick a different empty state. */
export const MAPS_AVAILABLE = !!NATIVE && (Platform.OS === "ios" || !!MAPS_KEY);

export function CourierMap({
  region,
  markers,
  showsUserLocation = true,
  fitPadding,
  forcePlaceholder = false,
  style,
}: Readonly<CourierMapProps>) {
  // Android has no fallback provider — without a key it renders blank grey
  // tiles, which reads as a broken screen. iOS falls back to Apple Maps, which
  // needs no key at all.
  const androidMissingKey = Platform.OS === "android" && !MAPS_KEY;

  // Identity of the current stop set — drives re-fitting the camera. Each
  // marker owns its own bitmap lifecycle; see TrackedMarker.
  const markerKey = (markers ?? []).map((m) => m.id).join("|");

  // Frame the pins imperatively rather than relying on `initialRegion`. That
  // prop is consumed once, when the native view is created — which happens
  // before the first poll returns, so the camera would keep the wide fallback
  // region forever and never zoom to the stops.
  const mapRef = React.useRef<{
    fitToCoordinates: (c: LatLng[], o: Record<string, unknown>) => void;
    animateToRegion: (r: MapRegion, ms: number) => void;
  } | null>(null);
  const [ready, setReady] = React.useState(false);
  // onMapReady can fire before the view has its final size, and fitting against
  // a zero/partial frame computes a camera that leaves every pin outside the
  // viewport — a map with no pins on it. Wait for a real measurement, and re-fit
  // if the size changes (rotation, keyboard, tab layout settling).
  const [frame, setFrame] = React.useState({ w: 0, h: 0 });

  React.useEffect(() => {
    const coords = (markers ?? []).map((m) => m.coordinate);
    if (!ready || !mapRef.current || coords.length === 0) return;
    if (frame.w < 1 || frame.h < 1) return;

    if (coords.length === 1) {
      // fitToCoordinates on a single point zooms to maximum; pick the zoom.
      mapRef.current.animateToRegion(
        { ...coords[0], latitudeDelta: SINGLE_PIN_DELTA, longitudeDelta: SINGLE_PIN_DELTA },
        0,
      );
      return;
    }
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: {
        top: fitPadding?.top ?? 64,
        right: fitPadding?.right ?? 64,
        bottom: fitPadding?.bottom ?? 64,
        left: fitPadding?.left ?? 64,
      },
      animated: false,
    });
    // Re-fit only when the set of stops (or the frame) changes, never on every
    // poll tick — otherwise the camera snaps back while the rider is panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markerKey, frame.w, frame.h]);

  if (forcePlaceholder || !NATIVE || androidMissingKey) {
    return <MapPlaceholder noKey={androidMissingKey} style={[styles.container, style]} />;
  }

  const { MapView: RNMap, Marker, PROVIDER_GOOGLE } = NATIVE;

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setFrame((f) => (f.w === width && f.h === height ? f : { w: width, h: height }));
      }}
    >
      <RNMap
        ref={mapRef}
        onMapReady={() => setReady(true)}
        style={StyleSheet.absoluteFill}
        // Google on Android (keyed); on iOS use Google when a key is configured
        // so both platforms look alike, else Apple Maps.
        provider={MAPS_KEY || Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {(markers ?? []).map((m) => (
          <TrackedMarker key={m.id} Marker={Marker} marker={m} />
        ))}
      </RNMap>
    </View>
  );
}

/**
 * A marker that stops re-rasterising once its pin has actually painted.
 *
 * The native SDK snapshots a custom marker child to a bitmap. Leaving
 * `tracksViewChanges` on re-snapshots every frame and visibly janks panning;
 * turning it off too early freezes a half-painted — often blank — bitmap, which
 * is why pins would intermittently not appear. So each marker owns its own
 * lifecycle: track until this pin reports a layout, wait two frames for the SVG
 * to paint into the snapshot, then freeze. The timeout is a backstop for the
 * case where onLayout never fires.
 */
function TrackedMarker({
  Marker,
  marker,
}: Readonly<{ Marker: NativeMaps["Marker"]; marker: CourierMarker }>) {
  const [tracks, setTracks] = React.useState(true);

  // Re-arm if this pin's appearance changes (number or new/active colour).
  const look = `${marker.badge ?? ""}|${marker.kind}`;
  React.useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 2000);
    return () => clearTimeout(t);
  }, [look]);

  const settle = React.useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTracks(false)));
  }, []);

  return (
    <Marker
      coordinate={marker.coordinate}
      onPress={marker.onPress}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
    >
      <View onLayout={settle}>
        <MapPin label={marker.badge ?? ""} color={marker.kind === "active" ? C.courier500 : C.gray600} />
      </View>
    </Marker>
  );
}

// One SVG teardrop rather than a bordered circle stacked on a separate triangle:
// stacked Views put the white ring between the head and the tail, so the pin
// reads as two disconnected shapes. A single path strokes cleanly around the
// whole silhouette and rasterizes predictably into the marker bitmap.
const PIN_W = 30;
const PIN_H = 40;
const PIN_PATH =
  "M15 1.6 C7.8 1.6 2 7.4 2 14.6 C2 24.4 15 38.4 15 38.4 S28 24.4 28 14.6 C28 7.4 22.2 1.6 15 1.6 Z";

function MapPin({ label, color }: Readonly<{ label: string; color: string }>) {
  return (
    <View style={{ width: PIN_W, height: PIN_H }}>
      <Svg width={PIN_W} height={PIN_H} viewBox={`0 0 ${PIN_W} ${PIN_H}`}>
        <Path d={PIN_PATH} fill={color} stroke={C.white} strokeWidth={2.5} strokeLinejoin="round" />
      </Svg>
      {/* Number sits over the round head (centred on cy≈14.6), not the whole pin. */}
      <View style={styles.pinLabelWrap} pointerEvents="none">
        <Text style={styles.pinText} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

function MapPlaceholder({ noKey, style }: Readonly<{ noKey: boolean; style: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.placeholder, style]}>
      <Ionicons name="map-outline" size={28} color={C.gray400} />
      <Text style={styles.placeholderText}>
        {noKey
          ? "Map unavailable — no Google Maps key configured for this build."
          : "Map unavailable — this build is missing the native maps module."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: C.gray100,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    padding: SP._20,
    backgroundColor: C.gray100,
  },
  placeholderText: {
    fontSize: 12,
    color: C.gray500,
    marginTop: SP._8,
    textAlign: "center",
    maxWidth: 260,
  },
  pinLabelWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 29, // round head of the teardrop; keeps the digit off the tail
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: {
    fontSize: 12,
    fontWeight: "800",
    color: C.white,
  },
});
