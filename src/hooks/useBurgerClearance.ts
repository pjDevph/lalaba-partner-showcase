// src/hooks/useBurgerClearance.ts
// The staff stack renders a floating burger/menu button at the top-right in
// portrait (see app/(staff)/_layout.tsx). Screens whose header puts actions
// (Add, Export…) at the top-right must reserve this much right-margin so the
// action doesn't sit underneath — and stay hidden behind — the burger.
// Returns 0 everywhere the burger isn't shown (merchant stack, or landscape,
// where navigation is the persistent sidebar instead).
import { useSegments } from "expo-router";
import { useWindowDimensions } from "react-native";

/** Right-margin (px) a top-right header action needs to clear the staff burger. */
export function useBurgerClearance(): number {
  const segments = useSegments();
  const { width, height } = useWindowDimensions();
  const inStaffStack = segments[0] === "(staff)";
  const isPortrait = height >= width;
  return inStaffStack && isPortrait ? 44 : 0;
}
