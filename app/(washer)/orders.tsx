// app/(washer)/orders.tsx
// Washer › Orders — provider view of the shared online-orders domain, keyed on
// the washer's anchor branch. Thin wrapper over <ProviderOrders> (teal accent).
// See src/components/ProviderOrders.tsx for the shared lifecycle logic.

import React from "react";
import { Text, View } from "react-native";
import { useWasherStore } from "../../src/stores/washerStore";
import { C, SP, RADIUS } from "../../src/theme/tokens";
import { useTodayBookingLoad } from "../../src/hooks/useTodayBookingLoad";
import { ProviderOrders } from "../../src/components/ProviderOrders";
import { ProgressRing } from "../../src/screens/dashboard/providerHome";

export default function WasherOrders() {
  const branchId = useWasherStore((s) => s.profile?.branchId ?? null);
  // A washer who's toggled themselves unavailable takes no new orders — the
  // empty state says so and offers the switch rather than implying orders are
  // simply slow today.
  const isAvailable = useWasherStore((s) => s.profile?.isAvailable);
  const toggleAvailability = useWasherStore((s) => s.toggleAvailability);

  // Same "X/Y bookings today" the Home dashboard shows — surfaced here too so
  // she doesn't have to switch tabs to see whether she's near her cap. Both
  // screens read it through the same hook, from the booking engine, so the two
  // tabs cannot show different numbers for the same day.
  const adminCap = useWasherStore((s) => s.profile?.maxOrdersPerDay ?? null);
  const bookings = useTodayBookingLoad(branchId, "WASHER", adminCap);

  return (
    <ProviderOrders
      branchId={branchId}
      subtitle="Manage customer laundry orders"
      accent={{ base: C.washer500, bg: C.washer100, dark: C.washer700 }}
      acceptingOrders={isAvailable}
      onEnableOrders={() => void toggleAvailability()}
      selfCourierBasePath="/(washer)"
      ordersRoute="/(washer)/orders"
      headerAccessory={
        // headerAccessory renders inside a full-bleed wrapper (negative outer
        // margin); re-add the header's own inset so this pill lines up with
        // the title/subtitle above it instead of the screen edge.
        <View style={{ paddingHorizontal: SP._16, marginTop: SP._8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SP._8,
              alignSelf: "flex-start",
              paddingHorizontal: SP._10,
              paddingVertical: SP._6,
              borderRadius: RADIUS.full,
              backgroundColor: C.washer100,
            }}
          >
            {/* No ring when nothing caps her — a full circle would read as
                "you are at your limit" to someone who has no limit. */}
            {bookings.cap != null && (
              <ProgressRing pct={bookings.pct} accent={C.washer500} accentDark={C.washer700} size={28} stroke={3} showPct={false} />
            )}
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: C.washer700 }}>
              {bookings.cap == null
                ? `${bookings.used} bookings today`
                : `${bookings.used}/${bookings.cap} bookings today`}
            </Text>
          </View>
        </View>
      }
    />
  );
}
