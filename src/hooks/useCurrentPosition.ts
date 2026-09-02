// src/hooks/useCurrentPosition.ts
// The device's current position, for ordering a courier's stops by distance.

import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import type { LatLng } from "../utils/geo";

/**
 * One-shot position, refreshed when `refresh()` is called.
 *
 * Deliberately NOT a live watch: this exists to sort a short list and label it
 * with a rough distance, and a continuous GPS subscription would cost battery
 * all shift for a number that only needs to be roughly right. The live feed
 * that matters — the one the customer watches — is the leg tracker, which runs
 * only while a leg is active.
 *
 * Returns null when permission is refused or the fix fails. Callers must treat
 * that as "no distance available" rather than falling back to a wrong origin.
 */
export function useCurrentPosition(): {
  position: LatLng | null;
  refresh: () => Promise<void>;
} {
  const [position, setPosition] = useState<LatLng | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (asked.status !== "granted") return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch {
      // No fix. Distances simply do not render.
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { position, refresh };
}
