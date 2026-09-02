// src/components/RadiusSlider.tsx
// A small drag slider for a single numeric km value, with a big "N km"
// readout above it. Built on react-native-gesture-handler's modern Gesture
// API (already used for the toast swipe-to-dismiss in app/_layout.tsx) rather
// than pulling in @react-native-community/slider, which would add a new
// native dependency and require a rebuild.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { C, RADIUS, SP } from "../theme/tokens";

export interface RadiusSliderProps {
  /** km */
  value: number;
  onChange: (km: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function RadiusSlider({
  value,
  onChange,
  min = 1,
  max = 20,
  step = 1,
  disabled = false,
}: Readonly<RadiusSliderProps>) {
  const [trackWidth, setTrackWidth] = useState(0);

  const valueToFraction = useCallback(
    (v: number) => (max === min ? 0 : (clamp(v, min, max) - min) / (max - min)),
    [min, max],
  );

  const handleDragX = useCallback(
    (x: number) => {
      if (trackWidth <= 0) return;
      const fraction = clamp(x / trackWidth, 0, 1);
      const raw = min + fraction * (max - min);
      const stepped = Math.round(raw / step) * step;
      onChange(clamp(Number(stepped.toFixed(2)), min, max));
    },
    [trackWidth, min, max, step, onChange],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .onBegin((e) => { runOnJS(handleDragX)(e.x); })
        .onUpdate((e) => { runOnJS(handleDragX)(e.x); }),
    [disabled, handleDragX],
  );

  const fraction = valueToFraction(value);
  const thumbLeft = fraction * trackWidth;
  // Trim trailing ".0" — a whole-number km reads cleaner without it.
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <View style={disabled && styles.disabledWrap}>
      <View style={styles.readout}>
        <Text style={styles.readoutValue}>{display}</Text>
        <Text style={styles.readoutUnit}>km</Text>
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <View style={styles.rail} />
          <View style={[styles.fill, { width: thumbLeft }]} />
          <View style={[styles.thumb, { left: Math.max(0, thumbLeft - 12) }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledWrap: { opacity: 0.6 },
  readout: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 4, marginBottom: SP._12 },
  readoutValue: { fontSize: 32, fontWeight: "800", color: C.gray900, lineHeight: 36 },
  readoutUnit: { fontSize: 15, fontWeight: "600", color: C.gray500, marginBottom: 4 },
  track: {
    height: 24,
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: C.gray200,
  },
  fill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: C.washer500,
  },
  thumb: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: RADIUS.full,
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.washer500,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
