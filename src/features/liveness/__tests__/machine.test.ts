import {
  initialState,
  reduce,
  trackChallengeProgress,
  isTimedOut,
  metadataFrom,
  pickChallenge,
  HOLD_STEADY_MS,
  ATTEMPT_TIMEOUT_MS,
  type FaceSample,
  type LivenessState,
} from "../machine";

// A well-framed, frontal, eyes-open face. Individual tests override one axis at
// a time so each assertion isolates the property it is about.
const face = (over: Partial<FaceSample> = {}): FaceSample => ({
  leftEyeOpenProbability: 0.95,
  rightEyeOpenProbability: 0.95,
  yawAngle: 0,
  pitchAngle: 0,
  bounds: { width: 400, height: 400 },
  frameWidth: 1000,
  frameHeight: 1000,
  ...over,
});

// Feed one sample through both halves of the pipeline, the way the screen does.
const step = (s: LivenessState, faces: FaceSample[], now: number) =>
  reduce(trackChallengeProgress(s, faces), faces, now);

describe("liveness state machine", () => {
  describe("positioning", () => {
    it("waits when no face is present", () => {
      const s = step(initialState("BLINK", 0), [], 10);
      expect(s.phase).toBe("positioning");
      expect(s.prompt).toMatch(/inside the circle/i);
    });

    it("rejects more than one face rather than picking the largest", () => {
      // The output is an identity photo, so "only you in frame" is a
      // requirement — silently choosing a face would defeat the point.
      const s = step(initialState("BLINK", 0), [face(), face()], 10);
      expect(s.phase).toBe("positioning");
      expect(s.prompt).toMatch(/only you/i);
    });

    it("coaches a face that is too far away", () => {
      const s = step(
        initialState("BLINK", 0),
        [face({ bounds: { width: 100, height: 100 } })],
        10,
      );
      expect(s.prompt).toMatch(/closer/i);
    });

    it("coaches a face that fills the lens", () => {
      const s = step(
        initialState("BLINK", 0),
        [face({ bounds: { width: 980, height: 980 } })],
        10,
      );
      expect(s.prompt).toMatch(/further away/i);
    });

    it("coaches a face that is turned away at the start", () => {
      const s = step(initialState("BLINK", 0), [face({ yawAngle: 40 })], 10);
      expect(s.prompt).toMatch(/straight at the camera/i);
    });
  });

  describe("BLINK challenge", () => {
    it("is not satisfied by open eyes alone", () => {
      let s = initialState("BLINK", 0);
      s = step(s, [face()], 10);
      expect(s.challengeMet).toBe(false);
      expect(s.phase).toBe("challenge");
    });

    it("is not satisfied by shut eyes alone — a still frame must not pass", () => {
      let s = initialState("BLINK", 0);
      s = step(
        s,
        [face({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 })],
        10,
      );
      expect(s.challengeMet).toBe(false);
    });

    it("passes on shut-then-open", () => {
      let s = initialState("BLINK", 0);
      s = step(
        s,
        [face({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 })],
        10,
      );
      s = step(s, [face()], 20);
      expect(s.challengeMet).toBe(true);
      expect(s.phase).toBe("hold");
    });
  });

  describe("turn challenges", () => {
    it("ignores a turn in the wrong direction", () => {
      let s = initialState("TURN_LEFT", 0);
      // Opposite sign to what TURN_LEFT wants.
      s = step(s, [face({ yawAngle: 40 })], 10);
      s = step(s, [face({ yawAngle: 0 })], 20);
      expect(s.challengeMet).toBe(false);
    });

    it("ignores a turn that never reaches the threshold", () => {
      let s = initialState("TURN_LEFT", 0);
      s = step(s, [face({ yawAngle: -18 })], 10);
      s = step(s, [face({ yawAngle: 0 })], 20);
      expect(s.challengeMet).toBe(false);
    });

    it("passes on turn-then-return", () => {
      let s = initialState("TURN_LEFT", 0);
      s = step(s, [face({ yawAngle: -40 })], 10);
      s = step(s, [face({ yawAngle: 0 })], 20);
      expect(s.challengeMet).toBe(true);
    });

    it("does not pass while still held at the extreme", () => {
      // A photo tilted to the right angle stays at the extreme forever and
      // never produces the return frame.
      let s = initialState("TURN_RIGHT", 0);
      s = step(s, [face({ yawAngle: 40 })], 10);
      s = step(s, [face({ yawAngle: 42 })], 20);
      expect(s.challengeMet).toBe(false);
    });
  });

  describe("hold before capture", () => {
    const passBlink = () => {
      let s = initialState("BLINK", 0);
      s = step(
        s,
        [face({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 })],
        10,
      );
      return step(s, [face()], 20);
    };

    it("does not fire the shutter immediately", () => {
      const s = step(passBlink(), [face()], 30);
      expect(s.phase).toBe("hold");
    });

    it("fires once the face has been steady long enough", () => {
      let s = passBlink();
      s = step(s, [face()], 100);
      s = step(s, [face()], 100 + HOLD_STEADY_MS);
      expect(s.phase).toBe("ready");
    });

    it("restarts the hold if the face turns away mid-hold", () => {
      let s = passBlink();
      s = step(s, [face()], 100);
      s = step(s, [face({ yawAngle: 45 })], 200);
      expect(s.holdStartedAt).toBeNull();
      s = step(s, [face()], 300);
      expect(s.phase).toBe("hold");
    });

    it("will not capture with shut eyes even after the challenge passed", () => {
      let s = passBlink();
      s = step(
        s,
        [face({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 })],
        100 + HOLD_STEADY_MS * 2,
      );
      expect(s.phase).not.toBe("ready");
    });
  });

  describe("timeout and metadata", () => {
    it("times out an attempt that drags on", () => {
      const s = initialState("BLINK", 0);
      expect(isTimedOut(s, ATTEMPT_TIMEOUT_MS - 1)).toBe(false);
      expect(isTimedOut(s, ATTEMPT_TIMEOUT_MS + 1)).toBe(true);
    });

    it("reports the observed sample for the reviewer", () => {
      let s = initialState("BLINK", 0);
      s = step(s, [face({ yawAngle: 3.14159, pitchAngle: -2.5 })], 500);
      const meta = metadataFrom(s, 1500, 2);
      expect(meta.durationMs).toBe(1500);
      expect(meta.attemptCount).toBe(2);
      expect(meta.yawDegrees).toBeCloseTo(3.14, 2);
      expect(meta.eyesOpenScore).toBeGreaterThan(0.9);
    });

    it("produces metadata even when no face was ever seen", () => {
      const meta = metadataFrom(initialState("BLINK", 0), 1000, 1);
      expect(meta.eyesOpenScore).toBe(0);
    });
  });

  it("randomises the challenge across attempts", () => {
    const seen = new Set(Array.from({ length: 60 }, () => pickChallenge()));
    // All three should appear; a fixed challenge would make a recorded clip
    // reusable forever.
    expect(seen.size).toBe(3);
  });
});
