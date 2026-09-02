// react-native.config.js
// react-native-maps@1.20.1 predates Fabric codegen — it ships legacy (Paper)
// view managers with no `codegenConfig`. This app runs the New Architecture
// (android/gradle.properties → newArchEnabled=true, RN 0.83), so without the
// entries below Fabric can't resolve the native views and the courier map
// throws "View config not found for component `AIRMap`" at render.
//
// Registering the names routes them through the New Renderer Interop Layer:
// https://github.com/reactwg/react-native-new-architecture/discussions/135
// Taken verbatim from the library's own README ("React Native Configuration for
// Fabric / New Architecture"). Drop this file if react-native-maps ever ships
// real Fabric components.
const RN_MAPS_LEGACY_COMPONENTS = [
  "AIRMap",
  "AIRMapCallout",
  "AIRMapCalloutSubview",
  "AIRMapCircle",
  "AIRMapHeatmap",
  "AIRMapLocalTile",
  "AIRMapMarker",
  "AIRMapOverlay",
  "AIRMapPolygon",
  "AIRMapPolyline",
  "AIRMapUrlTile",
  "AIRMapWMSTile",
];

// LALABA_NO_MLKIT=1 drops react-native-vision-camera-face-detector from iOS
// autolinking, which in turn drops its GoogleMLKit dependency.
//
// WHY THIS SWITCH EXISTS
// ----------------------
// ML Kit ships no arm64 iOS-simulator slice: MLImage's arm64 objects are
// stamped platform=iOS (device), so the linker refuses them in a simulator
// build. Its podspecs say as much via
// `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`, which propagates to the app
// target and leaves the scheme with ZERO valid simulator destinations
// ("Unable to find a destination matching the provided destination specifier").
// Every simulator on an Apple Silicon Mac is arm64 and Xcode 26 has no Rosetta
// simulator, so an iOS SIMULATOR build can only exist with this pod removed.
//
// Set it for simulator work only:
//   LALABA_NO_MLKIT=1 npx expo prebuild --clean -p ios
//   LALABA_NO_MLKIT=1 npx expo run:ios
//
// Leave it UNSET for device builds, EAS, and anything shipped — those link ML
// Kit normally and get the real detector. app/courier-selfie.tsx resolves the
// module lazily and shows an explanatory fallback when it is absent, so the
// courier liveness screen degrades instead of crashing.
//
// The env var must be set for BOTH prebuild and run: autolinking is resolved at
// pod-install time, so a build that skips it will link ML Kit again and fail.
const EXCLUDE_MLKIT = process.env.LALABA_NO_MLKIT === "1";

module.exports = {
  project: {
    android: {
      unstable_reactLegacyComponentNames: RN_MAPS_LEGACY_COMPONENTS,
    },
    ios: {
      unstable_reactLegacyComponentNames: RN_MAPS_LEGACY_COMPONENTS,
    },
  },
  dependencies: EXCLUDE_MLKIT
    ? {
        "react-native-vision-camera-face-detector": {
          platforms: { ios: null },
        },
      }
    : {},
};
