// src/services/graphql/maintenance.ts
// The one query that stays reachable while this app is in maintenance (BE
// marks it @AllowDuringMaintenance()) — polled by app/maintenance.tsx to
// learn when the block has lifted.

import { graphqlRequest } from "../../config/graphql";

export type MaintenanceMode = "SCHEDULED" | "EMERGENCY";

export interface MaintenanceStatus {
  blocked: boolean;
  type: MaintenanceMode | null;
  message: string | null;
  endsAt: string | null;
  /** Set by an admin in the panel, carried here because a blocked app cannot
   *  reach any other query to go and fetch it. Either may be null. */
  supportEmail: string | null;
  supportPhone: string | null;
}

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  const data = await graphqlRequest<{ maintenanceStatus: MaintenanceStatus }>(
    `query MaintenanceStatus { maintenanceStatus { blocked type message endsAt supportEmail supportPhone } }`
  );
  return data.maintenanceStatus;
}

/**
 * THE COLD-START CHECK, BEFORE ANYONE HAS SIGNED IN.
 *
 * `maintenanceStatus` above needs a session — it answers for the CALLER, and
 * honours the bypass list. This one needs none, because the question it
 * answers ("is this app blocked at all?") has no caller yet. Without it the
 * only way to discover a platform-wide block is to type a phone number, wait
 * for an SMS, sign in, and be told it was all for nothing.
 *
 * Sent as `anonymous` so a stale or rejected token cannot turn this into a
 * sign-out on the welcome screen.
 */
export async function getPublicMaintenanceStatus(): Promise<MaintenanceStatus> {
  const data = await graphqlRequest<{ publicMaintenanceStatus: MaintenanceStatus }>(
    `query PublicMaintenanceStatus($app: MaintenanceApp!) {
       publicMaintenanceStatus(app: $app) {
         blocked type message endsAt supportEmail supportPhone
       }
     }`,
    { app: "PARTNER" },
    { anonymous: true },
  );
  return data.publicMaintenanceStatus;
}
