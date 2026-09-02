// src/utils/contact.ts
// Reaching a customer from a courier screen. Kept separate from utils/maps.ts
// (navigation hand-off) so neither module grows into a catch-all.

import { Linking } from "react-native";
import { notify } from "../stores/notificationStore";

/**
 * Place a call through the device's own dialer.
 *
 * Deliberately a `tel:` hand-off rather than in-app calling: it uses the rider's
 * SIM and the native call UI, so there's no VoIP dependency, no extra permission,
 * and the call survives the app being backgrounded.
 *
 * `phone` is the BE's guarded `contactPhone`, which is null outside the rider's
 * active leg — hence the explicit empty case rather than a silent no-op.
 */
export function callNumber(phone: string | null | undefined): void {
  // Keep digits and a leading +; strip spaces, dashes and parentheses, which
  // some dialers reject inside a tel: URL.
  const dialable = (phone ?? "").replace(/[^\d+]/g, "");
  if (!dialable) {
    notify.error("Number unavailable", "The customer's number is only shared while you're on this task.");
    return;
  }
  Linking.openURL(`tel:${dialable}`).catch(() =>
    notify.error("Couldn't open the dialer", "Dial the number manually if it's urgent."),
  );
}
