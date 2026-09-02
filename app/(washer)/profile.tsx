// app/(washer)/profile.tsx
// Redirect shim.
//
// "Business profile" was one screen stacking Services and Address & Location
// under a shared Edit/Save header. It is now two screens — app/(washer)/services.tsx
// and app/(washer)/address.tsx — because both must be completed before a washer
// can go online, and Settings needs to be able to say which one is missing.
//
// This route stays so older deep links and any push("/(washer)/profile") left in
// the tree keep working. Services is the landing half: it is the one a washer
// returns to most (pricing changes), whereas an address is set once.

import { Redirect } from "expo-router";

export default function WasherBusinessProfileRedirect() {
  return <Redirect href="/(washer)/services" />;
}
