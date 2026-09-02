// src/features/liveness/machine.ts
// The liveness challenge state machine, kept free of React and of the camera so
// it can be reasoned about (and tested) on its own.
//
// Shared by both faces that have to prove they are live: the courier gate
// (app/courier-selfie.tsx) and the home washer's SELFIE requirement in the
// verification checklist. The two differ only in where the photo is submitted —
// the challenge, the thresholds and the shutter rule are deliberately identical,
// which is why this module knows about neither.
//
// What this is: an on-device check that a live person is in front of the lens
// right now. What it is NOT: proof. The verdict is computed on the client and
// asserted to the server, which cannot re-derive it — a modified build can
// submit any image. It raises the effort of using a printed photo from
// "trivial" to "needs a video and some timing", and the real backstops are
// after-the-fact review (revocation for couriers, rejection for a washer's KYC
// selfie) and the photo being publicly attached to the person's work.

/**
 * The action the user is asked to perform. Mirrors the BE's LivenessChallenge
 * enum, which both submitCourierSelfie and submitKycDocument accept.
 */
export type LivenessChallenge = "BLINK" | "TURN_LEFT" | "TURN_RIGHT";

/** What the check observed, recorded alongside the photo for the reviewer. */
export type LivenessMetadata = {
  durationMs: number;
  eyesOpenScore: number;
  yawDegrees: number;
  pitchDegrees: number;
  attemptCount: number;
};

// ─── Thresholds ────────────────────────────────────────────────────────────

/** Eyes counted as open above this ML Kit probability. */
const EYES_OPEN = 0.7;
/** Eyes counted as shut below this — the gap between the two debounces blinks. */
const EYES_SHUT = 0.3;
/** Degrees of yaw/pitch still counted as "facing the camera". */
const FRONTAL_DEGREES = 15;
/** Degrees of yaw that count as a deliberate head turn. */
const TURN_DEGREES = 25;
/** Face box must occupy at least this fraction of the frame's smaller side. */
const MIN_FACE_RATIO = 0.25;
/** …and at most this, so the courier is not pressed against the lens. */
const MAX_FACE_RATIO = 0.9;
/** How long the face must hold steady after the challenge before capture. */
export const HOLD_STEADY_MS = 500;
/** Whole-attempt budget before we give up and offer a retry. */
export const ATTEMPT_TIMEOUT_MS = 30_000;

// ML Kit reports yaw relative to the image, and the front camera preview is
// mirrored — so "user turns left" may arrive as positive OR negative depending
// on platform and mirroring. Flip this single constant if the on-device
// behaviour is inverted; nothing else needs to change.
const YAW_SIGN_FOR_USER_LEFT = -1;

// ─── Frame input ───────────────────────────────────────────────────────────

/** The subset of ML Kit's Face we actually use. */
export type FaceSample = {
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  yawAngle: number;
  pitchAngle: number;
  bounds: { width: number; height: number };
  frameWidth: number;
  frameHeight: number;
};

export type LivenessPhase =
  | "positioning" // no usable face yet — coaching the courier into frame
  | "challenge" // face is good; waiting for the challenge action
  | "hold" // challenge satisfied; holding steady before the shutter
  | "ready"; // capture now

export type LivenessState = {
  phase: LivenessPhase;
  challenge: LivenessChallenge;
  /** Human-readable coaching line for the current phase. */
  prompt: string;
  /** True once the challenge action has been observed end to end. */
  challengeMet: boolean;
  /**
   * The "away" half of the two-part action, latched when seen.
   *
   * Every challenge is deliberately two-part — go away from neutral, then come
   * back. A single-frame test would be satisfied by a photo held at the right
   * angle, or by eyes that happen to be shut.
   */
  sawExtreme: boolean;
  /** Timestamp the hold began, for the steady-hold gate. */
  holdStartedAt: number | null;
  startedAt: number;
  /** Last good sample, captured for the submission's metadata. */
  lastGood: FaceSample | null;
};

export function initialState(
  challenge: LivenessChallenge,
  now: number,
): LivenessState {
  return {
    phase: "positioning",
    challenge,
    prompt: PROMPTS.positioning,
    challengeMet: false,
    sawExtreme: false,
    holdStartedAt: null,
    startedAt: now,
    lastGood: null,
  };
}

const PROMPTS = {
  positioning: "Fit your face inside the circle",
  tooFar: "Move a little closer",
  tooClose: "Move a little further away",
  notFrontal: "Look straight at the camera",
  manyFaces: "Make sure only you are in the frame",
  BLINK: "Blink slowly",
  TURN_LEFT: "Slowly turn your head to the left",
  TURN_RIGHT: "Slowly turn your head to the right",
  hold: "Hold still…",
} as const;

/** Randomised per attempt: a clip of one action does not satisfy the others. */
export function pickChallenge(): LivenessChallenge {
  const all: LivenessChallenge[] = ["BLINK", "TURN_LEFT", "TURN_RIGHT"];
  return all[Math.floor(Math.random() * all.length)];
}

const eyesOpen = (f: FaceSample): number =>
  Math.min(f.leftEyeOpenProbability ?? 1, f.rightEyeOpenProbability ?? 1);

const isFrontal = (f: FaceSample): boolean =>
  Math.abs(f.yawAngle) < FRONTAL_DEGREES &&
  Math.abs(f.pitchAngle) < FRONTAL_DEGREES;

/** Face size relative to the frame — rejects both a distant face and a lens-filling one. */
function framing(f: FaceSample): "ok" | "far" | "close" {
  const shorterSide = Math.min(f.frameWidth, f.frameHeight);
  if (shorterSide <= 0) return "ok";
  const ratio = Math.max(f.bounds.width, f.bounds.height) / shorterSide;
  if (ratio < MIN_FACE_RATIO) return "far";
  if (ratio > MAX_FACE_RATIO) return "close";
  return "ok";
}

/**
 * Advance the machine with one detector result.
 *
 * `faces` is every face in the frame: zero drops back to positioning, and more
 * than one is rejected outright rather than picking the largest — "only you in
 * frame" is a requirement, not a preference, when the output is an identity
 * photo.
 */
export function reduce(
  state: LivenessState,
  faces: FaceSample[],
  now: number,
): LivenessState {
  if (faces.length === 0) {
    return { ...state, phase: "positioning", prompt: PROMPTS.positioning, holdStartedAt: null };
  }
  if (faces.length > 1) {
    return { ...state, phase: "positioning", prompt: PROMPTS.manyFaces, holdStartedAt: null };
  }

  const face = faces[0];
  const frame = framing(face);
  if (frame !== "ok") {
    return {
      ...state,
      phase: "positioning",
      prompt: frame === "far" ? PROMPTS.tooFar : PROMPTS.tooClose,
      holdStartedAt: null,
    };
  }

  // Once the challenge is met we stop demanding frontality for the transition
  // INTO hold — the courier is on their way back to centre — but we still
  // require it to actually fire the shutter, so the saved photo faces forward.
  if (!state.challengeMet) {
    if (!isFrontal(face) && state.phase === "positioning") {
      return { ...state, phase: "positioning", prompt: PROMPTS.notFrontal, holdStartedAt: null };
    }

    const met = challengeSatisfied(state, face);
    if (!met) {
      return {
        ...state,
        phase: "challenge",
        prompt: PROMPTS[state.challenge],
        lastGood: face,
        holdStartedAt: null,
      };
    }
    return {
      ...state,
      phase: "hold",
      prompt: PROMPTS.hold,
      challengeMet: true,
      holdStartedAt: null,
      lastGood: face,
    };
  }

  // Challenge already met: require a frontal, eyes-open face held steady.
  if (!isFrontal(face) || eyesOpen(face) < EYES_OPEN) {
    return { ...state, phase: "hold", prompt: PROMPTS.hold, holdStartedAt: null, lastGood: face };
  }

  const holdStartedAt = state.holdStartedAt ?? now;
  const steadyFor = now - holdStartedAt;
  return {
    ...state,
    phase: steadyFor >= HOLD_STEADY_MS ? "ready" : "hold",
    prompt: PROMPTS.hold,
    holdStartedAt,
    lastGood: face,
  };
}

/** The return half: neutral again, after the extreme was already latched. */
function challengeSatisfied(state: LivenessState, face: FaceSample): boolean {
  if (!state.sawExtreme) return false;
  if (state.challenge === "BLINK") return eyesOpen(face) > EYES_OPEN;
  return Math.abs(face.yawAngle) < FRONTAL_DEGREES;
}

/**
 * Latches the "away" half of the current challenge. Call before `reduce` with
 * the same sample: blink needs a shut-eye frame, the turns need a frame past
 * the turn threshold in the requested direction.
 */
export function trackChallengeProgress(
  state: LivenessState,
  faces: FaceSample[],
): LivenessState {
  if (faces.length !== 1 || state.challengeMet || state.sawExtreme) return state;
  const face = faces[0];

  if (state.challenge === "BLINK") {
    return eyesOpen(face) < EYES_SHUT ? { ...state, sawExtreme: true } : state;
  }

  const wantedSign =
    state.challenge === "TURN_LEFT"
      ? YAW_SIGN_FOR_USER_LEFT
      : -YAW_SIGN_FOR_USER_LEFT;
  const turnedFarEnough = Math.abs(face.yawAngle) > TURN_DEGREES;
  const turnedTheRightWay = Math.sign(face.yawAngle) === wantedSign;
  return turnedFarEnough && turnedTheRightWay
    ? { ...state, sawExtreme: true }
    : state;
}

export function isTimedOut(state: LivenessState, now: number): boolean {
  return now - state.startedAt > ATTEMPT_TIMEOUT_MS;
}

/** Metadata recorded alongside the photo, for the admin reviewer's context. */
export function metadataFrom(
  state: LivenessState,
  now: number,
  attemptCount: number,
): LivenessMetadata {
  const face = state.lastGood;
  return {
    durationMs: Math.max(0, Math.round(now - state.startedAt)),
    eyesOpenScore: face ? Number(eyesOpen(face).toFixed(3)) : 0,
    yawDegrees: face ? Number(face.yawAngle.toFixed(2)) : 0,
    pitchDegrees: face ? Number(face.pitchAngle.toFixed(2)) : 0,
    attemptCount,
  };
}
