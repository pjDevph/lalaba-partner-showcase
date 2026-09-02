// src/features/verification/IdCardCapture.tsx
// An in-app camera for photographing a government ID, with a card-shaped guide
// drawn over the preview.
//
// Why this exists at all: "Take photo" used to call pickFromCamera(), which
// launches the OPERATING SYSTEM's camera — a screen this app does not own and
// cannot draw on. The washer got no framing help, and the reviewer got back the
// blurry, cropped, glare-covered photos that BLURRY / INCOMPLETE / OBSCURED
// rejections are made of. pickFromCamera is still the right tool for document
// types with no fixed shape; an ID-1 card has one, so it gets a guide.
//
// Structurally this is LivenessCapture minus the liveness. The permission gate,
// the capture→disk→re-encode pipeline and the retry screen are lifted from it
// deliberately — those parts were paid for in device debugging and the comments
// carrying that knowledge are reproduced with them. Four things differ on
// purpose:
//
//   1. A MANUAL shutter. The selfie's automatic shutter *is* its liveness check
//      ("a manual shutter lets the user fire on whatever frame they like, which
//      would make the whole check decorative"). There is no such check here, so
//      the button is correct rather than a regression.
//   2. The BACK camera. Nobody photographs an ID with the selfie lens.
//   3. The plain vision-camera `Camera`, not the face-detector's wrapper. No
//      face detection is wanted — and as a bonus this component carries no ML
//      Kit dependency, so unlike the selfie it works in the iOS simulator.
//   4. A larger upload edge. See UPLOAD_MAX_EDGE.

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
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { C, SP, RADIUS } from "../../theme/tokens";

// Long edge of the uploaded image. Nearly double the selfie's 1080: that one is
// a face, where 1080 is generous, but a reviewer has to READ an ID number off
// this one and 1080 is where small print stops being legible. A 2000px JPEG at
// this quality lands around 0.5–1 MB base64, well inside the backend's 7 MiB
// cap — and the re-encode still strips EXIF (a raw photo carries GPS) and
// guarantees JPEG, which is the other reason it happens at all.
const UPLOAD_MAX_EDGE = 2000;
const UPLOAD_QUALITY = 0.85;

/** ID-1, the ISO/IEC 7810 format every Philippine ID card in the picker uses. */
const CARD_ASPECT_RATIO = 1.586;

export interface IdCardCapturePhoto {
  /** JPEG bytes, base64, EXIF already stripped by the re-encode. */
  base64: string;
  /** Always "image/jpeg" — the submit path rejects anything else. */
  mimeType: string;
}

export interface IdCardCaptureProps {
  /** Heading above the preview — "Front of ID" / "Back of ID". */
  title: string;
  /** One line under it, saying what to line up. */
  subtitle: string;
  /**
   * Submit the capture. Throwing lands the user on the retry screen with the
   * error's message, so surface something they can act on; resolving means the
   * caller has taken over (closed the overlay) and this component stops
   * touching the camera.
   */
  onCaptured: (photo: IdCardCapturePhoto) => Promise<void>;
  escapeLabel: string;
  onEscape: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Which edges to inset for. An overlay rendered inside an already-inset
   * parent passes ["bottom"], otherwise the top is inset twice and the content
   * sits a status bar's height too low.
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

export function IdCardCapture({
  title,
  subtitle,
  onCaptured,
  escapeLabel,
  onEscape,
  style,
  safeAreaEdges,
}: Readonly<IdCardCaptureProps>) {
  const isFocused = useIsFocused();
  const { hasPermission, requestPermission, canRequestPermission } =
    useCameraPermission();
  const device = useCameraDevice("back");

  const [screen, setScreen] = useState<Screen>({ kind: "checking" });
  const [torchOn, setTorchOn] = useState(false);

  // Whether the native session is actually RUNNING, straight from
  // onStarted/onStopped. Distinct from `cameraActive` below, which is only our
  // *request* for it to run — the gap between the two is where the torch crash
  // lived. See `torchMode`.
  const [sessionRunning, setSessionRunning] = useState(false);

  // Guards the shutter against a double tap landing two capturePhoto calls on
  // one session. A ref, not state: it has to be readable synchronously inside
  // the handler that sets it.
  const capturing = useRef(false);
  const appActive = useRef(true);

  const photoOutput = usePhotoOutput({ quality: UPLOAD_QUALITY });

  // Pause the camera when the app is backgrounded — a live camera session in
  // the background is both a battery drain and a bad look on an ID screen.
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
    capturing.current = false;
    setScreen({ kind: "scanning" });
  }, []);

  const capture = useCallback(async () => {
    if (capturing.current || !appActive.current) return;
    capturing.current = true;
    try {
      // Two try blocks, not one, because the two halves fail differently. Any
      // error out of THIS half comes from the native camera, so its message is
      // a stack trace and must not reach the user.
      let base64: string;
      try {
        // Both the capture and the write to disk have to happen while the
        // session is still live. `isActive` is derived from `screen`, so
        // flipping to "uploading" any earlier unbinds the camera out from under
        // the pending request and CameraX aborts it with "Camera is closed."
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
        const processed = await manipulateAsync(
          uri,
          [{ resize: { width: UPLOAD_MAX_EDGE } }],
          { base64: true, compress: UPLOAD_QUALITY, format: SaveFormat.JPEG },
        );
        if (!processed.base64) throw new Error("no base64 from manipulateAsync");
        base64 = processed.base64;
      } catch (err) {
        console.warn("[IdCardCapture] capture failed", err);
        setScreen({
          kind: "failed",
          message: "We couldn't take that photo. Please try again.",
        });
        return;
      }

      // The caller's errors ARE user-facing — "That file is larger than 5 MB",
      // a server validation message — so those pass through verbatim.
      await onCaptured({ base64, mimeType: "image/jpeg" });
    } catch (err) {
      setScreen({
        kind: "failed",
        message:
          err instanceof Error && err.message
            ? err.message
            : "That photo could not be uploaded. Please try again.",
      });
    } finally {
      capturing.current = false;
    }
  }, [photoOutput, onCaptured]);

  /**
   * Camera-layer errors, which are NOT the same thing as a failed capture.
   *
   * Two rules, both learned from the torch crash this screen shipped with:
   *
   *  1. Never show the user `err.message`. These come from the native layer and
   *     are Kotlin stack traces dozens of frames long — the first version of
   *     this screen rendered one as body copy.
   *  2. Never escalate an error that arrives while we are not scanning. By then
   *     the frame is already on disk and uploading; a late teardown complaint
   *     from a session we are done with must not tear down a capture that
   *     succeeded.
   */
  const onCameraError = useCallback((err: Error) => {
    // Kept for diagnosis — the detail is genuinely useful, just not to the user.
    console.warn("[IdCardCapture] camera error", err);
    setScreen((cur) =>
      cur.kind === "scanning"
        ? {
            kind: "failed",
            message:
              "The camera stopped unexpectedly. Try again, or use Upload file instead.",
          }
        : cur,
    );
  }, []);

  // The one way out, on every screen.
  const escapeHatch = (
    <TouchableOpacity onPress={onEscape} style={styles.linkBtn}>
      <Text style={styles.linkText}>{escapeLabel}</Text>
    </TouchableOpacity>
  );

  const cameraActive = useMemo(
    () => isFocused && screen.kind === "scanning",
    [isFocused, screen.kind],
  );

  /**
   * `undefined` — not merely "off" — unless the session is genuinely live.
   *
   * vision-camera's torch updater is an effect keyed on this prop that calls
   * `controller.setTorchMode(...)` on every change, early-returning only when
   * the value is null/undefined. The controller is built from the session and
   * outputs and does NOT depend on `isActive`, so it stays alive and callable
   * across a stop/start — which means a value change at the wrong moment fires
   * a real call at a session that is not running, and it rejects with
   * `CameraControl$OperationCanceledException: Camera is not active`.
   *
   * Both bounds are therefore needed, and they are deliberately asymmetric:
   *
   *   cameraActive   flips false SYNCHRONOUSLY as we tear down, so the prop is
   *                  already undefined before the stop is issued.
   *   sessionRunning flips true only when onStarted fires, so coming back from
   *                  a retry cannot set the torch before the session restarts.
   *
   * The torch needs no explicit "off": CameraX releases it with the session.
   * `torchOn` deliberately survives, so a retry comes back with the light the
   * user had already chosen.
   */
  const torchMode = useMemo(() => {
    if (!cameraActive || !sessionRunning) return undefined;
    return torchOn ? ("on" as const) : ("off" as const);
  }, [cameraActive, sessionRunning, torchOn]);

  // ─── Permission gate ─────────────────────────────────────────────────────
  // A hard state, not the alert-and-bail used elsewhere: there is nothing else
  // to do on this screen until it is resolved, so a dismissible toast would
  // leave the user stuck with nothing to act on.
  if (screen.kind === "needsPermission") {
    return (
      <SafeAreaView style={[styles.container, style]} edges={safeAreaEdges}>
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={56} color={C.gray200} />
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.body}>
            We need your camera to photograph your ID.
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

  const uploading = screen.kind === "uploading";

  return (
    <SafeAreaView style={[styles.container, style]} edges={safeAreaEdges}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{subtitle}</Text>
      </View>

      <View style={styles.previewWrap}>
        {device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={cameraActive}
            outputs={[photoOutput]}
            torchMode={torchMode}
            onStarted={() => setSessionRunning(true)}
            onStopped={() => setSessionRunning(false)}
            // Tap-to-focus matters more here than anywhere else in the app: a
            // camera that has focused past a card held close renders exactly
            // the unreadable photo this screen exists to prevent.
            enableNativeTapToFocusGesture
            onError={onCameraError}
          />
        ) : (
          // No rear camera (rare, but some tablets and emulators land here).
          // Say so rather than showing a dead black box.
          <View style={styles.noCamera}>
            <Ionicons name="videocam-off-outline" size={40} color={C.gray300} />
            <Text style={styles.noCameraText}>
              No rear camera found on this device. Use Upload file instead.
            </Text>
          </View>
        )}

        {/* The guide. Four dimmed bars around a transparent window, rather than
            one overlay with a hole — React Native has no cut-out, and four
            plain Views need no SVG dependency. pointerEvents="none" throughout
            so none of it can swallow a tap-to-focus or the shutter. */}
        <View pointerEvents="none" style={styles.guideRoot}>
          <View style={styles.scrim} />
          <View style={styles.guideMiddleRow}>
            <View style={styles.scrim} />
            <View style={styles.window}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <View style={styles.scrim} />
          </View>
          <View style={styles.scrim} />
        </View>

        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.uploadingText}>Uploading…</Text>
          </View>
        )}

        {device?.hasTorch && sessionRunning && !uploading && (
          <TouchableOpacity
            style={styles.torchBtn}
            onPress={() => setTorchOn((on) => !on)}
            accessibilityRole="button"
            accessibilityState={{ selected: torchOn }}
            accessibilityLabel={torchOn ? "Turn off light" : "Turn on light"}
          >
            <Ionicons
              name={torchOn ? "flashlight" : "flashlight-outline"}
              size={20}
              color={torchOn ? C.brand500 : "#fff"}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.prompt}>
          {uploading ? "Almost done…" : "Fit your ID inside the frame"}
        </Text>
        <Text style={styles.hint}>
          Fill the frame, keep all four corners visible, and avoid glare.
        </Text>

        <TouchableOpacity
          style={[styles.shutter, (uploading || !device) && styles.shutterOff]}
          onPress={() => void capture()}
          disabled={uploading || !device}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        {escapeHatch}
      </View>
    </SafeAreaView>
  );
}

const CORNER = 22;
const CORNER_WIDTH = 3;

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

  guideRoot: { ...StyleSheet.absoluteFillObject },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  // The window is sized by aspect ratio off the available width rather than by
  // fixed points, so it stays a card on every screen size — and it is the only
  // child here with an intrinsic height, so the row takes its height from it.
  //
  // alignItems is left at the default "stretch" on purpose: under "center" the
  // side scrims collapse to zero height and the strips either side of the card
  // never get dimmed.
  guideMiddleRow: { flexDirection: "row" },
  window: {
    width: "86%",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: "#fff",
  },
  cornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: RADIUS.md,
  },
  cornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: RADIUS.md,
  },
  cornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: RADIUS.md,
  },
  cornerBottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: RADIUS.md,
  },

  torchBtn: {
    position: "absolute",
    top: SP._12,
    right: SP._12,
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
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
  shutter: {
    marginTop: SP._16,
    width: 68,
    height: 68,
    borderRadius: RADIUS.full,
    borderWidth: 3,
    borderColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterOff: { opacity: 0.4 },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.full,
    backgroundColor: C.brand500,
  },
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
