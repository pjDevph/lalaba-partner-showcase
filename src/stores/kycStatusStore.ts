// src/stores/kycStatusStore.ts
// Persisted cache of the last-seen verification status per provider.
//
// Why this exists: Settings renders its verification card only once
// myKycStatus resolves, so without a cache every cold entry showed an empty
// slot for a full network round-trip and then shoved the rest of the list
// down when the card appeared. Holding the last payload lets the card paint
// on the first frame and turns the focus refetch into a silent update.
//
// The RAW server payload is stored, not the mapped MyKycStatus: Dates don't
// survive JSON.stringify → AsyncStorage → JSON.parse, so mapping happens on
// read (see mapKycStatus in services/graphql/kyc.ts).

import { create } from "zustand";
import type { RawKycStatus } from "../services/graphql/kyc";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KycProviderType } from "../services/graphql/kyc";

/** WASHER derives its provider server-side, so it has one implicit key. */
export function kycCacheKey(
  providerType: KycProviderType,
  providerId?: string,
): string {
  return `${providerType}:${providerId ?? "self"}`;
}

interface KycStatusState {
  /** Owner of the cached entries. Anything cached under another uid is dead. */
  uid: string | null;
  byKey: Record<string, RawKycStatus>;

  set: (uid: string | null, key: string, raw: RawKycStatus) => void;
  reset: () => void;
}

/**
 * Selector for the cached payload — undefined when nothing is cached OR when
 * the entry belongs to another uid, so a partner can never see the previous
 * account's progress on the first frame.
 */
export const selectKycStatus =
  (uid: string | null | undefined, key: string) =>
  (s: KycStatusState): RawKycStatus | undefined =>
    uid && s.uid === uid ? s.byKey[key] : undefined;

export const useKycStatusStore = create<KycStatusState>()(
  persist(
    (setState) => ({
      uid: null,
      byKey: {},

      set: (uid, key, raw) =>
        setState((s) =>
          // A uid switch drops every other entry rather than merging two
          // accounts' caches into one map.
          s.uid === uid
            ? { byKey: { ...s.byKey, [key]: raw } }
            : { uid, byKey: { [key]: raw } },
        ),

      reset: () => setState({ uid: null, byKey: {} }),
    }),
    {
      name: "lalaba-kyc-status",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ uid: state.uid, byKey: state.byKey }),
    },
  ),
);
