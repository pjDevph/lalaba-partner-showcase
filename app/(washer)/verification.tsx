// app/(washer)/verification.tsx
// Washer › Verification — reached from the Verification card at the top of
// Settings. Registered as a hidden route (href: null) in _layout.tsx, like the
// other washer sub-screens.

import React from "react";
import { WasherVerificationScreen } from "../../src/screens/verification/WasherVerificationScreen";

export default function WasherVerificationRoute() {
  return <WasherVerificationScreen />;
}
