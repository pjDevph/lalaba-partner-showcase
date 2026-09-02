// app/(courier)/legal.tsx
// Routed wrapper around the shared LegalScreenInline (Terms / Privacy) for the
// courier profile — mirrors app/(staff)/legal.tsx so the wording stays identical
// to the Register agreement across every role.
import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { LegalScreenInline } from "../../src/screens/settings/LegalScreen";
import type { LegalKind } from "../../src/components/LegalBody";

export default function CourierLegalScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const resolvedKind: LegalKind = kind === "terms" ? "terms" : "privacy";
  return (
    <LegalScreenInline
      kind={resolvedKind}
      // replace, not back: legal is registered as a hidden tab, so back() would
      // unwind to the navigator's initial route (Tasks) rather than Profile.
      onBack={() => router.replace("/(courier)/profile")}
    />
  );
}
