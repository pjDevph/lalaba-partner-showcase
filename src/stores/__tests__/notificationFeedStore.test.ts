// src/stores/__tests__/notificationFeedStore.test.ts
// Unit tests for notificationFeedStore — the server-backed inbox behind the
// bell. Covers paging arithmetic, the optimistic read path and its rollback,
// and reset(). The badge is the part users notice when it lies, so the
// unread bookkeeping is tested hardest.

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../services/graphql/notifications", () => ({
  gqlMyNotifications: jest.fn(),
  gqlMyUnreadNotificationCount: jest.fn(),
  gqlMarkNotificationRead: jest.fn(),
  gqlMarkAllNotificationsRead: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { useNotificationFeedStore } from "../notificationFeedStore";
import {
  gqlMyNotifications,
  gqlMyUnreadNotificationCount,
  gqlMarkNotificationRead,
  gqlMarkAllNotificationsRead,
  type NotificationItem,
} from "../../services/graphql/notifications";

const mockList = gqlMyNotifications as jest.Mock;
const mockCount = gqlMyUnreadNotificationCount as jest.Mock;
const mockMarkRead = gqlMarkNotificationRead as jest.Mock;
const mockMarkAll = gqlMarkAllNotificationsRead as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n-1",
    type: "ORDER_STATUS",
    category: "ORDER",
    title: "Order update",
    body: "Picked up.",
    data: {
      orderId: "o-1", orderNumber: null, status: null, branchId: null,
      providerId: null, deviceId: null, staffId: null, conversationId: null,
    },
    deepLink: null,
    branchId: null,
    requiredPermission: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const page = (items: NotificationItem[], total = items.length) => ({
  data: items, total, limit: 20, offset: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationFeedStore.getState().reset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("loadFirstPage", () => {
  it("stores the page and reports more when the total exceeds it", async () => {
    mockList.mockResolvedValue(page([makeItem()], 5));

    await useNotificationFeedStore.getState().loadFirstPage();

    const s = useNotificationFeedStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.hasMore).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("reports no more when the page IS the total", async () => {
    mockList.mockResolvedValue(page([makeItem()], 1));

    await useNotificationFeedStore.getState().loadFirstPage();

    expect(useNotificationFeedStore.getState().hasMore).toBe(false);
  });

  it("surfaces a failure instead of showing a silently empty inbox", async () => {
    mockList.mockRejectedValue(new Error("offline"));

    await useNotificationFeedStore.getState().loadFirstPage();

    const s = useNotificationFeedStore.getState();
    expect(s.error).toBe("offline");
    expect(s.loading).toBe(false);
  });
});

describe("loadMore", () => {
  it("appends the next page using the current length as the offset", async () => {
    mockList.mockResolvedValueOnce(page([makeItem({ id: "a" })], 2));
    await useNotificationFeedStore.getState().loadFirstPage();

    mockList.mockResolvedValueOnce({
      data: [makeItem({ id: "b" })], total: 2, limit: 20, offset: 1,
    });
    await useNotificationFeedStore.getState().loadMore();

    expect(mockList).toHaveBeenLastCalledWith(20, 1);
    expect(useNotificationFeedStore.getState().items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(useNotificationFeedStore.getState().hasMore).toBe(false);
  });

  it("drops a row the server re-serves rather than rendering it twice", async () => {
    // Offset paging over a feed that gains rows mid-scroll will do this.
    mockList.mockResolvedValueOnce(page([makeItem({ id: "a" })], 3));
    await useNotificationFeedStore.getState().loadFirstPage();

    mockList.mockResolvedValueOnce({
      data: [makeItem({ id: "a" }), makeItem({ id: "b" })],
      total: 3, limit: 20, offset: 1,
    });
    await useNotificationFeedStore.getState().loadMore();

    expect(useNotificationFeedStore.getState().items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does nothing when there is no more to fetch", async () => {
    mockList.mockResolvedValueOnce(page([makeItem()], 1));
    await useNotificationFeedStore.getState().loadFirstPage();
    mockList.mockClear();

    await useNotificationFeedStore.getState().loadMore();

    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("markRead", () => {
  it("flips the row and decrements the badge before the server answers", async () => {
    mockList.mockResolvedValue(page([makeItem({ id: "a" })], 1));
    mockCount.mockResolvedValue(1);
    await useNotificationFeedStore.getState().loadFirstPage();
    await useNotificationFeedStore.getState().refreshUnread();

    let resolve: () => void = () => {};
    mockMarkRead.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const pending = useNotificationFeedStore.getState().markRead("a");

    expect(useNotificationFeedStore.getState().items[0].isRead).toBe(true);
    expect(useNotificationFeedStore.getState().unread).toBe(0);
    resolve();
    await pending;
  });

  it("rolls back when the server rejects", async () => {
    mockList.mockResolvedValue(page([makeItem({ id: "a" })], 1));
    await useNotificationFeedStore.getState().loadFirstPage();
    mockMarkRead.mockRejectedValue(new Error("nope"));
    mockCount.mockResolvedValue(1);

    await useNotificationFeedStore.getState().markRead("a");

    expect(useNotificationFeedStore.getState().items[0].isRead).toBe(false);
  });

  it("never drives the badge below zero", async () => {
    mockList.mockResolvedValue(page([makeItem({ id: "a" })], 1));
    await useNotificationFeedStore.getState().loadFirstPage();
    mockMarkRead.mockResolvedValue(undefined);
    // Badge already 0 — e.g. a poll landed between render and tap.
    await useNotificationFeedStore.getState().markRead("a");

    expect(useNotificationFeedStore.getState().unread).toBe(0);
  });

  it("ignores a row that is already read", async () => {
    mockList.mockResolvedValue(page([makeItem({ id: "a", isRead: true })], 1));
    await useNotificationFeedStore.getState().loadFirstPage();

    await useNotificationFeedStore.getState().markRead("a");

    expect(mockMarkRead).not.toHaveBeenCalled();
  });
});

describe("markAllRead", () => {
  it("clears every row and the badge, and restores both on failure", async () => {
    mockList.mockResolvedValue(page([makeItem({ id: "a" }), makeItem({ id: "b" })], 2));
    mockCount.mockResolvedValue(2);
    await useNotificationFeedStore.getState().loadFirstPage();
    await useNotificationFeedStore.getState().refreshUnread();

    mockMarkAll.mockResolvedValueOnce(undefined);
    await useNotificationFeedStore.getState().markAllRead();
    expect(useNotificationFeedStore.getState().items.every((i) => i.isRead)).toBe(true);
    expect(useNotificationFeedStore.getState().unread).toBe(0);

    // And the rollback path.
    useNotificationFeedStore.getState().reset();
    mockList.mockResolvedValue(page([makeItem({ id: "a" })], 1));
    mockCount.mockResolvedValue(1);
    await useNotificationFeedStore.getState().loadFirstPage();
    await useNotificationFeedStore.getState().refreshUnread();
    mockMarkAll.mockRejectedValueOnce(new Error("nope"));

    await useNotificationFeedStore.getState().markAllRead();

    expect(useNotificationFeedStore.getState().items[0].isRead).toBe(false);
    expect(useNotificationFeedStore.getState().unread).toBe(1);
  });
});

describe("refreshUnread", () => {
  it("swallows a failed poll — the badge is decoration, not an error surface", async () => {
    mockCount.mockRejectedValue(new Error("offline"));

    await useNotificationFeedStore.getState().refreshUnread();

    const s = useNotificationFeedStore.getState();
    expect(s.unread).toBe(0);
    expect(s.error).toBeNull();
  });
});

describe("reset", () => {
  it("drops one account's inbox so it cannot appear under the next", async () => {
    mockList.mockResolvedValue(page([makeItem()], 5));
    mockCount.mockResolvedValue(3);
    await useNotificationFeedStore.getState().loadFirstPage();
    await useNotificationFeedStore.getState().refreshUnread();

    useNotificationFeedStore.getState().reset();

    const s = useNotificationFeedStore.getState();
    expect(s.items).toEqual([]);
    expect(s.unread).toBe(0);
    expect(s.hasMore).toBe(false);
  });
});
