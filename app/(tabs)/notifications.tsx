// app/(tabs)/notifications.tsx
// Thin route wrapper — the screen itself is shared by all four role stacks.
// A route file per stack rather than one global route because each stack owns
// its own tab bar and back behaviour (`(washer)` in particular sets
// backBehavior="history" so sub-screens return where you came from).

import React from "react";
import { NotificationsScreen } from "../../src/screens/notifications/NotificationsScreen";
import { C } from "../../src/theme/tokens";

export default function NotificationsRoute() {
  return <NotificationsScreen accentColor={C.brand500} />;
}
