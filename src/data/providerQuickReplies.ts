// src/data/providerQuickReplies.ts
// Canned messages a washer/merchant can send with one tap in a PROVIDER
// thread (their chat with a customer about an order). Status-aware: a shop
// mid-wash and a shop still waiting on courier assignment have different
// things worth saying, so the pool is keyed off the order's current status
// (see STATUS_LABEL in src/stores/onlineOrdersStore.ts for the full enum).
//
// Returns a random subset each time (quickRepliesFor is re-rolled on mount /
// on a genuine status change by the caller, not every poll tick) so reopening
// the thread doesn't always show the identical three chips.

const GENERAL: readonly string[] = [
  "Thank you for your order!",
  "Let us know if you have questions.",
  "We appreciate your business!",
  "Thanks for your patience.",
];

const BY_STATUS: Record<string, readonly string[]> = {
  pending_provider_acceptance: [
    "We're reviewing your order now.",
    "We'll confirm shortly.",
  ],
  accepted_by_provider: [
    "Your order is confirmed!",
    "We're arranging pickup now.",
  ],
  awaiting_pickup_assignment: [
    "We're arranging pickup now.",
    "Looking for a courier for you.",
  ],
  pickup_assigned: [
    "A courier has been assigned for pickup.",
    "Your rider is on the way soon.",
  ],
  pickup_en_route: [
    "Your courier is on the way to pick up your laundry.",
  ],
  picked_up_from_customer: [
    "We've picked up your laundry!",
    "Your items are on the way to our shop.",
  ],
  received_by_provider: [
    "We've received your laundry at our shop.",
    "We'll start washing shortly.",
  ],
  laundry_in_progress: [
    "Your laundry is being washed now.",
    "It'll be ready in a few hours.",
    "We're taking good care of your items.",
  ],
  laundry_ready: [
    "Your laundry is ready!",
    "We're arranging your return delivery.",
  ],
  awaiting_return_assignment: [
    "Your laundry is ready — arranging return delivery now.",
    "Looking for a courier to bring it back to you.",
  ],
  return_assigned: [
    "A courier has been assigned to return your laundry.",
  ],
  return_en_route: [
    "Your laundry is on the way back to you!",
  ],
  delivered_to_customer: [
    "Your laundry has been delivered. Enjoy!",
    "Thanks for choosing us!",
  ],
  completed: [
    "Thanks again for your order!",
    "Hope to serve you again soon.",
  ],
  laundry_quality_hold: [
    "We found an issue with one of your items — please check our message.",
    "We'll wait for your response before continuing.",
  ],
  cancelled: [
    "Sorry this order didn't go through — let us know if you'd like to reorder.",
  ],
};

/** Random subset of ~3-4 replies relevant to the order's current status. */
export function quickRepliesFor(ctx: { orderStatus?: string | null }): string[] {
  const specific = ctx.orderStatus ? BY_STATUS[ctx.orderStatus] ?? [] : [];
  const pool = [...specific, ...GENERAL];
  const unique = Array.from(new Set(pool));
  const shuffled = [...unique].sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, 3 + Math.round(Math.random()));
  return shuffled.slice(0, count);
}
