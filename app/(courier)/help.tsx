// app/(courier)/help.tsx
// Routed wrapper around the shared HelpSupportScreenInline for the courier
// profile — mirrors app/(staff)/help.tsx, so the support contact details
// (email / phone / Messenger) stay in one place for every role.
//
// The FAQ is passed in rather than inherited: the shared default covers POS,
// staff management and branch switching, none of which a rider ever does.
import React from "react";
import { router } from "expo-router";
import {
  HelpSupportScreenInline,
  type HelpTopic,
} from "../../src/screens/settings/HelpSupportScreen";

const COURIER_TOPICS: readonly HelpTopic[] = [
  {
    q: "How to start a pickup or delivery",
    a: "Open the task from Tasks or Map, then tap “Start navigation”. That tells the customer you're on the way and unlocks calling, messaging and the navigation hand-off for that stop.",
  },
  {
    q: "Why can't I call or message the customer?",
    a: "Contact details are only shared while you're actively on that task — from the moment you tap “Start navigation” until you complete the handover. Before and after that, the customer's number stays hidden for their privacy.",
  },
  {
    q: "My chat with a customer disappeared",
    a: "Rider chats are tied to one task. Once the pickup or delivery is complete the thread is marked Ended: you can still open and read it, but you can't send new messages. If the return is handled by a different rider, they get their own separate thread.",
  },
  {
    q: "Navigation opens the wrong app",
    a: "Go to Profile → Preferred navigation and pick Google Maps, Waze or Apple Maps. If the app you picked isn't installed on this phone, Lalaba falls back to Google Maps and tells you why.",
  },
  {
    q: "How to weigh and collect payment",
    a: "On a pickup, once you tap “I've arrived” you can enter the measured weight or piece count for each service, choose Cash or E-wallet, and record the collection. The customer's final price is set at that moment.",
  },
  {
    q: "The customer isn't home",
    a: "Call or message them first from the task screen. If they still can't be reached, contact support below — don't mark the task complete, as that transfers custody of the laundry in the system.",
  },
  {
    q: "My device says “Awaiting approval” or “Blocked”",
    a: "Courier accounts are tied to an approved device. Ask the branch owner to approve this device under Settings → Devices. Until then you won't receive new task assignments.",
  },
];

export default function CourierHelpScreen() {
  return (
    <HelpSupportScreenInline
      topics={COURIER_TOPICS}
      // replace, not back: help is registered as a hidden tab, so back() would
      // unwind to the navigator's initial route (Tasks) rather than Profile.
      onBack={() => router.replace("/(courier)/profile")}
    />
  );
}
