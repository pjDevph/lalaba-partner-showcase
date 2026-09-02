// src/services/graphql/notifications.ts
// GraphQL operations for notifications (live backend). Two related surfaces:
//   • Device tokens — registering/removing this device for FCM push.
//   • The in-app FEED — the persisted, per-recipient inbox behind the bell.
// The feed is what survives a swiped-away push, a reinstall, or a denied
// permission prompt; the push is only the ping that points at it.

import { graphqlRequest } from "../../config/graphql";

export type NotificationCategory =
  | "ACCOUNT"
  | "BROADCAST"
  | "DEVICE"
  | "ORDER"
  | "STAFF"
  | "SYSTEM"
  | "VERIFICATION";

export type NotificationType =
  | "BROADCAST"
  | "DEVICE_REGISTRATION"
  | "KYC_APPROVED"
  | "KYC_CASE_ACTION_NEEDED"
  | "KYC_REJECTED"
  | "ORDER_ACTION_NEEDED"
  | "ORDER_STATUS"
  | "STAFF_LOGIN";

/** Lookup keys for routing, not a snapshot of the referenced entity. */
export interface NotificationData {
  orderId: string | null;
  orderNumber: string | null;
  status: string | null;
  branchId: string | null;
  providerId: string | null;
  deviceId: string | null;
  staffId: string | null;
  conversationId: string | null;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  data: NotificationData;
  deepLink: string | null;
  branchId: string | null;
  /**
   * The BE permission name a branch member must hold to see this row, or null
   * for everyone. The server has already filtered for the AUTHENTICATED
   * identity — this is here so a shared terminal can re-filter for the staff
   * member actually holding the device, who the backend knows nothing about.
   */
  requiredPermission: string | null;
  /** Resolved per-caller by the BE. A branch row is read by one colleague and
   *  unread by another at the same instant, so this is never a stored column. */
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedNotifications {
  data: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
}

// Register this device's FCM token on the signed-in user.
export async function gqlSaveFcmToken(token: string): Promise<void> {
  await graphqlRequest<{ saveFcmToken: boolean }>(
    `mutation SaveFcmToken($token: String!) { saveFcmToken(token: $token) }`,
    { token }
  );
}

// Remove this device's FCM token (on logout).
export async function gqlRemoveFcmToken(token: string): Promise<void> {
  await graphqlRequest<{ removeFcmToken: boolean }>(
    `mutation RemoveFcmToken($token: String!) { removeFcmToken(token: $token) }`,
    { token }
  );
}

// Ask the backend to push a "staff signed in" notification to the owner/merchant.
// A no-op server-side for non-staff callers.
export async function gqlNotifyStaffLogin(): Promise<void> {
  await graphqlRequest<{ notifyStaffLogin: boolean }>(
    `mutation NotifyStaffLogin { notifyStaffLogin }`,
    {}
  );
}

const NOTIFICATION_FIELDS = `
  id type category title body deepLink branchId requiredPermission isRead createdAt
  data { orderId orderNumber status branchId providerId deviceId staffId conversationId }
`;

/** One page of the inbox, newest first. */
export async function gqlMyNotifications(
  limit = 20,
  offset = 0
): Promise<PaginatedNotifications> {
  const data = await graphqlRequest<{
    myNotifications: PaginatedNotifications;
  }>(
    `query MyNotifications($limit: Int!, $offset: Int!) {
      myNotifications(limit: $limit, offset: $offset) {
        data { ${NOTIFICATION_FIELDS} }
        total limit offset
      }
    }`,
    { limit, offset }
  );
  return data.myNotifications;
}

/** Badge count. Capped server-side at 99 — render anything at the cap as "99+". */
export async function gqlMyUnreadNotificationCount(): Promise<number> {
  const data = await graphqlRequest<{ myUnreadNotificationCount: number }>(
    `query MyUnreadNotificationCount { myUnreadNotificationCount }`,
    {}
  );
  return data.myUnreadNotificationCount;
}

export async function gqlMarkNotificationRead(id: string): Promise<void> {
  await graphqlRequest<{ markNotificationRead: boolean }>(
    `mutation MarkNotificationRead($id: ID!) { markNotificationRead(id: $id) }`,
    { id }
  );
}

export async function gqlMarkAllNotificationsRead(): Promise<void> {
  await graphqlRequest<{ markAllNotificationsRead: boolean }>(
    `mutation MarkAllNotificationsRead { markAllNotificationsRead }`,
    {}
  );
}
