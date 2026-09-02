// src/hooks/useQueueSubscription.ts
//
// React hook that manages the POS queue real-time subscription lifecycle.
// All polling logic lives in queueService.ts — this hook only handles
// React lifecycle (mount/unmount/deps change) and wires the service to stores.
//
// Branch switching: effect re-runs on selectedBranchId change, tearing down
// the old listener and creating a new one scoped to the new branch.
//
// Focus-gated: the POS tab stays mounted in the background when the user
// switches tabs (Expo Router keeps tab screens alive). Gating on focus means
// the queue fetches once each time the tab regains focus — and never while the
// user is on another tab. There is no background polling.

import { useCallback, useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { subscribeToQueue } from "../services/queueService";
import { useAuthStore }     from "../stores/authStore";
import { useMerchantStore } from "../stores/merchantStore";
import { useQueueStore }    from "../stores/queueStore";
import { useAnalyticsStore } from "../stores/analyticsStore";
import type { POSOrder }    from "../types/pos.types";

/** Returns `refresh()` — re-runs the fetch on demand. Needed because the fetch
 *  is single-shot and only re-fires when navigation focus or the branch
 *  changes; switching the POS's INTERNAL tab (Terminal → Queue) does neither,
 *  so a freshly created order would otherwise never appear. */
export function useQueueSubscription(): { refresh: () => void } {
  // Bumping this re-runs the effect below, issuing a new fetch.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const merchantId       = useAuthStore((s) => s.user?.merchantId);
  const role             = useAuthStore((s) => s.role);
  const activeBranchId   = useAuthStore((s) => s.activeBranchId);
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  // Merchants scope by merchantStore.selectedBranchId; staff scope by
  // authStore.activeBranchId — merchantStore.selectedBranchId can go stale
  // for staff, so it isn't safe to prefer it via `??` for staff.
  const effectiveBranchId = role === "MERCHANT" ? selectedBranchId : activeBranchId;

  const { setOrders, setLoading, setError } = useQueueStore();
  const computeFromQueue = useAnalyticsStore((s) => s.computeFromQueue);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!merchantId || !isFocused) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToQueue(
      {
        merchantId,
        branchId: effectiveBranchId ?? null,
      },
      {
        onData: (orders: POSOrder[]) => {
          setOrders(orders);
          computeFromQueue(orders);
          setLoading(false);
        },
        onError: (err: Error) => {
          const isNetworkError = /network request failed|failed to fetch|networkerror/i.test(err.message);
          if (isNetworkError) {
            // Offline — the OfflineBanner already tells the user; no toast or log needed.
            setLoading(false);
            return;
          }
          console.error("[useQueueSubscription] subscription error:", err);
          setError(err.message);
          setLoading(false);
        },
      }
    );

    return unsubscribe;
  }, [merchantId, effectiveBranchId, isFocused, refreshNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return { refresh };
}
