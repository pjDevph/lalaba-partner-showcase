// A courier's LEG finishes long before the ORDER does.
//
// History showed "No completed tasks yet" to a courier whose Completed tab
// listed a finished pickup: the feed was filtered by the order's status
// (delivered/completed/cancelled), so a pickup handed over to a shop that was
// still washing never reached the history screen at all. Both halves of that
// confusion are pinned here.

import { deriveTasks } from "../utils/courierTasks";
import { hasCompletedLegFor } from "../stores/onlineOrdersStore";
import type { GqlOnlineOrder } from "../services/graphql/onlineOrders";

const ME = "courier-me";
const OTHER = "courier-other";

const order = (over: Record<string, unknown>): GqlOnlineOrder =>
  ({ _id: "o1", status: "washing", ...over }) as unknown as GqlOnlineOrder;

const pickedUpByMe = order({
  status: "washing", // order still mid-flight — my leg is nonetheless done
  pickupAssignment: { assignedStaffUid: ME, completedAt: "2026-08-23T01:00:00Z" },
});

describe("hasCompletedLegFor", () => {
  it("counts a finished pickup while the order is still being washed", () => {
    expect(hasCompletedLegFor(pickedUpByMe, ME)).toBe(true);
  });

  it("does not count another courier's finished leg", () => {
    expect(hasCompletedLegFor(pickedUpByMe, OTHER)).toBe(false);
  });

  it("does not count a leg that is assigned but not yet handed over", () => {
    const assignedOnly = order({
      pickupAssignment: { assignedStaffUid: ME, enRouteAt: "2026-08-23T00:00:00Z" },
    });
    expect(hasCompletedLegFor(assignedOnly, ME)).toBe(false);
  });
});

describe("deriveTasks", () => {
  it("keeps a completed pickup visible while the return leg is still open", () => {
    // The same courier runs both legs — the common case, and the one an early
    // return from the active-leg branch used to swallow.
    const both = order({
      status: "return_assigned",
      pickupAssignment: { assignedStaffUid: ME, completedAt: "2026-08-23T01:00:00Z" },
      returnAssignment: { assignedStaffUid: ME },
    });

    const buckets = deriveTasks([both], ME).map((t) => `${t.leg}:${t.bucket}`);
    expect(buckets).toContain("PICKUP:COMPLETED");
    expect(buckets).toContain("RETURN:NEW");
  });

  it("never reports the leg still being worked as completed", () => {
    const enRoute = order({
      status: "pickup_en_route",
      pickupAssignment: { assignedStaffUid: ME, enRouteAt: "2026-08-23T00:00:00Z" },
    });
    const tasks = deriveTasks([enRoute], ME);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ leg: "PICKUP", bucket: "ACTIVE" });
  });
});
