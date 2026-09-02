// app/courier-selfie.tsx
// The courier liveness gate. A rider cannot reach the task board until they
// have taken a selfie with a live face behind it; that photo then becomes their
// profile picture.
//
// The camera, the challenge and the automatic shutter live in
// src/features/liveness/LivenessCapture — shared with the home washer's SELFIE
// requirement. What is courier-specific, and all this screen owns, is where the
// photo is submitted and where the rider goes afterwards.
//
// Mirrors the /device-pending gate: this screen owns its own exit navigation,
// because the routing effect in app/_layout.tsx has already burned `routedFor`
// for this uid and will not re-run.
//
// Two ways in, distinguished by the `mode` param:
//   gate    (default) — routed here at sign-in with no live selfie. There is no
//                       way out but a passing capture, so the only escape hatch
//                       offered is Sign out.
//   retake  — pushed from the courier profile by a rider who still has a
//             session. Usually because an admin revoked their photo mid-shift:
//             before this existed the only way back to the camera was to sign
//             out and in again. Cancellable, and it returns where it came from.

import React, { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../src/stores/authStore";
import { gqlSubmitCourierSelfie } from "../src/services/graphql/courierSelfie";
import {
  LivenessCapture,
  type LivenessCapturePhoto,
} from "../src/features/liveness/LivenessCapture";

export default function CourierSelfieScreen() {
  const user = useAuthStore((s) => s.user);
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // Only treat it as a retake if we can actually get back — a deep link
  // straight to ?mode=retake has no screen behind it, and offering "Cancel"
  // there would be a button that does nothing. Read once on mount: the answer
  // changes as this screen navigates away, and a mid-flow flip to "gate" would
  // swap the buttons out from under the rider.
  const [isRetake] = useState(() => mode === "retake" && router.canGoBack());

  const onCaptured = useCallback(
    async (photo: LivenessCapturePhoto) => {
      const selfie = await gqlSubmitCourierSelfie({
        base64: photo.base64,
        mimeType: photo.mimeType,
        livenessChallenge: photo.challenge,
        livenessMetadata: photo.metadata,
      });

      // Reflect it immediately so the profile screen has the photo without a
      // refetch, then leave — this screen owns its own exit. A retake returns
      // to the profile it was opened from; the gate has nothing behind it and
      // hands the rider their task board.
      useAuthStore.getState().setPhotoUrl(selfie.publicUrl);
      if (isRetake) router.back();
      else router.replace("/(courier)/dashboard");
    },
    [isRetake],
  );

  return (
    <LivenessCapture
      title={isRetake ? "Retake your photo" : "Verify it's you"}
      subtitle={
        isRetake
          ? "The new photo replaces your current profile picture."
          : user?.displayName
            ? `Hi ${user.displayName.split(" ")[0]} — this photo becomes your profile picture.`
            : "This photo becomes your profile picture."
      }
      onCaptured={onCaptured}
      escapeLabel={isRetake ? "Cancel" : "Sign out"}
      onEscape={
        isRetake
          ? () => router.back()
          : () => void useAuthStore.getState().signOut()
      }
    />
  );
}
