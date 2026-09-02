// src/utils/logActivity.ts
// Central activity-log writer. Every create / update / archive / cancel / status-change
// must call logActivity() so the audit trail in Settings → Activity Logs is complete.
//
// Security: logs are written via POST /merchant/activity-logs (backend API).
// Client-side addDoc(activityLogs) has been removed — the backend stamps
// serverTimestamp and validates merchantId ownership, so logs cannot be forged.

import type { StaffRole } from "../types/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogAction =
  | "CREATED"
  | "UPDATED"
  | "ARCHIVED"
  | "RESTORED"
  | "DELETED"
  | "ACTIVATED"
  | "DEACTIVATED"
  | "CANCELLED"
  | "STATUS_CHANGED"
  | "SHIFT_STARTED"
  | "SHIFT_ENDED"
  | "PERMISSION_CHANGED"
  | "PAYMENT_RECEIVED";

export type LogEntity =
  | "ORDER"
  | "SERVICE"
  | "STAFF"
  | "SETTINGS"
  | "SHIFT"
  | "BRANCH";

export interface ActivityLogEntry {
  merchantId: string;
  branchId: string | null;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: LogAction;
  entity: LogEntity;
  entityId: string;
  entityName: string;
  metadata: Record<string, unknown>;
}

export interface LogActor {
  id: string;
  name: string;
  role: StaffRole;
}

// ─── Cancel reason codes ──────────────────────────────────────────────────────

export const CANCEL_REASONS = [
  { key: "CUSTOMER_REQUEST",  label: "Customer requested cancellation" },
  { key: "ITEM_UNAVAILABLE",  label: "Item unavailable" },
  { key: "DUPLICATE_ORDER",   label: "Duplicate order" },
  { key: "PAYMENT_ISSUE",     label: "Payment issue" },
  { key: "WRONG_ORDER",       label: "Wrong items entered" },
  { key: "CUSTOMER_NO_SHOW",  label: "Customer no-show" },
  { key: "OTHER",             label: "Other (add note)" },
] as const;

export type CancelReasonKey = (typeof CANCEL_REASONS)[number]["key"];

// ─── Writer ───────────────────────────────────────────────────────────────────

/**
 * Send an activity log entry to POST /merchant/activity-logs.
 * Fire-and-forget — never throws; logs error silently.
 * branchId is auto-resolved from merchantStore.
 */
// Activity logs are written server-side by NestJS interceptors.
// There is no client-initiated mutation — this function is intentionally a no-op.
export function logActivity(
  _merchantId: string,
  _actor: LogActor,
  _action: LogAction,
  _entity: LogEntity,
  _entityId: string,
  _entityName: string,
  _metadata: Record<string, unknown> = {}
): Promise<void> {
  return Promise.resolve();
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export const ActivityLog = {
  orderCancelled: (
    merchantId: string, actor: LogActor,
    orderId: string, orderRef: string,
    reason: CancelReasonKey, note: string, wasPaid: boolean
  ) =>
    logActivity(merchantId, actor, "CANCELLED", "ORDER", orderId, `Order #${orderRef}`, {
      reason, note, wasPaid,
    }),

  orderStatusChanged: (
    merchantId: string, actor: LogActor,
    orderId: string, orderRef: string, from: string, to: string
  ) =>
    logActivity(merchantId, actor, "STATUS_CHANGED", "ORDER", orderId, `Order #${orderRef}`, {
      from, to,
    }),

  serviceCreated: (
    merchantId: string, actor: LogActor, serviceId: string, serviceName: string
  ) =>
    logActivity(merchantId, actor, "CREATED", "SERVICE", serviceId, serviceName, {}),

  serviceUpdated: (
    merchantId: string, actor: LogActor,
    serviceId: string, serviceName: string, changes: Record<string, unknown>
  ) =>
    logActivity(merchantId, actor, "UPDATED", "SERVICE", serviceId, serviceName, { changes }),

  serviceArchived: (
    merchantId: string, actor: LogActor, serviceId: string, serviceName: string
  ) =>
    logActivity(merchantId, actor, "ARCHIVED", "SERVICE", serviceId, serviceName, {}),

  serviceRestored: (
    merchantId: string, actor: LogActor, serviceId: string, serviceName: string
  ) =>
    logActivity(merchantId, actor, "RESTORED", "SERVICE", serviceId, serviceName, {}),

  serviceToggled: (
    merchantId: string, actor: LogActor,
    serviceId: string, serviceName: string, isActive: boolean
  ) =>
    logActivity(
      merchantId, actor,
      isActive ? "ACTIVATED" : "DEACTIVATED",
      "SERVICE", serviceId, serviceName, {}
    ),

  staffArchived: (
    merchantId: string, actor: LogActor, staffId: string, staffName: string
  ) =>
    logActivity(merchantId, actor, "ARCHIVED", "STAFF", staffId, staffName, {}),

  shiftStarted: (merchantId: string, actor: LogActor) =>
    logActivity(merchantId, actor, "SHIFT_STARTED", "SHIFT", actor.id, `${actor.name} shift`, {}),

  shiftEnded: (merchantId: string, actor: LogActor, durationMinutes: number) =>
    logActivity(merchantId, actor, "SHIFT_ENDED", "SHIFT", actor.id, `${actor.name} shift`, {
      durationMinutes,
    }),
};
