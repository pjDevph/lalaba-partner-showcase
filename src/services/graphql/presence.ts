// src/services/graphql/presence.ts
// Lightweight online/offline heartbeat, shared by any screen that wants to
// show "Online" next to a counterparty (chat threads today). Separate from
// chat.ts because presence isn't chat-scoped — any authenticated user can ping
// or be queried, independent of conversations.

import { graphqlRequest } from "../../config/graphql";

export interface PresenceStatus {
  uid: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

/** Upserts a heartbeat for the caller. Call roughly every 20-30s while a
 *  relevant screen is focused/foregrounded — the online window is 45s
 *  server-side, so much less often than that and the dot flickers off. */
export async function gqlPingPresence(): Promise<boolean> {
  const data = await graphqlRequest<{ pingPresence: boolean }>(
    `mutation PingPresence { pingPresence }`,
  );
  return data.pingPresence;
}

export async function gqlGetPresence(uid: string): Promise<PresenceStatus> {
  const data = await graphqlRequest<{ presence: PresenceStatus }>(
    `query Presence($uid: ID!) {
       presence(uid: $uid) { uid isOnline lastSeenAt }
     }`,
    { uid },
  );
  return data.presence;
}
