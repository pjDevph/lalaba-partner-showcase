// app/(washer)/preview.tsx
// "View as customer" — a read-only mirror of the washer's public provider
// profile, built from the SAME BE resolvers customers hit (myProviderProfile +
// providerServices), so it can't drift from the real customer view. The body
// is shared with the store editor's preview modal — see CustomerPreviewBody.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { C } from "../../src/theme/tokens";
import { CustomerPreviewBody } from "../../src/components/CustomerPreviewBody";
import {
  gqlMyProviderProfile,
  gqlProviderServices,
  type MyProviderProfile,
  type ProviderServiceItem,
} from "../../src/services/graphql/discovery";

const TEAL = C.washer500;

export default function WasherPreview() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<MyProviderProfile | null>(null);
  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await gqlMyProviderProfile();
      setProfile(p);
      if (p) setServices(await gqlProviderServices(p.branchId, p.providerType));
    } catch { /* keep */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.white }}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.white }}>
        <Text style={{ color: C.gray600 }}>Couldn&apos;t load your public profile.</Text>
      </View>
    );
  }

  return (
    <CustomerPreviewBody
      profile={profile}
      services={services}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(washer)/dashboard"))}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
