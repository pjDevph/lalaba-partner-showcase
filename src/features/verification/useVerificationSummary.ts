// src/features/verification/useVerificationSummary.ts
// Just enough verification state to render the Settings entry card: the
// aggregate status and the progress numbers. The full checklist lives on the
// verification screen; this only exists so Settings can show "70% · 2
// requirements remaining" without duplicating the derivation.
//
// The payload itself lives in the persisted kycStatusStore rather than local
// state, so re-entering Settings paints the card from cache on the first frame
// and the fetch becomes a background refresh. `loading` is only true when
// there is genuinely nothing to show — screens use it to reserve the card's
// space with a skeleton instead of letting the list jump.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  gqlMyKycStatusRaw,
  mapKycStatus,
  type KycProviderType,
} from "../../services/graphql/kyc";
import { useAuthStore } from "../../stores/authStore";
import {
  kycCacheKey,
  selectKycStatus,
  useKycStatusStore,
} from "../../stores/kycStatusStore";
import {
  computeProgress,
  deriveAggregateStatus,
  type UiStatus,
  type VerificationProgress,
} from "./status";
import {
  buildGroupViews,
  toProgressRows,
  type RequirementGroup,
} from "./requirements";

export interface VerificationSummary {
  /** True only while a first-ever fetch is in flight (no cache to show). */
  loading: boolean;
  /** Null while loading, or if the status could not be fetched. */
  status: UiStatus | null;
  progress: VerificationProgress;
  /**
   * Set when the last fetch failed AND there is no cache to fall back on — i.e.
   * the card has nothing to render. A failure over existing cache leaves this
   * null on purpose: stale numbers beat an error where the partner can't act
   * on either. Callers render a retry affordance rather than showing nothing.
   */
  error: string | null;
  reload: () => void;
}

const EMPTY_PROGRESS: VerificationProgress = {
  done: 0,
  total: 0,
  percent: 0,
  remaining: 0,
  verified: 0,
};

export function useVerificationSummary({
  providerType,
  providerId,
  groups,
  profileStatuses,
  enabled = true,
}: {
  providerType: KycProviderType;
  /** Required for MERCHANT_BRANCH — the hook stays idle until it's known. */
  providerId?: string;
  groups: readonly RequirementGroup[];
  profileStatuses: readonly { key: string; status: UiStatus }[];
  enabled?: boolean;
}): VerificationSummary {
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const needsProviderId = providerType === "MERCHANT_BRANCH";
  const ready = enabled && (!needsProviderId || !!providerId);

  const key = kycCacheKey(providerType, providerId);
  const cached = useKycStatusStore(selectKycStatus(uid, key));
  const setCached = useKycStatusStore((s) => s.set);

  // Only the very first fetch blocks the card; a refresh over existing cache
  // keeps the old numbers on screen until the new ones land.
  const [fetching, setFetching] = useState(ready);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!ready) {
      setFetching(false);
      return;
    }
    setFetching(true);
    setFailed(false);
    gqlMyKycStatusRaw(providerType, providerId)
      .then((res) => setCached(uid, key, res))
      // A failed summary must not break Settings — the cached card (if any)
      // stays as-is, and the verification screen surfaces the real error. But
      // a cold-start failure used to render nothing at all: no card, no
      // skeleton, no way back. The flag lets the card offer a retry instead.
      .catch(() => setFailed(true))
      .finally(() => setFetching(false));
  }, [ready, providerType, providerId, uid, key, setCached]);

  useEffect(() => {
    load();
  }, [load]);

  // A reviewer's decision lands while the app is open, so mount-only fetching
  // left this card stale until a relaunch. Refreshing on focus keeps it in step;
  // the cache means the old numbers stay painted until the new ones land.
  const didInitialLoad = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The mount effect above already covers the first focus.
      if (!didInitialLoad.current) {
        didInitialLoad.current = true;
        return;
      }
      load();
    }, [load]),
  );

  const raw = useMemo(() => (cached ? mapKycStatus(cached) : null), [cached]);

  const rows = useMemo(() => {
    if (!raw) return [];
    return toProgressRows(buildGroupViews(groups, raw), profileStatuses);
  }, [raw, groups, profileStatuses]);

  // Waiting on the branch id counts as loading too: the merchant hub can't
  // even ask until branches resolve, and treating that as "not loading" put
  // the layout shift back exactly where it was.
  const pendingProvider = enabled && needsProviderId && !providerId;

  return {
    loading: (fetching || pendingProvider) && !raw,
    status: raw ? deriveAggregateStatus(raw.verificationStatus, rows) : null,
    progress: raw ? computeProgress(rows) : EMPTY_PROGRESS,
    error:
      failed && !raw ? "Couldn't load your verification status." : null,
    reload: load,
  };
}
