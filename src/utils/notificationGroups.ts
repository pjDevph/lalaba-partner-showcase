// src/utils/notificationGroups.ts
// TODAY / YESTERDAY / EARLIER banding for the notification inbox — enough
// grouping for an inbox this size, and the same bands the customer app uses so
// the two inboxes read alike.
//
// Kept out of the screen and pure so the boundaries can be tested: "is this
// timestamp today" is a calendar question, not a "less than 24 hours ago" one,
// and the difference shows up as a row filed under the wrong heading at 1am.

export type NotificationGroup = "TODAY" | "YESTERDAY" | "EARLIER";

export function groupOf(iso: string, now: Date = new Date()): NotificationGroup {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "EARLIER";

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (t >= startOfToday.getTime()) return "TODAY";

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (t >= startOfYesterday.getTime()) return "YESTERDAY";

  return "EARLIER";
}

export type ListRow<T> =
  | { kind: "header"; key: string; label: NotificationGroup }
  | { kind: "item"; key: string; item: T };

/**
 * Insert a band header each time the band changes.
 *
 * Assumes the feed is already newest-first — it is, the backend sorts it —
 * so a band is only ever entered once and no heading can appear twice.
 */
export function withGroupHeaders<T extends { id: string; createdAt: string }>(
  items: readonly T[],
  now: Date = new Date(),
): ListRow<T>[] {
  const rows: ListRow<T>[] = [];
  let current: NotificationGroup | null = null;
  for (const item of items) {
    const g = groupOf(item.createdAt, now);
    if (g !== current) {
      current = g;
      rows.push({ kind: "header", key: `h-${g}`, label: g });
    }
    rows.push({ kind: "item", key: item.id, item });
  }
  return rows;
}
