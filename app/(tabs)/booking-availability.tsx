// app/(tabs)/booking-availability.tsx
// Booking availability — pause switch, capacity, and pickup/delivery fees.
// The merchant counterpart of app/(washer)/booking-availability.tsx.
//
// Two things this screen deliberately does NOT do, both on purpose:
//   Hours   — a merchant already edits operating hours from Settings →
//             Operating Hours (src/screens/settings/HoursScreen.tsx). Folding
//             a second hours editor in here would just be two places that can
//             disagree about the same schedule.
//   A plan/milestone ladder — that concept is washer-only (myMilestoneProgress
//             is @Roles('washer','admin') on the backend): a merchant sets her
//             own catalog and isn't earning capacity tiers, so "Bookings per
//             day" here just reads whatever the platform config says, which
//             defaults to no limit.

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, COMP } from "../../src/theme/tokens";
import { TopBar } from "../../src/components/ui";
import { notify } from "../../src/stores/notificationStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import PayAtHandoverCard from "../../src/components/PayAtHandoverCard";
import {
  gqlMyBookingAvailability,
  gqlMyBookingEntitlement,
  gqlUpdateMyBookingCapacity,
  updateMyFulfillmentPricing as gqlUpdateMyFulfillmentPricing,
  type BookingAvailabilityConfig,
  type EffectiveEntitlement,
} from "../../src/services/graphql/bookingAvailability";

const ACCENT   = C.brand500;
const ACCENT_D = C.brand700;

export default function MerchantBookingAvailabilityScreen() {
  const { branchId: paramBranchId } = useLocalSearchParams<{ branchId?: string }>();
  const branches = useMerchantStore((s) => s.branches);
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const branchId = paramBranchId ?? selectedBranchId ?? branches[0]?.id ?? null;
  // Fees and capacity differ per branch and there is no picker in front of
  // this route any more, so the header says which branch is being edited.
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;

  const [config, setConfig] = useState<BookingAvailabilityConfig | null>(null);
  const [entitlement, setEntitlement] = useState<EffectiveEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  // Fee drafts held as pesos text — the wire format is centavos, so the
  // conversion happens once on commit rather than on every keystroke.
  const [pickupFeeDraft, setPickupFeeDraft] = useState("0");
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState("0");
  const [pricingError, setPricingError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!branchId) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const [cfg, ent] = await Promise.all([
        gqlMyBookingAvailability(branchId),
        gqlMyBookingEntitlement(),
      ]);
      setConfig(cfg);
      setEntitlement(ent);
      setPickupFeeDraft(
        String((cfg.fulfillmentPricing?.providerPickup.feeCentavos ?? 0) / 100),
      );
      setDeliveryFeeDraft(
        String((cfg.fulfillmentPricing?.providerDelivery.feeCentavos ?? 0) / 100),
      );
      setLoadError(false);
    } catch {
      if (!silent) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const didInitialLoad = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didInitialLoad.current) {
        didInitialLoad.current = true;
        void load();
        return;
      }
      void load(true);
    }, [load]),
  );

  /** Pesos in, centavos out. A blank or nonsense value means "free", not NaN. */
  async function commitFee(
    leg: "providerPickup" | "providerDelivery",
    draft: string,
  ) {
    const pesos = Number(draft.replace(/[^0-9.]/g, ""));
    const feeCentavos = Number.isFinite(pesos) ? Math.round(pesos * 100) : 0;
    setSaving(true);
    setPricingError(null);
    try {
      const saved = await gqlUpdateMyFulfillmentPricing({ [leg]: { feeCentavos } }, branchId ?? undefined);
      setConfig(saved);
      notify.success("Fees saved");
    } catch (err) {
      setPricingError(err instanceof Error ? err.message : "Couldn't save your fees.");
    } finally {
      setSaving(false);
    }
  }

  /** The pause switch is the only thing this screen still writes to the config. */
  async function savePause(bookingsPaused: boolean) {
    setSaving(true);
    setCapacityError(null);
    try {
      const saved = await gqlUpdateMyBookingCapacity({ bookingsPaused }, branchId ?? undefined);
      setConfig(saved);
      notify.success(bookingsPaused ? "New bookings paused" : "Bookings resumed");
    } catch (err) {
      setCapacityError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  const goBack = () => router.back();

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <TopBar blue large title="Booking & Fees" subtitle={branchName ?? undefined} onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !config || !entitlement) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <TopBar blue large title="Booking & Fees" subtitle={branchName ?? undefined} onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load your booking availability.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const accepting = config.summary.isAcceptingBookings;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <TopBar blue large title="Booking & Fees" subtitle={branchName ?? undefined} onBack={goBack} />
      <ScrollView
        contentContainerStyle={{ padding: SP._16, paddingBottom: SP._32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>When customers can book, and what pickup/delivery costs</Text>

        <View style={[styles.stateBadge, !accepting && styles.stateBadgePaused]}>
          <Ionicons
            name={accepting ? "checkmark-circle" : "pause-circle"}
            size={15}
            color={accepting ? ACCENT_D : C.warning700}
          />
          <Text style={[styles.stateText, !accepting && { color: C.warning700 }]}>
            {config.summary.stateLabel}
          </Text>
        </View>

        {/* §13 — pausing is not the same as going offline, and must not need
            a schedule edit. */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: SP._12 }}>
              <Text style={styles.rowLabel}>Pause new bookings</Text>
              <Text style={styles.rowHint}>
                Existing bookings stay. Customers can&apos;t create new ones.
              </Text>
            </View>
            <Switch
              value={config.bookingsPaused}
              disabled={saving}
              onValueChange={(v) => void savePause(v)}
              trackColor={{ false: C.gray200, true: C.brand100 }}
              thumbColor={config.bookingsPaused ? ACCENT : C.gray400}
            />
          </View>
          {config.bookingsPaused && config.pauseReason ? (
            <Text style={styles.pauseReason}>{config.pauseReason}</Text>
          ) : null}
        </View>

        {/* Capacity — platform-set, shown read-only. Unlike a washer, a
            merchant has no earned plan ladder, so this is simply whatever
            the platform config says — which defaults to no limit. */}
        <Text style={styles.sectionTitle}>How much can you take?</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Bookings per day</Text>
            <Text style={styles.readOnlyValue}>
              {entitlement.dailyCapacity == null ? "No limit" : entitlement.dailyCapacity}
            </Text>
          </View>
          <Text style={styles.rowHint}>
            {entitlement.dailyCapacity == null
              ? "No platform limit on your daily bookings."
              : "Lalaba sets this for now. Pause new bookings below if you need a break."}
          </Text>
          {capacityError ? <Text style={styles.fieldError}>{capacityError}</Text> : null}
        </View>

        {/* Fees you charge — the two transport legs are priced independently,
            so "free pickup, paid delivery" is expressible. ₱0 IS free. */}
        <Text style={styles.sectionTitle}>Your fees</Text>
        <View style={styles.card}>
          <Text style={COMP.fieldLabel}>Pickup fee</Text>
          <View style={styles.currencyField}>
            <Text style={styles.currencyAffix}>₱</Text>
            <TextInput
              style={styles.currencyInput}
              value={pickupFeeDraft}
              onChangeText={setPickupFeeDraft}
              onBlur={() => commitFee("providerPickup", pickupFeeDraft)}
              keyboardType="number-pad"
              editable={!saving}
            />
          </View>
          <Text style={styles.hint}>Leave 0 to collect for free.</Text>

          <Text style={COMP.fieldLabel}>Delivery fee</Text>
          <View style={styles.currencyField}>
            <Text style={styles.currencyAffix}>₱</Text>
            <TextInput
              style={styles.currencyInput}
              value={deliveryFeeDraft}
              onChangeText={setDeliveryFeeDraft}
              onBlur={() => commitFee("providerDelivery", deliveryFeeDraft)}
              keyboardType="number-pad"
              editable={!saving}
            />
          </View>
          <Text style={styles.hint}>Leave 0 to deliver for free.</Text>

          {pricingError ? <Text style={styles.fieldError}>{pricingError}</Text> : null}
        </View>

        {/* Pay Later is a payment-TIMING rule, so it belongs with fees and
            booking rules rather than on the Branches directory, where the same
            long explainer was repeated once per branch. Scoped to the branch
            in the Settings header selector, like everything else here. */}
        <Text style={styles.sectionTitle}>How customers pay</Text>
        <PayAtHandoverCard branchId={branchId} accent={ACCENT} />

        {/* §15 — the rules in plain language, generated server-side so this
            can never drift from what the booking check actually enforces. */}
        <Text style={styles.sectionTitle}>Your booking rules</Text>
        <View style={styles.card}>
          {config.summary.ruleLines.map((line) => (
            <View key={line} style={styles.ruleRow}>
              <Ionicons name="ellipse" size={5} color={C.gray400} />
              <Text style={styles.ruleText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.gray50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP._24 },
  errorText: { color: C.gray600, marginBottom: SP._12, textAlign: "center" },
  retryBtn: { paddingHorizontal: SP._16, paddingVertical: SP._8, borderRadius: RADIUS.md, backgroundColor: C.brand100 },
  retryText: { color: ACCENT_D, fontWeight: "600" },

  subtitle: { fontSize: 13, color: C.gray500, marginTop: SP._4 },

  stateBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    marginTop: SP._12, paddingHorizontal: SP._12, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: C.brand100,
  },
  stateBadgePaused: { backgroundColor: C.warning100 },
  stateText: { fontSize: 12, fontWeight: "700", color: ACCENT_D },

  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: C.gray500, textTransform: "uppercase",
    letterSpacing: 0.6, marginTop: SP._24, marginBottom: SP._8,
  },

  card: {
    backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._16,
    marginTop: SP._12, borderWidth: 1, borderColor: C.gray200,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontSize: 15, fontWeight: "600", color: C.gray900 },
  rowHint: { fontSize: 12, color: C.gray500, marginTop: 2 },
  pauseReason: { marginTop: SP._8, fontSize: 12, color: C.warning700 },
  hint: { fontSize: 12, color: C.gray500, marginTop: 4 },
  fieldError: { fontSize: 12, color: C.error700, marginTop: SP._8 },

  readOnlyValue: { fontSize: 16, fontWeight: "700", color: C.gray900 },

  currencyField: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: C.gray200,
    borderRadius: RADIUS.md, backgroundColor: C.white, paddingLeft: SP._16,
  },
  currencyAffix: { fontSize: 15, fontWeight: "700", color: C.gray500 },
  currencyInput: { flex: 1, paddingHorizontal: SP._8, paddingVertical: SP._14, fontSize: 15, color: C.gray900 },

  ruleRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  ruleText: { fontSize: 13, color: C.gray700, paddingVertical: 3 },
});
