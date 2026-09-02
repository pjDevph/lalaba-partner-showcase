// app/(tabs)/preview.tsx
// "View as customer" for a merchant branch — a read-only mirror of the public
// store page, built from the SAME BE resolvers customers hit (providerProfile +
// providerServices) so it cannot drift from the real thing. The body is shared
// with the washer's preview; see CustomerPreviewBody.
//
// Uses providerProfile(branchId) rather than myProviderProfile: the latter
// resolves with findOne({ uid }) and would show whichever branch happened to
// come back first, which is the wrong one for any merchant with two shops.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { C } from "../../src/theme/tokens";
import { CustomerPreviewBody } from "../../src/components/CustomerPreviewBody";
import { useMerchantStore } from "../../src/stores/merchantStore";
import {
  gqlProviderProfile,
  gqlProviderServices,
  type MyProviderProfile,
  type ProviderServiceItem,
} from "../../src/services/graphql/discovery";

export default function MerchantPreview() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ branchId?: string }>();
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const branchId = params.branchId ?? selectedBranchId ?? null;

  const [profile, setProfile] = useState<MyProviderProfile | null>(null);
  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!branchId) { setLoading(false); return; }
    try {
      const p = await gqlProviderProfile(branchId, "MERCHANT");
      setProfile(p);
      if (p) setServices(await gqlProviderServices(p.branchId, p.providerType));
    } catch {
      // Leave `profile` null — the message below is honest about it rather
      // than rendering a half-empty store page as if it were real.
    } finally {
      setLoading(false);
    }
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard");

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.white }}>
        <ActivityIndicator size="large" color={C.brand500} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.white, padding: 24 }}>
        <Text style={{ color: C.gray600, textAlign: "center" }}>
          Couldn&apos;t load your public profile. Pull back and try again.
        </Text>
      </View>
    );
  }

  return (
    <CustomerPreviewBody
      profile={profile}
      services={services}
      onBack={goBack}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
