// src/features/liveness/LivenessCapture.tsx
// The camera half of the liveness check: permission gate, face detector, the
// randomised challenge, and the automatic shutter. Everything downstream of the
// captured JPEG — where it is submitted and what happens next — belongs to the
// caller, which is the only thing couriers and washers actually disagree about.
//
// The shutter is under machine control — there is deliberately no capture
// button. A manual shutter lets the user fire on whatever frame they like,
// which would make the whole check decorative.
//
// Callers:
//   app/courier-selfie.tsx                     — the rider's sign-in gate
//   src/screens/verification/VerificationScreenBody.tsx — the washer's SELFIE row

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  AppState,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import type { Face } from "react-native-vision-camera-face-detector";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { C, SP, RADIUS } from "../../theme/tokens";
import {
  initialState,
  reduce,
  trackChallengeProgress,
  isTimedOut,
  metadataFrom,
  pickChallenge,
  type FaceSample,
  type LivenessChallenge,
  type LivenessMetadata,
  type LivenessState,
} from "./machine";

// Face detection is ML Kit-backed, and ML Kit ships NO arm64 iOS-simulator
// slice — MLImage's arm64 objects are stamped platform=iOS (device), so ld
// refuses them in a simulator build:
//
//   ld: building for 'iOS-simulator', but linking in object file
//   (MLImage.framework/MLImage[arm64][2](GMLImage.o)) built for 'iOS'
//
// Every simulator on an Apple Silicon Mac is arm64 and Xcode 26 offers no
// Rosetta simulator, so an iOS simulator build can only exist without the pod.
// LALABA_NO_MLKIT=1 drops it from autolinking (see react-native.config.js).
//
// The JS package is still in node_modules in that build, but its Nitro native
// object is never registered — so resolve it lazily and let this one screen
// degrade rather than taking the whole app down at import time. The `import
// type` above is erased at compile time and is safe to keep static.
//
// This is a DEV-ONLY degradation: device and EAS builds link ML Kit normally
// and get the real detector. Liveness cannot be tested in a simulator.
let FaceCamera: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FaceCamera = require("react-native-vision-camera-face-detector").Camera ?? null;
} catch {
  FaceCamera = null;
}

// Long edge of the uploaded image. Small on purpose: it is a face, not a
// document scan, and the re-encode at this size is what strips EXIF, keeps the
// payload inside the request timeout, and forces JPEG.
const UPLOAD_MAX_EDGE = 1080;
const UPLOAD_QUALITY = 0.8;

/** A passing capture, re-encoded and ready to submit. */
export interface LivenessCapturePhoto {
  /** JPEG bytes, base64, EXIF already stripped by the re-encode. */
  base64: string;
  /** Always "image/jpeg" — both submit paths reject anything else. */
  mimeType: string;
  challenge: LivenessChallenge;
  metadata: LivenessMetadata;
}

export interface LivenessCaptureProps {
  /** Heading above the preview. */
  title: string;
  /** One line under the heading, explaining what the photo is for. */
  subtitle: string;
  /**
   * Submit the capture. Throwing lands the user on the retry screen with the
   * error's message, so surface something they can act on; resolving means the
   * caller has taken over (navigated away, closed the sheet) and this component
   * stops touching the camera.
   */
  onCaptured: (photo: LivenessCapturePhoto) => Promise<void>;
  /** Label for the one way out — "Cancel" on a retake, "Sign out" on a gate. */
  escapeLabel: string;
  onEscape: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Which edges to inset for. Defaults to all of them, which is what a
   * standalone route wants. An overlay rendered inside an already-inset parent
   * passes ["bottom"], otherwise the top is inset twice and the content sits a
   * status bar's height too low.
   */
  safeAreaEdges?: readonly ("top" | "bottom" | "left" | "right")[];
}

type Screen =
  // Before the permission hook has reported. One render long, but binding the
  // camera during it would mean binding it without permission.
  | { kind: "checking" }
  | { kind: "needsPermission"; canAsk: boolean }
  | { kind: "scanning" }
  | { kind: "uploading" }
  | { kind: "failed"; message: string };

export function LivenessCapture({
  title,
  subtitle,
  onCaptured,
  escapeLabel,
  onEscape,
  style,
  safeAreaEdges,
}: Readonly<LivenessCaptureProps>) {
  const isFocused = useIsFocused();
  const { hasPermission, requestPermission, canRequestPermission } =
    useCameraPermission();
  // Front camera only — a selfie taken on the rear lens defeats the point, and
  // it is what the face detector is configured against.
  const device = useCameraDevice("front");

  const [screen, setScreen] = useState<Screen>({ kind: "checking" });
  const [prompt, setPrompt] = useState("Fit your face inside the circle");
  const [challenge, setChallenge] = useState<LivenessChallenge>(() =>
    pickChallenge(),
  );

  // The machine lives in a ref, not state: onFacesDetected fires per camera
  // frame, and re-rendering 30x/second would make the preview stutter. Only the
  // coaching line is lifted into state, and only when it actually changes.
  const machine = useRef<LivenessState>(initialState(challenge, Date.now()));
  const attemptCount = useRef(1);
  const capturing = useRef(false);
  const appActive = useRef(true);

  const photoOutput = usePhotoOutput({ quality: UPLOAD_QUALITY });

  // Pause the camera when the app is backgrounded — a live camera session in
  // the background is both a battery drain and a bad look for a face capture.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      appActive.current = s === "active";
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (hasPermission) {
      // Only leave the pre-camera screens — clobbering "uploading" or "failed"
      // here would drop the user back into scanning mid-flight.
      setScreen((cur) =>
        cur.kind === "needsPermission" || cur.kind === "checking"
          ? { kind: "scanning" }
          : cur,
      );
    } else {
      setScreen({ kind: "needsPermission", canAsk: canRequestPermission });
    }
  }, [hasPermission, canRequestPermission]);

  const restartAttempt = useCallback(() => {
    const next = pickChallenge();
    setChallenge(next);
    machine.current = initialState(next, Date.now());
    capturing.current = false;
    setPrompt(machine.current.prompt);
    setScreen({ kind: "scanning" });
  }, []);

  const submit = useCallback(async () => {
    const state = machine.current;
    try {
      // Both the capture and the write to disk have to happen while the session
      // is still live. `isActive` is derived from `screen`, so flipping to
      // "uploading" any earlier unbinds the camera out from under the pending
      // request and CameraX aborts it with "Camera is closed."
      const photo = await photoOutput.capturePhoto({}, {});
      let path: string;
      try {
        path = await photo.saveToTemporaryFileAsync();
      } finally {
        // Photos hold large native buffers; not disposing leaks until GC.
        photo.dispose();
      }
      // Safe now: the frame is a file on disk and no longer needs the camera.
      setScreen({ kind: "uploading" });

      const uri = path.startsWith("file://") ? path : `file://${path}`;
      // Re-encode: strips EXIF (a raw selfie carries GPS, and this image is
      // published publicly), bounds the payload, and guarantees JPEG.
      const processed = await manipulateAsync(
        uri,
        [{ resize: { width: UPLOAD_MAX_EDGE } }],
        { base64: true, compress: UPLOAD_QUALITY, format: SaveFormat.JPEG },
      );
      if (!processed.base64) throw new Error("Could not read the photo.");

      await onCaptured({
        base64: processed.base64,
        mimeType: "image/jpeg",
        challenge: state.challenge,
        metadata: metadataFrom(state, Date.now(), attemptCount.current),
      });
    } catch (err) {
      attemptCount.current += 1;
      setScreen({
        kind: "failed",
        message:
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong. Please try again.",
      });
    }
  }, [photoOutput, onCaptured]);

  const onFacesDetected = useCallback(
    (faces: Face[]) => {
      if (capturing.current || !appActive.current) return;

      const now = Date.now();
      const samples: FaceSample[] = faces.map((f) => ({
        leftEyeOpenProbability: f.leftEyeOpenProbability,
        rightEyeOpenProbability: f.rightEyeOpenProbability,
        yawAngle: f.yawAngle,
        pitchAngle: f.pitchAngle,
        bounds: { width: f.bounds.width, height: f.bounds.height },
        frameWidth: f.frameWidth,
        frameHeight: f.frameHeight,
      }));

      const advanced = reduce(
        trackChallengeProgress(machine.current, samples),
        samples,
        now,
      );
      machine.current = advanced;

      if (advanced.prompt !== prompt) setPrompt(advanced.prompt);

      if (advanced.phase === "ready") {
        // `capturing` is the lock that stops further frames re-entering here;
        // submit() moves the screen to "uploading" once the shot is on disk.
        capturing.current = true;
        void submit();
        return;
      }

      if (isTimedOut(advanced, now)) {
        capturing.current = true;
        attemptCount.current += 1;
        setScreen({
          kind: "failed",
          message:
            "We could not confirm a live face. Find better lighting and try again.",
        });
      }
    },
    [prompt, submit],
  );

  // The one way out. A gate has nowhere to go back to and offers Sign out; a
  // retake still has a working session behind it and offers Cancel.
  const escapeHatch = (
    <TouchableOpacity onPress={onEscape} style={styles.linkBtn}>
      <Text style={styles.linkText}>{escapeLabel}</Text>
    </TouchableOpacity>
  );

  const cameraActive = useMemo(
    () => isFocused && screen.kind === "scanning",
    [isFocused, screen.kind],
  );

  // ─── Permission gate ─────────────────────────────────────────────────────
  // Deliberately a hard state, not the alert-and-bail used elsewhere in the
  // app: there is nothing else to do on this screen until it is resolved, so a
  // dismissible toast would leave the user stuck with nothing to act on.
  if (screen.kind === "needsPermission") {
    return (
      <SafeAreaView style={[styles.container, style]} edges={safeAreaEdges}>
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={56} color={C.gray200} />
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.body}>
            We need your camera to confirm a live photo of you.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              if (screen.canAsk) void requestPermission();
              else void Linking.openSettings();
            }}
          >
            <Text style={styles.primaryBtnText}>
              {screen.canAsk ? "Allow camera" : "Open settings"}
            </Text>
          </TouchableOpacity>
          {escapeHatch}
        </View>
      </SafeAreaView>
    );
  }

  if (screen.kind === "checking") {
    return (
      <SafeAreaView style={[styles.container, style]} edges={safeAreaEdges}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.brand500} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen.kind === "failed") {
    return (
      <SafeAreaView style={[styles.container, style]} edges={safeAreaEdges}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={56} color={C.gray200} />
          <Text style={styles.title}>Let&apos;s try that again</Text>
          <Text style={styles.body}>{screen.message}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={restartAttempt}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
          {escapeHatch}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, style]} edges={safeAreaEdges}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{subtitle}</Text>
      </View>

      <View style={styles.previewWrap}>
        {device && FaceCamera ? (
          <FaceCamera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={cameraActive}
            cameraFacing="front"
            outputs={[photoOutput]}
            // Classifications are OFF by default — without this there are no
            // eye-open probabilities at all and the blink challenge silently
            // never passes.
            runClassifications
            performanceMode="accurate"
            onFacesDetected={onFacesDetected}
            onError={(err: Error) =>
              setScreen({ kind: "failed", message: err.message })
            }
          />
        ) : !FaceCamera ? (
          // Simulator build with ML Kit excluded. Distinct from "no camera" so
          // nobody spends an afternoon debugging a camera that is present and
          // working — the detector simply is not in this binary.
          <View style={styles.noCamera}>
            <Ionicons name="phone-portrait-outline" size={40} color={C.gray300} />
            <Text style={styles.noCameraText}>
              Face detection is not available in this build. Run the liveness
              check on a real device.
            </Text>
          </View>
        ) : (
          // No front camera at all (rare, but a tablet or an emulator without
          // one will land here). Say so rather than showing a dead black box.
          <View style={styles.noCamera}>
            <Ionicons name="videocam-off-outline" size={40} color={C.gray300} />
            <Text style={styles.noCameraText}>
              No front camera found on this device.
            </Text>
          </View>
        )}
        <View pointerEvents="none" style={styles.ovalMask} />
        {screen.kind === "uploading" && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.uploadingText}>Uploading…</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.prompt}>
          {screen.kind === "uploading" ? "Almost done…" : prompt}
        </Text>
        <Text style={styles.hint}>
          The photo is taken automatically once we can see you clearly.
        </Text>
        {escapeHatch}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP._24,
    gap: SP._12,
  },
  header: { paddingHorizontal: SP._24, paddingTop: SP._16, gap: SP._4 },
  title: { fontSize: 22, fontWeight: "700", color: C.gray900 },
  body: { fontSize: 14, color: C.gray500, textAlign: "center", lineHeight: 20 },
  previewWrap: {
    flex: 1,
    margin: SP._24,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    backgroundColor: C.gray900,
  },
  ovalMask: {
    position: "absolute",
    top: "10%",
    left: "12%",
    right: "12%",
    bottom: "10%",
    borderRadius: 9999,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: SP._12,
  },
  uploadingText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  noCamera: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: SP._8,
    paddingHorizontal: SP._24,
  },
  noCameraText: { color: C.gray300, fontSize: 14, textAlign: "center" },
  footer: {
    paddingHorizontal: SP._24,
    paddingBottom: SP._24,
    alignItems: "center",
    gap: SP._4,
  },
  prompt: { fontSize: 18, fontWeight: "700", color: C.gray900 },
  hint: { fontSize: 13, color: C.gray500, textAlign: "center" },
  primaryBtn: {
    marginTop: SP._12,
    backgroundColor: C.brand500,
    paddingHorizontal: SP._24,
    paddingVertical: SP._12,
    borderRadius: RADIUS.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkBtn: { marginTop: SP._16, padding: SP._8 },
  linkText: { color: C.gray500, fontSize: 14, fontWeight: "600" },
});
