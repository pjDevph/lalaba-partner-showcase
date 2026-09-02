// app/(washer)/legal.tsx
// Routed wrapper around the shared LegalScreenInline (Terms / Privacy) for the
// washer settings hub — mirrors app/(courier)/legal.tsx so the wording stays
// identical to the Register agreement across every role.
import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { LegalScreenInline } from "../../src/screens/settings/LegalScreen";
import type { LegalKind } from "../../src/components/LegalBody";

export default function WasherLegalScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const resolvedKind: LegalKind = kind === "terms" ? "terms" : "privacy";
  return (
    <LegalScreenInline
      kind={resolvedKind}
      // replace, not back: legal is registered as a hidden tab, so back() would
      // unwind to the navigator's initial route (Home) rather than Settings.
      onBack={() => router.replace("/(washer)/settings" as never)}
    />
  );
}
