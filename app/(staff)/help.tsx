// app/(staff)/help.tsx
// Routed wrapper around the shared HelpSupportScreenInline for the staff
// profile hub — merchant Settings uses the same component inline.
import React from "react";
import { router } from "expo-router";
import { HelpSupportScreenInline } from "../../src/screens/settings/HelpSupportScreen";

export default function StaffHelpScreen() {
  return (
    <HelpSupportScreenInline onBack={() => router.replace("/(staff)/profile")} />
  );
}
