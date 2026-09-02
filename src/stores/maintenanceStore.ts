// src/stores/maintenanceStore.ts
// Global flag set the moment ANY request comes back with the backend's
// MAINTENANCE_MODE error code (see src/config/graphql.ts's onMaintenanceMode
// hook). app/_layout.tsx's routing effect reads this to redirect merchant/
// staff/washer/courier roles to /maintenance, and the screen itself polls
// maintenanceStatus to clear it again.

import { create } from "zustand";

import { getPublicMaintenanceStatus } from "../services/graphql/maintenance";

/** Long enough for a slow connection, short enough not to be a hang. */
const BOOTSTRAP_TIMEOUT_MS = 4000;

export type MaintenanceMode = "SCHEDULED" | "EMERGENCY";

interface MaintenanceState {
  active: boolean;
  mode: MaintenanceMode | null;
  message: string | null;
  endsAt: string | null;
  // Where to turn while blocked, set by an admin. Carried on both the
  // rejection and the status poll, so it is here from the first failed
  // request rather than a poll interval later.
  supportEmail: string | null;
  supportPhone: string | null;
  /**
   * Whether the cold-start check has finished. The auth gate waits on this so
   * the sign-in UI never becomes actionable before we know whether signing in
   * is pointless. Set true on success, on failure, and on timeout alike — see
   * checkPublic.
   */
  bootstrapChecked: boolean;
  /** The pre-auth check. Resolves; never rejects. */
  checkPublic: () => Promise<void>;
  setActive: (info: {
    mode: MaintenanceMode;
    message: string | null;
    endsAt: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
  }) => void;
  clear: () => void;
}

export const useMaintenanceStore = create<MaintenanceState>()((set) => ({
  active: false,
  mode: null,
  message: null,
  endsAt: null,
  supportEmail: null,
  supportPhone: null,
  bootstrapChecked: false,

  /**
   * COLD START, NO SESSION.
   *
   * A failure here is NOT maintenance. A dropped connection, a DNS blip or a
   * backend that is merely slow must leave the app open — treating "I could
   * not ask" as "you are blocked" would lock every user out of the app the
   * moment the network hiccupped, which is a far worse outage than the one
   * this feature exists to announce.
   *
   * Bounded by a timeout for the same reason: the auth gate waits on
   * `bootstrapChecked`, so an unanswered request must not hold the splash
   * screen open indefinitely.
   */
  checkPublic: async () => {
    // Cleared whichever side of the race wins. A dangling 4s timer keeps the
    // JS runtime awake for no reason on every launch — and keeps a test
    // runner alive after the assertions have all passed.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const status = await Promise.race([
        getPublicMaintenanceStatus(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("timeout")),
            BOOTSTRAP_TIMEOUT_MS,
          );
        }),
      ]);
      if (status.blocked && status.type) {
        set({
          active: true,
          mode: status.type,
          message: status.message,
          endsAt: status.endsAt,
          supportEmail: status.supportEmail,
          supportPhone: status.supportPhone,
        });
      }
    } catch {
      // Deliberately silent, and deliberately does NOT set `active`.
    } finally {
      if (timer) clearTimeout(timer);
      set({ bootstrapChecked: true });
    }
  },

  setActive: ({ mode, message, endsAt, supportEmail = null, supportPhone = null }) =>
    set({ active: true, mode, message, endsAt, supportEmail, supportPhone }),
  clear: () =>
    set({
      active: false,
      mode: null,
      message: null,
      endsAt: null,
      supportEmail: null,
      supportPhone: null,
    }),
}));
