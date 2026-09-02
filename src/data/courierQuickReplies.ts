// src/data/courierQuickReplies.ts
// Canned messages a rider can send with one tap.
//
// The point is that a courier is usually on a bike, helmeted, or holding bags —
// typing is the thing to avoid. Kept short enough to read as a chip, phrased as
// complete sentences so the customer sees a normal message, and split by leg
// because "please have the laundry ready" is nonsense on a return run.

export type CourierLeg = "PICKUP" | "RETURN";

// Apply to either leg — arrival and delay, the two things riders send most.
const SHARED: readonly string[] = [
  "I'm outside now.",
  "I'm at the gate — could you come out?",
  "Running about 10 minutes late, sorry!",
  "I can't find the address. Any landmark nearby?",
  "Could you call me? I'm having trouble finding you.",
];

const BY_LEG: Record<CourierLeg, readonly string[]> = {
  PICKUP: [
    "On my way to pick up your laundry.",
    "Please have your laundry ready — I'm nearby.",
  ],
  RETURN: [
    "On my way with your laundry.",
    "Please prepare the exact amount if you're paying on delivery.",
  ],
};

/**
 * Random subset (~3-4) of the leg-relevant pool (leg-specific + shared lines).
 * Randomized rather than a fixed deterministic list so reopening the thread
 * doesn't always show the identical three chips.
 */
export function quickRepliesFor(leg: CourierLeg | undefined): string[] {
  const legLines = leg ? BY_LEG[leg] : [];
  const pool = [...legLines, ...SHARED];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, 3 + Math.round(Math.random()));
  return shuffled.slice(0, count);
}
