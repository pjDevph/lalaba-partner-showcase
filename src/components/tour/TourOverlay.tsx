// src/components/tour/TourOverlay.tsx
// In-app product tour overlay.
//
// Renders as a Modal on top of the current screen:
//   • Semi-transparent backdrop split into highlight zones (top / middle / bottom / full)
//   • Animated tooltip card sliding up from the bottom
//   • Progress dots + step counter
//   • "Next" (or "Done" on last step) and "Skip" buttons
//
// Auto-start behaviour:
//   • Waits for AsyncStorage hydration before deciding whether to show the tour.
//     This prevents the tour re-firing for returning users on every app launch.
//
// Usage:
//   <TourOverlay tourId="dashboard" />
//   — auto-starts if tour has not been seen, no-ops otherwise.

import React, { useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
  Pressable,
} from "react-native";
import Svg, { Path, Line, Polyline, Rect, Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTourStore } from "../../stores/tourStore";
import { TOUR_REGISTRY, type TourId, type HighlightZone } from "../../data/tourContent";
import { C, RADIUS, SHADOW } from "../../theme/tokens";

// ─── Zone height proportions ──────────────────────────────────────────────────
function getZones(SH: number): Record<HighlightZone, { top: number; height: number }> {
  return {
    top:    { top: 0,         height: SH * 0.38 },
    middle: { top: SH * 0.28, height: SH * 0.44 },
    bottom: { top: SH * 0.56, height: SH * 0.44 },
    full:   { top: 0,         height: SH },
  };
}

// ─── Tour icon set (Feather-style SVG, 32×32 display size) ───────────────────
const TOUR_ICONS: Record<string, React.ReactNode> = {
  layout: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="2" stroke={C.brand500} strokeWidth="1.8" />
      <Line x1="3" y1="9" x2="21" y2="9" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="9" y1="21" x2="9" y2="9" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  zap: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  "trending-up": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="17 6 23 6 23 12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  list: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Line x1="8" y1="6" x2="21" y2="6" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="12" x2="21" y2="12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="18" x2="21" y2="18" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="3" y1="6" x2="3.01" y2="6" stroke={C.brand500} strokeWidth="2" strokeLinecap="round" />
      <Line x1="3" y1="12" x2="3.01" y2="12" stroke={C.brand500} strokeWidth="2" strokeLinecap="round" />
      <Line x1="3" y1="18" x2="3.01" y2="18" stroke={C.brand500} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  ),
  "shopping-bag": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="3" y1="6" x2="21" y2="6" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M16 10a4 4 0 01-8 0" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  user: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4A4 4 0 0 1 16 8A4 4 0 0 1 12 12A4 4 0 0 1 8 8A4 4 0 0 1 12 4Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  grid: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" stroke={C.brand500} strokeWidth="1.8" rx="1" />
      <Rect x="14" y="3" width="7" height="7" stroke={C.brand500} strokeWidth="1.8" rx="1" />
      <Rect x="3" y="14" width="7" height="7" stroke={C.brand500} strokeWidth="1.8" rx="1" />
      <Rect x="14" y="14" width="7" height="7" stroke={C.brand500} strokeWidth="1.8" rx="1" />
    </Svg>
  ),
  "credit-card": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="1" y="4" width="22" height="16" rx="2" stroke={C.brand500} strokeWidth="1.8" />
      <Line x1="1" y1="10" x2="23" y2="10" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  "check-circle": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Polyline points="9 12 11 14 15 10" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  layers: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Polyline points="12 2 2 7 12 12 22 7 12 2" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="2 17 12 22 22 17" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="2 12 12 17 22 12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  sliders: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="21" x2="4" y2="14" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="4" y1="10" x2="4" y2="3" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="12" y1="21" x2="12" y2="12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="12" y1="8" x2="12" y2="3" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="20" y1="21" x2="20" y2="16" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="20" y1="12" x2="20" y2="3" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="1" y1="14" x2="7" y2="14" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="9" y1="8" x2="15" y2="8" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="17" y1="16" x2="23" y2="16" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  "chevrons-right": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Polyline points="13 17 18 12 13 7" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="6 17 11 12 6 7" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  "x-circle": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Line x1="15" y1="9" x2="9" y2="15" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="9" y1="9" x2="15" y2="15" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  tag: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="7" y1="7" x2="7.01" y2="7" stroke={C.brand500} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  ),
  hash: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="9" x2="20" y2="9" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="4" y1="15" x2="20" y2="15" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="10" y1="3" x2="8" y2="21" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="16" y1="3" x2="14" y2="21" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  "bar-chart": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="20" x2="12" y2="10" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="18" y1="20" x2="18" y2="4" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="6" y1="20" x2="6" y2="16" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  calendar: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="18" rx="2" stroke={C.brand500} strokeWidth="1.8" />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="2" x2="8" y2="6" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  upload: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="17 8 12 3 7 8" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="3" x2="12" y2="15" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  package: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Line x1="16.5" y1="9.4" x2="7.5" y2="4.21" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="22.08" x2="12" y2="12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  "plus-circle": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Line x1="12" y1="8" x2="12" y2="16" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="8" y1="12" x2="16" y2="12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  "toggle-right": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="1" y="5" width="22" height="14" rx="7" stroke={C.brand500} strokeWidth="1.8" />
      <Circle cx="16" cy="12" r="3" stroke={C.brand500} strokeWidth="1.8" fill={C.brand100} />
    </Svg>
  ),
  archive: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="4" rx="1" stroke={C.brand500} strokeWidth="1.8" />
      <Path d="M4 8v10a2 2 0 002 2h12a2 2 0 002-2V8" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="10" y1="12" x2="14" y2="12" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  settings: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M12 15A3 3 0 1 0 12 9A3 3 0 0 0 12 15Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  users: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M9 3A4 4 0 0 1 13 7A4 4 0 0 1 9 11A4 4 0 0 1 5 7A4 4 0 0 1 9 3Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  clock: (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2Z" stroke={C.brand500} strokeWidth="1.8" fill="none" />
      <Path d="M12 6v6l4 2" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  "file-text": (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="13" x2="8" y2="13" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="16" y1="17" x2="8" y2="17" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="10" y1="9" x2="8" y2="9" stroke={C.brand500} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  // Tip lightbulb icon (smaller, used in the tip row)
  lightbulb: (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.61-1.42 4.88-3.5 6.11V17a1 1 0 01-1 1h-5a1 1 0 01-1-1v-1.89C6.42 13.88 5 11.61 5 9a7 7 0 017-7z" stroke="#92400e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
};

// ─── Backdrop slice ───────────────────────────────────────────────────────────
function BackdropSlice({ highlight }: Readonly<{ highlight: HighlightZone }>) {
  const { height: SH } = useWindowDimensions();
  const zone = getZones(SH)[highlight];
  const isFullDim = highlight === "full";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {isFullDim ? (
        <View style={[styles.dimSlice, { top: 0, height: SH }]} />
      ) : (
        <>
          {zone.top > 0 && (
            <View style={[styles.dimSlice, { top: 0, height: zone.top }]} />
          )}
          <View style={[styles.highlightSlice, { top: zone.top, height: zone.height }]} />
          <View style={[styles.dimSlice, { top: zone.top + zone.height, height: SH - (zone.top + zone.height) }]} />
        </>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface TourOverlayProps {
  tourId: TourId;
}

export function TourOverlay({ tourId }: Readonly<TourOverlayProps>) {
  const {
    hasHydrated,
    activeTourId,
    activeSteps,
    activeStepIndex,
    startTour,
    nextStep,
    skipTour,
    isTourSeen,
  } = useTourStore();

  const insets = useSafeAreaInsets();
  const { height: SH } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const isActive = activeTourId === tourId;
  const step     = isActive ? activeSteps[activeStepIndex] : null;
  const isLast   = isActive && activeStepIndex === activeSteps.length - 1;

  // Auto-start on mount — but ONLY after AsyncStorage has finished loading seenTours.
  // Without the hasHydrated guard, isTourSeen() always returns false on first render
  // because the persisted seenTours array has not been loaded yet.
  useEffect(() => {
    if (!hasHydrated) return;
    if (!isTourSeen(tourId)) {
      const steps = TOUR_REGISTRY[tourId];
      if (steps?.length) startTour(tourId, steps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, hasHydrated]);

  // Animate card in whenever step changes
  useEffect(() => {
    if (!isActive) return;
    slideAnim.setValue(280);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, activeStepIndex]);

  const handleNext = useCallback(() => nextStep(), [nextStep]);
  const handleSkip = useCallback(() => skipTour(), [skipTour]);

  if (!isActive || !step) return null;

  const zone = getZones(SH)[step.highlight];
  const cardBottom = insets.bottom + 24;

  const iconNode = TOUR_ICONS[step.iconName] ?? null;

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      {/* Backdrop */}
      <BackdropSlice highlight={step.highlight} />

      {/* Skip button — top right */}
      <Pressable
        style={[styles.skipBtn, { top: insets.top + 16 }]}
        onPress={handleSkip}
        hitSlop={12}
      >
        <Text style={styles.skipText}>Skip tour</Text>
      </Pressable>

      {/* Arrow indicator for non-full highlights */}
      {step.highlight !== "full" && (
        <View
          style={[
            styles.arrowIndicator,
            {
              top: step.highlight === "bottom"
                ? zone.top - 40
                : zone.top + zone.height + 8,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.arrowText}>
            {step.highlight === "bottom" ? "above here" : "below here"}
          </Text>
        </View>
      )}

      {/* Tooltip card */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: cardBottom,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Icon + step counter */}
        <View style={styles.iconRow}>
          <View style={styles.iconWrap}>
            {iconNode}
          </View>
          <Text style={styles.counter}>
            {activeStepIndex + 1} / {activeSteps.length}
          </Text>
        </View>

        {/* Content */}
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        {/* Pro tip */}
        {step.tip && (
          <View style={styles.tipRow}>
            {TOUR_ICONS.lightbulb}
            <Text style={styles.tipText}>{step.tip}</Text>
          </View>
        )}

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {activeSteps.map((step, i) => (
            <View
              key={step.id ?? i}
              style={[styles.dot, i === activeStepIndex && styles.dotActive]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.skipTouchable} onPress={handleSkip} activeOpacity={0.7}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>{isLast ? "Got it" : "Next"}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  dimSlice: {
    position: "absolute",
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.62)",
  },
  highlightSlice: {
    position: "absolute",
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.10)",
  },
  skipBtn: {
    position: "absolute",
    right: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  skipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  arrowIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  arrowText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: C.white,
    borderRadius: RADIUS.xl,
    padding: 20,
    ...SHADOW.lg,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    fontSize: 12,
    fontWeight: "600",
    color: C.gray400,
    backgroundColor: C.gray100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: C.gray900,
    marginBottom: 8,
    lineHeight: 24,
  },
  body: {
    fontSize: 14,
    color: C.gray600,
    lineHeight: 21,
    marginBottom: 10,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderRadius: RADIUS.md,
    padding: 10,
    marginBottom: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: "#92400e",
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginBottom: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.gray200,
  },
  dotActive: {
    width: 20,
    backgroundColor: C.brand500,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  skipTouchable: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: C.gray200,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray500,
  },
  nextBtn: {
    flex: 2,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.lg,
    backgroundColor: C.brand500,
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.white,
  },
});
