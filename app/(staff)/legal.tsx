// app/(staff)/legal.tsx
// Routed wrapper around the shared LegalScreenInline (Terms / Privacy) for the
// staff profile hub — merchant Settings uses the same component inline.
import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { LegalScreenInline } from "../../src/screens/settings/LegalScreen";
import type { LegalKind } from "../../src/components/LegalBody";

export default function StaffLegalScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const resolvedKind: LegalKind = kind === "terms" ? "terms" : "privacy";
  return (
    <LegalScreenInline
      kind={resolvedKind}
      onBack={() => router.replace("/(staff)/profile")}
    />
  );
}
