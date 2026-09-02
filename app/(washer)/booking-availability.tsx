// app/(washer)/booking-availability.tsx
// Booking Availability — when customers may schedule with this washer.
//
// Three separate things, deliberately not collapsed into one:
//   Store hours          "when am I open?"                 (Settings → Hours)
//   Booking availability "when will I take bookings?"      (this screen)
//   Capacity             "how many can I actually handle?" (this screen)
//
// The washer owns her OPERATING HOURS — the same editor merchants use, saved to
// her own profile, and the source the booking engine generates her slots from.
// She also owns the pause switch, because an overloaded washer must be able to
// stop new bookings without waiting on support.
//
// Lalaba owns capacity: one platform number, shown read-only. It used to be a
// text field she could type into, which only ever let her set herself LOWER
// than the platform allowed and then stranded her there. Per-slot capacity, the
// read-only weekly schedule and the special-dates list are gone from this
// screen entirely — none were things she could act on.

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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, COMP } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { notify } from "../../src/stores/notificationStore";
import {
  formatTime12,
  gqlMyBookingAvailability,
  gqlMyBookingEntitlement,
  gqlMyMilestoneProgress,
  gqlUpdateMyBookingCapacity,
  updateMyFulfillmentPricing as gqlUpdateMyFulfillmentPricing,
  type BookingAvailabilityConfig,
  type EffectiveEntitlement,
  type MilestoneProgress,
} from "../../src/services/graphql/bookingAvailability";
import { HoursEditor } from "../../src/screens/settings/HoursEditor";
import {
  beToFeHours,
  feToBeHours,
  findInvalidHoursDay,
  sameHours,
} from "../../src/screens/settings/hoursMapping";
import type { OperatingHours } from "../../src/screens/settings/shared";
import {
  fetchWasherProfile,
  gqlUpdateWasherProfile,
} from "../../src/services/graphql/washer";
import { useWasherStore } from "../../src/stores/washerStore";

const TEAL = C.washer500;
const TEAL_D = C.washer700;

export default function BookingAvailabilityScreen() {
  const insets = useSafeAreaInsets();

  const [config, setConfig] = useState<BookingAvailabilityConfig | null>(null);
  const [entitlement, setEntitlement] = useState<EffectiveEntitlement | null>(
    null,
  );
  const [progress, setProgress] = useState<MilestoneProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  // Operating hours. `savedHours` is the last persisted week, so `dirty` is
  // derived rather than tracked — undoing an edit by hand clears the pending
  // state exactly like Cancel does.
  const [hours, setHours] = useState<OperatingHours | null>(null);
  const [savedHours, setSavedHours] = useState<OperatingHours | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const hoursDirty = !!hours && !!savedHours && !sameHours(hours, savedHours);
  // Fee drafts held as pesos text — the wire format is centavos, so the
  // conversion happens once on commit rather than on every keystroke.
  const [pickupFeeDraft, setPickupFeeDraft] = useState("0");
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState("0");
  const [pricingError, setPricingError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const [cfg, ent, prog, profile] = await Promise.all([
        gqlMyBookingAvailability(),
        gqlMyBookingEntitlement(),
        // Milestone progress is supporting detail; losing it must not blank the
        // screen she actually came for.
        gqlMyMilestoneProgress().catch(() => null),
        fetchWasherProfile(),
      ]);
      setConfig(cfg);
      setEntitlement(ent);
      setProgress(prog);
      // Her hours live on her profile, not on the booking config — that is what
      // makes them hers, and what the slot engine reads.
      const fe = beToFeHours(profile.operatingHours as never);
      setHours(fe);
      setSavedHours(fe);
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
  }, []);

  // Lalaba can change the schedule while the app is open, so this refetches on
  // every focus rather than only on mount.
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
      const saved = await gqlUpdateMyFulfillmentPricing({ [leg]: { feeCentavos } });
      setConfig(saved);
      notify.success("Fees saved");
    } catch (err) {
      setPricingError(
        err instanceof Error ? err.message : "Couldn't save your fees.",
      );
    } finally {
      setSaving(false);
    }
  }

  /** The pause switch is the only thing this screen still writes to the config. */
  async function savePause(bookingsPaused: boolean) {
    setSaving(true);
    setCapacityError(null);
    try {
      const saved = await gqlUpdateMyBookingCapacity({ bookingsPaused });
      setConfig(saved);
      notify.success(bookingsPaused ? "New bookings paused" : "Bookings resumed");
    } catch (err) {
      setCapacityError(
        err instanceof Error ? err.message : "Couldn't save that.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveHours() {
    if (!hours) return;
    // The BE drops a reversed window rather than rejecting it, which would
    // silently close the day — so name the day here instead.
    const invalid = findInvalidHoursDay(hours);
    if (invalid) {
      setHoursError(`${invalid}: closing time must be after opening time.`);
      return;
    }
    setSavingHours(true);
    setHoursError(null);
    try {
      const updated = await gqlUpdateWasherProfile({
        operatingHours: feToBeHours(hours),
      } as never);
      // Keep the store in step: the dashboard and store editor read the same
      // profile, and discovery renders "Open until 8 PM" off these hours.
      useWasherStore.setState({ profile: updated });
      setSavedHours(hours);
      notify.success("Operating hours saved");
      // The rules summary is generated from these hours server-side, so it has
      // to be refetched rather than patched locally.
      void load(true);
    } catch (err) {
      setHoursError(
        err instanceof Error ? err.message : "Couldn't save your hours.",
      );
    } finally {
      setSavingHours(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <BackLink label="Settings" fallback="/(washer)/settings" style={{ marginHorizontal: SP._16 }} />
        <View style={styles.center}>
          <ActivityIndicator color={TEAL} />
        </View>
      </View>
    );
  }

  if (loadError || !config || !entitlement) {
    return (
      // This stack has no header chrome (see BackLink.tsx) — without an
      // explicit back affordance here, a failed load was a genuine dead end:
      // no way back to Settings except an OS back gesture nobody expects.
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <BackLink label="Settings" fallback="/(washer)/settings" style={{ marginHorizontal: SP._16 }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Couldn&apos;t load your booking availability.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const accepting = config.summary.isAcceptingBookings;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + SP._8,
        paddingBottom: insets.bottom + SP._32,
        paddingHorizontal: SP._16,
      }}
    >
      <BackLink label="Settings" fallback="/(washer)/settings" />

      <Text style={styles.title}>Booking availability</Text>
      <Text style={styles.subtitle}>
        When customers can schedule laundry with you
      </Text>

      <View style={[styles.stateBadge, !accepting && styles.stateBadgePaused]}>
        <Ionicons
          name={accepting ? "checkmark-circle" : "pause-circle"}
          size={15}
          color={accepting ? TEAL_D : C.warning700}
        />
        <Text
          style={[styles.stateText, !accepting && { color: C.warning700 }]}
        >
          {config.summary.stateLabel}
        </Text>
      </View>

      {/* §13 — pausing is not the same as closing the shop, and must not need
          seven days of schedule edits. */}
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
            trackColor={{ false: C.gray200, true: C.washer100 }}
            thumbColor={config.bookingsPaused ? TEAL : C.gray400}
          />
        </View>
        {config.bookingsPaused && config.pauseReason ? (
          <Text style={styles.pauseReason}>{config.pauseReason}</Text>
        ) : null}
      </View>

      {/* What she has unlocked, and what is next. Earned automatically from
          her own record — never assigned by Lalaba by hand. */}
      {progress?.currentName ? (
        <>
          <Text style={styles.sectionTitle}>Your booking plan</Text>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.planName}>{progress.currentName}</Text>
              <Text style={styles.planCapacity}>
                {entitlement.dailyCapacity == null
                  ? "No limit"
                  : `${entitlement.dailyCapacity} bookings/day`}
              </Text>
            </View>

            {entitlement.appliedCampaignNames.length > 0 ? (
              <View style={styles.promoBox}>
                <Ionicons name="sparkles-outline" size={14} color={TEAL_D} />
                <Text style={styles.promoText}>
                  {entitlement.appliedCampaignNames.join(", ")} is boosting your
                  capacity right now.
                </Text>
              </View>
            ) : null}

            {progress.nextName ? (
              <View style={styles.nextBox}>
                <Text style={styles.nextTitle}>
                  Next plan · {progress.nextName}
                </Text>

                {progress.ordersRequired != null ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(
                              100,
                              Math.round(
                                (progress.completedOrders /
                                  Math.max(1, progress.ordersRequired)) *
                                  100,
                              ),
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.hint}>
                      {progress.completedOrders} / {progress.ordersRequired}{" "}
                      completed orders
                    </Text>
                  </>
                ) : null}

                {progress.unmetRequirements.length > 0 ? (
                  <Text style={styles.hint}>
                    Still needed: {progress.unmetRequirements.join(" · ")}
                  </Text>
                ) : null}

                {progress.nextDailyCapacity != null ? (
                  <Text style={styles.nextReward}>
                    Unlocks up to {progress.nextDailyCapacity} bookings/day
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.hint}>
                You are on the highest plan available.
              </Text>
            )}
          </View>
        </>
      ) : null}

      {/* Capacity — platform-set, shown so she knows what she is working
          with. Read-only: there is one number for every washer today, and a
          field she could only ever lower was worse than no field. */}
      <Text style={styles.sectionTitle}>How much can you take?</Text>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Bookings per day</Text>
          <Text style={styles.readOnlyValue}>
            {entitlement.dailyCapacity == null
              ? "No limit"
              : entitlement.dailyCapacity}
          </Text>
        </View>
        <Text style={styles.rowHint}>
          {entitlement.dailyCapacity == null
            ? "No platform limit on your daily bookings."
            : "Lalaba sets this for now. Pause new bookings below if you need a break."}
        </Text>

        {capacityError ? (
          <Text style={styles.fieldError}>{capacityError}</Text>
        ) : null}
      </View>

      {/* Fees you charge — the two transport legs are priced independently, so
          "free pickup, paid delivery" is expressible. ₱0 IS free. */}
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

        {pricingError ? (
          <Text style={styles.fieldError}>{pricingError}</Text>
        ) : null}
      </View>

      {/* Operating hours — hers to set, using the same editor merchants get.
          This replaced a read-only "Weekly schedule" the washer could look at
          but never change, and a "Special dates" list that was always empty for
          her because only admins create them. The engine generates her bookable
          slots straight from what she sets here. */}
      <Text style={styles.sectionTitle}>Operating hours</Text>
      {hours ? (
        <>
          <HoursEditor hours={hours} onChange={setHours} accentColor={TEAL} />
          {hoursError ? (
            <Text style={styles.fieldError}>{hoursError}</Text>
          ) : null}
          {hoursDirty ? (
            <View style={styles.hoursActions}>
              <TouchableOpacity
                style={[styles.hoursBtn, styles.hoursBtnGhost]}
                onPress={() => {
                  setHours(savedHours);
                  setHoursError(null);
                }}
                disabled={savingHours}
                activeOpacity={0.8}
              >
                <Text style={styles.hoursBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.hoursBtn, styles.hoursBtnPrimary]}
                onPress={() => void saveHours()}
                disabled={savingHours}
                activeOpacity={0.8}
              >
                <Text style={styles.hoursBtnPrimaryText}>
                  {savingHours ? "Saving…" : "Save changes"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}

      {/* §15 — the rules in plain language, generated server-side so this can
          never drift from what the booking check actually enforces. */}
      <Text style={styles.sectionTitle}>Your booking rules</Text>
      <View style={styles.card}>
        {config.summary.ruleLines.map((line) => (
          <View key={line} style={styles.ruleRow}>
            <Ionicons name="ellipse" size={5} color={C.gray400} />
            <Text style={styles.ruleText}>{line}</Text>
          </View>
        ))}
        {entitlement.sameDayBookingEnabled ? (
          <Text style={styles.hint}>
            Same-day bookings stop at{" "}
            {formatTime12(entitlement.sameDayCutoffTime)}.
          </Text>
        ) : null}
      </View>

      <View style={styles.noteBox}>
        <Ionicons name="information-circle-outline" size={14} color={TEAL_D} />
        <Text style={styles.noteText}>
          You set your own hours. Lalaba sets the booking rules and how many
          bookings a day you can take — you can pause new ones any time.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.gray50 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.gray50,
    padding: SP._24,
  },
  errorText: { color: C.gray600, marginBottom: SP._12, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: SP._16,
    paddingVertical: SP._8,
    borderRadius: RADIUS.md,
    backgroundColor: C.washer100,
  },
  retryText: { color: TEAL_D, fontWeight: "600" },

  readOnlyValue: { fontSize: 16, fontWeight: "700", color: C.gray900 },

  currencyField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    backgroundColor: C.white,
    paddingLeft: SP._16,
  },
  currencyAffix: { fontSize: 15, fontWeight: "700", color: C.gray500 },
  currencyInput: {
    flex: 1,
    paddingHorizontal: SP._8,
    paddingVertical: SP._14,
    fontSize: 15,
    color: C.gray900,
  },

  hoursActions: { flexDirection: "row", gap: SP._12, marginTop: SP._12 },
  hoursBtn: {
    flex: 1,
    paddingVertical: SP._12,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  hoursBtnGhost: { borderWidth: 1, borderColor: C.gray200 },
  hoursBtnGhostText: { color: C.gray700, fontWeight: "600" },
  hoursBtnPrimary: { backgroundColor: TEAL },
  hoursBtnPrimaryText: { color: C.white, fontWeight: "700" },

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: C.gray900,
    marginTop: SP._8,
  },
  subtitle: { fontSize: 13, color: C.gray500, marginTop: 2 },

  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: SP._12,
    paddingHorizontal: SP._12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: C.washer100,
  },
  stateBadgePaused: { backgroundColor: C.warning100 },
  stateText: { fontSize: 12, fontWeight: "700", color: TEAL_D },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: SP._24,
    marginBottom: SP._8,
  },

  card: {
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    padding: SP._16,
    marginTop: SP._12,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: C.gray900 },
  rowHint: { fontSize: 12, color: C.gray500, marginTop: 2 },
  pauseReason: {
    marginTop: SP._8,
    fontSize: 12,
    color: C.warning700,
  },
  hint: { fontSize: 12, color: C.gray500, marginTop: 4 },
  fieldError: { fontSize: 12, color: C.error700, marginTop: SP._8 },

  dayCard: {
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    padding: SP._16,
    marginBottom: SP._8,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  dayName: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  dayStatus: { fontSize: 11, fontWeight: "700", color: TEAL_D },
  dayStatusClosed: { color: C.gray400 },
  dayHours: { fontSize: 13, color: C.gray700, marginTop: 4 },
  dayCapacity: { fontSize: 12, color: C.gray500, marginTop: 2 },
  dayDetail: {
    marginTop: SP._12,
    paddingTop: SP._12,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    gap: 6,
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { fontSize: 12, color: C.gray500 },
  detailValue: { fontSize: 12, color: C.gray800, fontWeight: "600" },

  divider: { height: 1, backgroundColor: C.gray100, marginVertical: SP._12 },
  specialDate: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  specialKind: { fontSize: 12, color: C.gray500 },

  planName: { fontSize: 17, fontWeight: "700", color: C.gray900 },
  planCapacity: { fontSize: 13, fontWeight: "600", color: TEAL_D },
  promoBox: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginTop: SP._12,
    padding: SP._8,
    borderRadius: RADIUS.md,
    backgroundColor: C.washer100,
  },
  promoText: { flex: 1, fontSize: 12, color: TEAL_D, lineHeight: 16 },
  nextBox: {
    marginTop: SP._12,
    paddingTop: SP._12,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    gap: 6,
  },
  nextTitle: { fontSize: 13, fontWeight: "600", color: C.gray700 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.gray200,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: TEAL },
  nextReward: { fontSize: 12, color: C.gray700, marginTop: 2 },

  ruleRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  ruleText: { fontSize: 13, color: C.gray700, paddingVertical: 3 },

  noteBox: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginTop: SP._16,
    padding: SP._12,
    borderRadius: RADIUS.md,
    backgroundColor: C.washer100,
  },
  noteText: { flex: 1, fontSize: 12, color: TEAL_D, lineHeight: 17 },
});
