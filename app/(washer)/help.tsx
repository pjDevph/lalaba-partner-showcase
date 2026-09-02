// app/(washer)/help.tsx
// Routed wrapper around the shared HelpSupportScreenInline — mirrors
// app/(courier)/help.tsx and app/(staff)/help.tsx so the support contact
// details (email / phone / Messenger) stay in exactly one place.
//
// The FAQ is passed in rather than inherited: the shared default covers POS,
// walk-in orders, staff management and branch switching, none of which a home
// washer ever does.
import React from "react";
import { router } from "expo-router";
import {
  HelpSupportScreenInline,
  type HelpTopic,
} from "../../src/screens/settings/HelpSupportScreen";

const WASHER_TOPICS: readonly HelpTopic[] = [
  {
    q: "Why can't customers find me?",
    a: "Three things must all be true: your fee wallet is funded, you offer at least one service, and you've set your address and service radius. Your Home screen names whichever one is missing — customers are matched to home washers by distance, so without a pin you can't be matched at all.",
  },
  {
    q: "How do I get paid?",
    a: "Customers pay you directly, on delivery or by e-wallet. Lalaba never holds your money and there's no payout to wait for. The only thing Lalaba takes is the platform fee, deducted from your prepaid fee wallet as orders complete.",
  },
  {
    q: "What is the fee wallet for?",
    a: "It covers the platform fee on each order. It has to stay above the minimum for your account to stay visible in the Marketplace, and it can't be withdrawn — it's prepaid credit, not earnings. Top it up from Wallet.",
  },
  {
    q: "How do I change my hours?",
    a: "Settings → Booking availability → Operating hours. Your bookable time slots are generated from these, so customers can only book you when you say you're open.",
  },
  {
    q: "Why can I only take a few bookings a day?",
    a: "Lalaba sets the daily booking limit for now. If you need a break before you hit it, use “Pause new bookings” on the Booking availability screen — existing bookings stay, new ones stop.",
  },
  {
    q: "How do I add a courier?",
    a: "Settings → Couriers → Invite courier. They'll get an email to set their password. Home washers invite couriers only — there are no staff accounts.",
  },
  {
    q: "Where does my store logo come from?",
    a: "Your verification selfie. It becomes your profile picture and your store logo automatically, with no waiting for approval. To change it, retake the selfie from Washer Verification.",
  },
];

export default function WasherHelpScreen() {
  return (
    <HelpSupportScreenInline
      topics={WASHER_TOPICS}
      onBack={() => router.replace("/(washer)/settings" as never)}
      onReportProblem={() => router.push("/(washer)/support-new")}
    />
  );
}
