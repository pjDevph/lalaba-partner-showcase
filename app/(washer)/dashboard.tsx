// app/(washer)/dashboard.tsx
// Home washer dashboard — the "provider home" design (2026-08): identity header
// with account switcher, ONLINE / ACCEPTING-ORDERS status chips,
// a "Your public profile / view as customer" card with a profile-completion
// ring, a "Your business today" stats row, and the live Active Orders list.
//
// All data is real: useWasherStore (profile + washerStats) and useOnlineOrders-
// Store (incomingOnlineOrders for this washer's branch — the same orders the
// Orders tab shows). Fields the BE doesn't expose (opening hours, %-positive)
// are omitted rather than faked.

import React, { useEffect, useCallback, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Truck, MapPin, Star } from "lucide-react-native";
import { VerifiedBadge } from "../../src/components/verification/VerifiedBadge";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { NotificationBellButton } from "../../src/components/NotificationBellButton";
import { useNotificationFeedStore, NOTIFICATION_POLL_MS } from "../../src/stores/notificationFeedStore";
import { useAuthStore } from "../../src/stores/authStore";
import { useWasherStore } from "../../src/stores/washerStore";
import { hasAddressConfigured } from "../../src/features/washer/readiness";
import { useOnlineOrdersStore, STATUS_LABEL, ONLINE_ORDERS_POLL_MS } from "../../src/stores/onlineOrdersStore";
import { usePoll } from "../../src/hooks/usePoll";
import { useTodayBookingLoad } from "../../src/hooks/useTodayBookingLoad";
import { gqlMyProviderCard, type MyProviderCard } from "../../src/services/graphql/washer";
import { useWalletStore, isNotVisible, isActivated } from "../../src/stores/walletStore";
import { ProgressRing, StatTile } from "../../src/screens/dashboard/providerHome";

const TEAL       = C.washer500;   // #168A7A
const TEAL_D     = C.washer700;   // #0F6E60
const TEAL_BG    = C.washer100;   // #E8F7F4
const PURPLE     = "#7C3AED";     // earnings tile (no token; matches mockup)
const PURPLE_BG  = "#EDE9FE";
// No local default cap, of any kind, for any purpose.
//
// A DEFAULT_DAILY_CAP_DISPLAY = 3 used to live here, feeding the "Bookings
// today" ring when a washer had no admin-set cap. It was chosen when the
// platform booking policy was also seeded at 3 — and it stayed 3 after an
// admin changed the policy, so the most prominent number on this screen
// disagreed with both the admin panel and the server that turns customers
// away. Every cap here now comes from useTodayBookingLoad, which reads the
// booking engine's own answer for today.

// Order status buckets for "Your business today".
const NEW_STATUS   = "pending_provider_acceptance";
const READY_STATUS = "laundry_ready";
const ACTIVE_STATUSES = new Set([
  "accepted_by_provider", "awaiting_pickup_assignment",
  "pickup_assigned", "pickup_en_route", "pickup_arrived", "pickup_weighed",
  "picked_up_from_customer", "received_by_provider",
  "laundry_in_progress", "laundry_quality_hold",
  "awaiting_return_assignment", "return_assigned", "return_en_route", "return_arrived",
]);

// ─── Public-card mirror ──────────────────────────────────────────────────────
// "Your public profile" must render byte-for-byte like the customer app's
// <ProviderCard variant="nearby">. That component lives in the customer repo
// and uses ITS token palette, which is not the merchant app's — so the exact
// hexes are mirrored here rather than approximated with local greys. Any change
// to LALABA_CUSTOMER_APP_DEV/src/theme/tokens.ts must be reflected here, or the
// preview starts lying again.
const PUB = {
  primary: "#2457D6",      // C.primary — washer type badge + delivery icon
  washer: "#168A7A",       // C.washer
  washerTint: "#E8F7F4",   // C.washerTint — cover fallback + avatar backdrop
  ink: "#172033",          // C.ink
  textSecondary: "#475569",
  textMuted: "#667085",
  textTertiary: "#94A3B8",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",   // cover backdrop + service chips
  success: "#168A55",      // C.success — status dot + verified shield
  textInverse: "#FFFFFF",
  warning: "#F5A623",   // C.warning — filled star
} as const;
// Mirrors CHIP_LIMIT in the customer app's ProviderCard.
const PUBLIC_CHIP_LIMIT = 2;

// Mirrors the card's <Stars>: 5 lucide stars at 13px with fractional fill.
// The shared StarRow uses Ionicons at 12px in different greys, which read as a
// visibly different control next to the customer's.
function PubStars({ rating, size = 13 }: Readonly<{ rating: number | null; size?: number }>) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const frac = rating == null ? 0 : Math.max(0, Math.min(1, rating - i));
        return (
          <View key={i} style={{ width: size, height: size }}>
            <Star size={size} color={PUB.textTertiary} fill="transparent" />
            {frac > 0 ? (
              <View style={{ position: "absolute", left: 0, top: 0, width: size * frac, height: size, overflow: "hidden" }}>
                <Star size={size} color={PUB.warning} fill={PUB.warning} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// Mirrors the card's MetaRow: 6px icon gap, 5px row spacing.
function MetaRow({ icon, children }: Readonly<{ icon: React.ReactNode; children: React.ReactNode }>) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
      {icon}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>{children}</View>
    </View>
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "HL";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function WasherDashboard() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const { profile, stats, isLoading, loadWasher, toggleAvailability, refreshStats } = useWasherStore();
  const incoming      = useOnlineOrdersStore((s) => s.incoming);
  const fetchIncoming = useOnlineOrdersStore((s) => s.fetchIncoming);

  const washerId = user?.uid ?? "";
  const branchId = profile?.branchId ?? null;

  const isAvailable = profile?.isAvailable ?? false;
  // From `stats`, never `profile` — the profile query deliberately omits
  // slotsUsedToday (WASHER_PROFILE_FIELDS), so reading it off `profile` here
  // used to show a stale/zeroed value whenever loadWasher() re-ran after
  // refreshStats() (every loadWasher() reset it back to profile's own
  // default of 0, clobbering the real count refreshStats had just fetched).
  // Both numbers from the booking engine, so the count and the ceiling it is
  // measured against can never come from different places and disagree. It
  // folds in her platform entitlement, her own chosen limit, any date override
  // AND the admin's per-washer cap — she is subject to the lowest of them.
  const bookings = useTodayBookingLoad(
    branchId,
    "WASHER",
    profile?.maxOrdersPerDay ?? null,
  );
  const slotsUsed = bookings.used;
  // Null cap ⇒ no slot arithmetic at all. `slotsLeft` stays null rather than
  // becoming a number, so nothing downstream can render a ceiling she does not
  // have. Until the day's answer arrives she is not "full" either: a ceiling
  // we have not read yet must never be reported as one she has hit.
  const slotsLeft = bookings.remaining;
  const accepting = isAvailable && (slotsLeft == null || slotsLeft > 0);

  // Her shop's name, resolved the way the BE resolves it for discovery: the
  // store name, or the same generic label the BE uses (washer-name.util
  // UNNAMED_WASHER_STORE_NAME) — never her personal name, which appears only as
  // `operator` below.
  const businessName = profile?.storeName?.trim() || "Home Laundry";
  const operator = user?.displayName ?? null;
  const location = [profile?.barangay, profile?.city].filter(Boolean).join(", ");
  // Phase 2: the offered set is template ids from the platform catalog.
  // `profile.services` is a Phase 1 shim the BE no longer returns, so counting
  // it left this check permanently false.
  const offeredCount = profile?.offeredServiceTemplateIds?.length ?? 0;

  // Profile completion — real, from filled fields.
  const completion = useMemo(() => {
    if (!profile) return 0;
    const checks = [
      !!profile.photoUrl,
      !!profile.storeHeaderUrl,
      !!profile.storeDescription,
      offeredCount > 0,
      !!profile.barangay,
      !!profile.city,
      (profile.serviceRadiusKm ?? 0) > 0,
    ];
    return (checks.filter(Boolean).length / checks.length) * 100;
  }, [profile, offeredCount]);

  const activeOrders = useMemo(
    () => incoming.filter((o) => o.status === NEW_STATUS || o.status === READY_STATUS || ACTIVE_STATUSES.has(o.status)),
    [incoming],
  );

  useEffect(() => {
    if (washerId) loadWasher(washerId);
  }, [washerId, loadWasher]);

  usePoll(
    () => (branchId ? fetchIncoming(branchId) : undefined),
    ONLINE_ORDERS_POLL_MS,
    !!branchId,
  );

  useFocusEffect(
    useCallback(() => {
      if (washerId) refreshStats(washerId);
    }, [washerId, refreshStats]),
  );

  // The washer's OWN public card — the exact card customers see in discovery.
  // Drives the "this is what customers see" preview so it can't drift.
  const [card, setCard] = useState<MyProviderCard | null>(null);
  // A failed fetch used to be swallowed, leaving the preview to quietly fall
  // back to local device state while still captioned "what customers see".
  // Track the failure so the card can say so instead of guessing.
  const [cardError, setCardError] = useState(false);
  // Mirrors the customer card: unreachable media degrades to tint / initials,
  // never to an empty square. Reset when the URL itself changes.
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const loadCard = useCallback(async () => {
    try {
      setCard(await gqlMyProviderCard());
      setCardError(false);
    } catch {
      setCardError(true); // keep the last good card, if any
    }
  }, []);
  useEffect(() => { void loadCard(); }, [loadCard]);
  useFocusEffect(useCallback(() => { void loadCard(); }, [loadCard]));

  // Unread notifications → the header bell dot.
  const refreshUnread = useNotificationFeedStore((s) => s.refreshUnread);
  useFocusEffect(useCallback(() => { void refreshUnread(); }, [refreshUnread]));
  usePoll(refreshUnread, NOTIFICATION_POLL_MS);

  // Fee-wallet balance — must stay ≥ the activation minimum to be visible in
  // the Marketplace and accept bookings. Insufficient → not visible + top-up.
  const balanceCentavos = useWalletStore((s) => s.balanceCentavos);
  const activatedAt = useWalletStore((s) => s.activatedAt);
  const loadedBranchId = useWalletStore((s) => s.loadedBranchId);
  const loadBalance = useWalletStore((s) => s.load);
  useFocusEffect(useCallback(() => { if (branchId) void loadBalance(branchId); }, [branchId, loadBalance]));
  // Only judge visibility once the wallet on hand is this account's — see the
  // matching guard in the merchant dashboard.
  const walletReady = !!branchId && loadedBranchId === branchId;
  const notVisible = walletReady && isNotVisible(balanceCentavos, activatedAt);
  // Second marketplace gate: a funded provider with an empty catalog is not
  // listed either — there would be nothing for a customer to book. Read off the
  // real public card, which is exactly what discovery computes, rather than
  // local profile state that can disagree with the server.
  const catalogEmpty = card != null && (card.serviceCategories?.length ?? 0) === 0;
  // Third marketplace gate: discovery matches customers to washers by DISTANCE,
  // so a washer with no map pin or no service radius cannot be matched at all —
  // the backend refuses to quote for her. This failed silently before: she saw
  // ONLINE, and no customer ever found her.
  const addressMissing = profile != null && !hasAddressConfigured(profile);
  // Off the marketplace for ANY reason. The preview claims to show what
  // customers see; when they can't see the shop at all, saying so is the
  // honest version of that claim.
  const offMarketplace = notVisible || catalogEmpty || addressMissing;
  const activated = isActivated(activatedAt);

  // Center top-up prompt — shown once per mount when the account is off the
  // Marketplace. Copy depends on whether it's onboarding (₱1,000) or a depleted
  // wallet (top up to the ₱100 accept-a-booking minimum).
  const [topUpOpen, setTopUpOpen] = useState(false);
  const promptShownRef = useRef(false);
  useEffect(() => {
    if (notVisible && !promptShownRef.current) {
      promptShownRef.current = true;
      setTopUpOpen(true);
    }
  }, [notVisible]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWasher(washerId), refreshStats(washerId), loadCard()]);
    setRefreshing(false);
  };

  // Preview values. Text may fall back to local profile — it's the same string
  // the washer just typed. Media may NOT: a local storeHeaderUrl/photoUrl can
  // be a stale or never-uploaded device URI, and showing it here would claim a
  // cover photo customers can't actually see. Card-only, or nothing.
  const previewName = card?.name ?? businessName;
  const previewArea = card?.areaLabel ?? location;
  const previewCover = card?.coverPhotoUrl ?? null;
  const previewLogo = card?.logoUrl ?? null;
  // Retry once the URL itself changes, so a fixed upload isn't stuck on the
  // previous failure.
  useEffect(() => { setCoverFailed(false); }, [previewCover]);
  useEffect(() => { setLogoFailed(false); }, [previewLogo]);
  // Nothing to preview and no way to fetch it — say that rather than compose a
  // plausible-looking card out of local state.
  const previewUnavailable = !card && cardError;
  const previewRating = card && card.ratingCount > 0 ? card.ratingAverage : null;
  const previewReviews = card?.ratingCount ?? 0;
  const previewCategories = card?.serviceCategories ?? [];
  const previewStatus = card?.statusText ?? (isAvailable ? "Accepting bookings" : "Closed");

  if (isLoading && !profile) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Onboarding / top-up prompt — centered, dismissable. The Wallet tab
          keeps a red dot afterward to point the way back. */}
      <Modal visible={topUpOpen} transparent animationType="fade" onRequestClose={() => setTopUpOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 }}>
          <View style={{ backgroundColor: C.white, borderRadius: 20, padding: SP._20, width: "100%", maxWidth: 360, gap: SP._12 }}>
            <TouchableOpacity style={{ alignSelf: "flex-end" }} onPress={() => setTopUpOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={C.gray500} />
            </TouchableOpacity>
            <View style={{ alignItems: "center", gap: SP._8 }}>
              <View style={{ width: 56, height: 56, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="wallet-outline" size={26} color={TEAL_D} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: C.gray900, textAlign: "center" }}>
                {activated ? "Top up to keep accepting" : "Activate your account"}
              </Text>
              <Text style={{ fontSize: 14, color: C.gray600, textAlign: "center", lineHeight: 20 }}>
                {activated
                  ? "Your fee wallet is below the ₱100 minimum needed to accept a booking. Top up (minimum ₱100) to stay visible and keep receiving bookings."
                  : "Onboarding requires a top-up of ₱1,000 to your wallet to activate your account, receive bookings, and become visible in the Marketplace."}
              </Text>
            </View>
            <TouchableOpacity
              style={{ height: 50, borderRadius: RADIUS.md, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", marginTop: SP._4 }}
              onPress={() => { setTopUpOpen(false); router.push("/(washer)/fee-balance"); }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 15, fontWeight: "800", color: C.white }}>Top up now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Identity header */}
      <View style={[styles.header, { paddingTop: insets.top + SP._10 }]}>
        <View style={styles.identityRow}>
          <TouchableOpacity style={styles.avatarSm} onPress={() => router.push("/(washer)/store")} activeOpacity={0.8}>
            {profile?.photoUrl ? (
              <Image source={{ uri: profile.photoUrl }} style={styles.avatarSmImg} />
            ) : (
              <Text style={styles.avatarSmText}>{initials(businessName)}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => router.push("/(washer)/settings")} activeOpacity={0.7}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.biz} numberOfLines={1}>{businessName}</Text>
              <Ionicons name="chevron-down" size={16} color={C.gray500} />
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              Home washer{operator ? ` · Operated by ${operator}` : ""}
            </Text>
          </TouchableOpacity>
          <NotificationBellButton />
        </View>

        <View style={styles.chipsRow}>
          {offMarketplace ? (
            <>
              {/* Off the Marketplace: unfunded wallet, nothing to sell, or
                  nowhere to sell it from. Funding is named first because it
                  blocks the other two from mattering. */}
              <View style={[styles.chip, { backgroundColor: C.gray100 }]}>
                <View style={[styles.dot, { backgroundColor: C.gray400 }]} />
                <Text style={[styles.chipText, { color: C.gray600 }]}>NOT VISIBLE</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: C.error100 }]}>
                <Ionicons name="alert-circle-outline" size={13} color={C.error700} />
                <Text style={[styles.chipText, { color: C.error700 }]}>
                  {notVisible
                    ? "INSUFFICIENT FUNDS"
                    : catalogEmpty
                      ? "NO SERVICES YET"
                      : "NO ADDRESS YET"}
                </Text>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: isAvailable ? TEAL_BG : C.gray100 }]}
                onPress={toggleAvailability}
                activeOpacity={0.7}
              >
                <View style={[styles.dot, { backgroundColor: isAvailable ? C.success500 : C.gray400 }]} />
                <Text style={[styles.chipText, { color: isAvailable ? TEAL_D : C.gray600 }]}>
                  {isAvailable ? "ONLINE" : "OFFLINE"}
                </Text>
              </TouchableOpacity>
              <View style={[styles.chip, { backgroundColor: accepting ? C.brand50 : C.gray100 }]}>
                <Ionicons name="bicycle-outline" size={13} color={accepting ? C.brand600 : C.gray500} />
                <Text style={[styles.chipText, { color: accepting ? C.brand600 : C.gray600 }]}>
                  {accepting ? "ACCEPTING ORDERS" : slotsLeft === 0 ? "FULLY BOOKED" : "PAUSED"}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* The wallet gate already raises a top-up modal; the catalog gate had
            no surface at all, so a washer could be funded, online, and still
            invisible with nothing telling them why. */}
        {catalogEmpty && !notVisible ? (
          <TouchableOpacity
            style={styles.gateBanner}
            activeOpacity={0.8}
            onPress={() => router.push("/(washer)/services")}
          >
            <Ionicons name="pricetags-outline" size={18} color={C.warning700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gateTitle}>Add a service to go live</Text>
              <Text style={styles.gateBody}>
                Customers can&apos;t find you until you offer at least one service.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.warning700} />
          </TouchableOpacity>
        ) : null}

        {/* Same treatment as the services gate above — the address half was
            invisible before, so a washer with no pin saw ONLINE and simply
            never got a booking. Only shown once the louder gates are clear, so
            she is given one thing to fix at a time. */}
        {addressMissing && !notVisible && !catalogEmpty ? (
          <TouchableOpacity
            style={styles.gateBanner}
            activeOpacity={0.8}
            onPress={() => router.push("/(washer)/address")}
          >
            <Ionicons name="location-outline" size={18} color={C.warning700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gateTitle}>Add your address to go live</Text>
              <Text style={styles.gateBody}>
                Customers are matched by distance, so we need your location and
                service radius.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.warning700} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Your public profile */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Your public profile</Text>
              <Text style={styles.cardSub}>
                {offMarketplace ? "How you'll look once you're live" : "This is what customers see"}
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <ProgressRing pct={completion} accent={TEAL} accentDark={TEAL_D} />
              <Text style={styles.ringLabel}>Profile{"\n"}complete</Text>
            </View>
          </View>

          {/* Cover + inset avatar + identity — rendered from the real public
              card (gqlMyProviderCard), so it's exactly what customers see. */}
          {previewUnavailable ? (
            <View style={styles.previewError}>
              <Ionicons name="cloud-offline-outline" size={22} color={C.gray400} />
              <Text style={styles.previewErrorTitle}>Couldn&apos;t load your public profile</Text>
              <Text style={styles.previewErrorBody}>
                We can&apos;t show what customers see right now. Check your connection and try again.
              </Text>
              <TouchableOpacity style={styles.previewRetry} onPress={() => void loadCard()}>
                <Text style={styles.previewRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <>
          {/* A refresh failed but an earlier card is still on screen — it's the
              last known public state, not necessarily the current one. */}
          {cardError ? (
            <View style={styles.staleRow}>
              <Ionicons name="alert-circle-outline" size={13} color={C.warning600} />
              <Text style={styles.staleText}>Couldn&apos;t refresh — showing the last version we loaded.</Text>
            </View>
          ) : null}
          {offMarketplace ? (
            <View style={styles.hiddenNote}>
              <Ionicons name="eye-off-outline" size={14} color={C.gray600} />
              <Text style={styles.hiddenNoteText}>Not shown in the marketplace right now</Text>
            </View>
          ) : null}

          <View style={[styles.previewRow, offMarketplace && { opacity: 0.55 }]}>
            <View style={styles.cover}>
              {previewCover && !coverFailed ? (
                <Image
                  testID="preview-cover"
                  source={{ uri: previewCover }}
                  onError={() => setCoverFailed(true)}
                  resizeMode="cover"
                  style={styles.coverImg}
                />
              ) : (
                <View style={[styles.coverImg, { backgroundColor: PUB.washerTint }]} />
              )}
              <View style={styles.coverBadge}>
                <Ionicons name="home" size={11} color={PUB.textInverse} />
                <Text style={styles.coverBadgeText} numberOfLines={2}>Home{"\n"}Washer</Text>
              </View>
              <View style={styles.coverAvatar}>
                {previewLogo && !logoFailed ? (
                  <Image
                    testID="preview-logo"
                    source={{ uri: previewLogo }}
                    onError={() => setLogoFailed(true)}
                    resizeMode="cover"
                    style={styles.coverAvatarImg}
                  />
                ) : (
                  <Text style={styles.coverAvatarText}>{initials(previewName)}</Text>
                )}
              </View>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._8 }}>
                <Text style={[styles.pName, { flex: 1 }]} numberOfLines={1}>{previewName}</Text>
                {card ? (
                  <VerifiedBadge
                    verified={card.isVerified}
                    size={20}
                    verifiedColor={PUB.success}
                    verifiedTextColor={PUB.success}
                    mutedColor={PUB.textTertiary}
                  />
                ) : null}
              </View>

              {operator ? (
                <Text style={styles.pOperator} numberOfLines={1}>Operated by: {operator}</Text>
              ) : null}

              {previewArea ? (
                <MetaRow icon={<MapPin size={14} color={PUB.textMuted} />}>
                  <Text style={styles.pLineText} numberOfLines={1}>{previewArea}</Text>
                </MetaRow>
              ) : null}

              {previewRating != null ? (
                <MetaRow icon={<PubStars rating={previewRating} />}>
                  <Text style={styles.pRating}>{previewRating.toFixed(1)} </Text>
                  <Text style={styles.pLineMuted}>· {previewReviews} reviews</Text>
                </MetaRow>
              ) : (
                <MetaRow icon={<PubStars rating={null} />}>
                  <Text style={styles.pLineMuted}>Not rated yet</Text>
                </MetaRow>
              )}

              {/* Status dot is unconditionally green on the customer card, so it
                  is here too — this preview mirrors that card, it does not
                  improve on it. */}
              {previewStatus ? (
                <MetaRow icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PUB.success }} />}>
                  <Text style={styles.pLineText} numberOfLines={1}>{previewStatus}</Text>
                </MetaRow>
              ) : null}

              <MetaRow icon={<Truck size={14} color={PUB.primary} />}>
                <Text style={styles.pLineText}>Pickup &amp; delivery available</Text>
              </MetaRow>
            </View>
          </View>

          {/* Service chips — same CHIP_LIMIT and overflow rule as the card. */}
          {previewCategories.length > 0 ? (
            <View style={styles.svcRow}>
              {previewCategories.slice(0, PUBLIC_CHIP_LIMIT).map((cat, i) => (
                <View key={i} style={[styles.svcChip, { flexShrink: 1 }]}>
                  <Text style={styles.svcChipText} numberOfLines={1} ellipsizeMode="tail">{cat}</Text>
                </View>
              ))}
              {previewCategories.length > PUBLIC_CHIP_LIMIT ? (
                <View style={[styles.svcChip, { flexShrink: 0 }]}>
                  <Text style={styles.svcChipText}>+{previewCategories.length - PUBLIC_CHIP_LIMIT}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          </>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            {/* Labelled for where it actually goes: this opens the store
                editor (photos + description), not the business profile. */}
            <TouchableOpacity style={styles.btnOutline} onPress={() => router.push("/(washer)/store")} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={16} color={C.gray800} />
              <Text style={styles.btnOutlineText}>Edit store</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => router.push("/(washer)/preview")} activeOpacity={0.85}>
              <Ionicons name="eye-outline" size={16} color={C.white} />
              <Text style={styles.btnPrimaryText}>View as customer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Your business overview — lifetime totals from completed orders.
            Header and tiles share one wrapper so they sit 8px apart instead of
            inheriting the scroll container's 16px gap; the row reads as one
            block and gives the Active orders list more room above the fold. */}
        <View style={styles.statsSection}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.sectionTitle}>Your business overview</Text>
            <Ionicons name="chevron-down" size={16} color={C.gray500} />
          </View>
          <TouchableOpacity onPress={() => router.push("/(washer)/wallet")}>
            <Text style={[styles.sectionLink, { color: TEAL_D }]}>View all stats</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <StatTile icon="bag-handle-outline" tint={C.brand500} tintBg={C.brand50} value={stats?.completedOrders ?? 0} label="Completed Orders" dense />
          <StatTile icon="barbell-outline" tint={C.success700} tintBg={C.success100} value={`${(stats?.totalKg ?? 0).toFixed(1)} kg`} label="Total Kg" small dense />
          <StatTile icon="shirt-outline" tint={C.warning700} tintBg={C.warning100} value={stats?.totalLoads ?? 0} label="Total Loads" dense />
          {/* Was an "Earnings" tile reading stats.totalEarningsThisMonth — a field
              the BE dropped with GAP-P0-011 (no payout surface in Phase 2;
              customers pay the washer directly), then briefly "Active Jobs"
              (in-flight order count). Now the daily booking cap, as a ring
              (like Profile Complete's) rather than a bare number. An uncapped
              washer gets the count with no denominator and no ring — "3" is
              the whole truth, where "3/anything" would invent a ceiling she
              does not have. */}
          <StatTile
            icon="time-outline"
            tint={PURPLE}
            tintBg={PURPLE_BG}
            value={bookings.cap == null ? `${slotsUsed}` : `${slotsUsed}/${bookings.cap}`}
            label="Bookings today"
            small
            dense
            ring={bookings.cap == null ? undefined : bookings.pct}
          />
        </View>
        </View>

        {/* Active orders */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active orders</Text>
          <TouchableOpacity onPress={() => router.push("/(washer)/orders")}>
            <Text style={[styles.sectionLink, { color: TEAL_D }]}>View all orders</Text>
          </TouchableOpacity>
        </View>

        {activeOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={40} color={C.gray200} />
            <Text style={styles.emptyTitle}>No active orders yet</Text>
            <Text style={styles.emptySub}>
              {isAvailable ? "New orders will appear here." : "Go online to start accepting orders."}
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {activeOrders.slice(0, 4).map((o, idx) => (
              <React.Fragment key={o._id}>
                {idx > 0 && <View style={styles.divider} />}
                <TouchableOpacity style={styles.orderRow} onPress={() => router.push("/(washer)/orders")} activeOpacity={0.7}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>{initials(o.customer.displayName)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.orderName} numberOfLines={1}>{o.customer.displayName}</Text>
                    <Text style={styles.orderMeta} numberOfLines={1}>#LB-{o._id.slice(-4).toUpperCase()}</Text>
                  </View>
                  <View style={styles.orderPill}>
                    <Text style={styles.orderPillText}>{STATUS_LABEL[o.status] ?? o.status}</Text>
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={{ height: SP._24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.gray50 },

  // Header
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: SP._16, paddingBottom: SP._12, gap: SP._10 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  avatarSm: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarSmImg: { width: "100%", height: "100%" },
  avatarSmText: { fontSize: 14, fontWeight: "800", color: TEAL_D },
  biz: { fontSize: 17, fontWeight: "800", color: C.gray900, flexShrink: 1 },
  sub: { fontSize: 12, color: C.gray500, marginTop: 1 },

  chipsRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: SP._10, borderRadius: RADIUS.full },
  dot: { width: 7, height: 7, borderRadius: RADIUS.full },
  chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },

  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16, gap: SP._16 },

  // Warn
  warnBanner: { flexDirection: "row", alignItems: "center", gap: SP._8, backgroundColor: C.warning100, borderRadius: 16, padding: SP._12, borderWidth: 1, borderColor: C.warning300 },
  errBanner: { backgroundColor: C.error100, borderColor: C.error500 },
  topUpPill: { borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 5 },
  topUpText: { fontSize: 12, fontWeight: "800", color: C.white },
  warnText: { flex: 1, fontSize: 13, color: C.warning700, fontWeight: "600" },

  // Public profile card
  card: { backgroundColor: C.white, borderRadius: 20, ...SHADOW.sm, padding: SP._16, gap: SP._14 },
  previewError: { alignItems: "center", justifyContent: "center", paddingVertical: SP._24, paddingHorizontal: SP._16, gap: SP._6 },
  previewErrorTitle: { fontSize: 14, fontWeight: "700", color: C.gray700, textAlign: "center" },
  previewErrorBody: { fontSize: 12, color: C.gray500, textAlign: "center", maxWidth: 260, lineHeight: 17 },
  previewRetry: { height: 36, paddingHorizontal: SP._16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, alignItems: "center", justifyContent: "center", marginTop: SP._4 },
  previewRetryText: { fontSize: 13, fontWeight: "700", color: C.gray700 },
  staleRow: { flexDirection: "row", alignItems: "center", gap: SP._6, backgroundColor: C.warning100, borderRadius: RADIUS.md, paddingHorizontal: SP._10, paddingVertical: SP._6 },
  staleText: { flex: 1, fontSize: 11, fontWeight: "600", color: C.warning700 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SP._12 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: C.gray900 },
  cardSub: { fontSize: 13, color: C.gray500, marginTop: 1 },
  hiddenNote: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 5 },
  hiddenNoteText: { fontSize: 11.5, fontWeight: "700", color: C.gray600 },
  ringLabel: { fontSize: 10, color: C.gray500, textAlign: "center", marginTop: 2, lineHeight: 12 },

  previewRow: { flexDirection: "row", gap: SP._16, alignItems: "flex-start" },
  cover: { width: 116, height: 132, borderRadius: 14, backgroundColor: PUB.surfaceAlt, overflow: "hidden" },
  coverImg: { width: "100%", height: "100%" },
  coverBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PUB.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4, maxWidth: 100 },
  coverBadgeText: { fontSize: 10, fontWeight: "800", color: PUB.textInverse, lineHeight: 12 },
  coverAvatar: { position: "absolute", bottom: 6, left: 6, width: 40, height: 40, borderRadius: 10, borderWidth: 2, borderColor: PUB.surface, backgroundColor: PUB.washerTint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverAvatarImg: { width: "100%", height: "100%" },
  coverAvatarText: { fontSize: 13, fontWeight: "800", color: PUB.washer },

  pName: { fontSize: 18, fontWeight: "800", color: PUB.ink },
  pOperator: { fontSize: 13, color: PUB.textMuted, marginTop: 2 },
  pLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  pLineText: { fontSize: 13, color: PUB.textSecondary, flexShrink: 1 },
  pLineMuted: { fontSize: 13, color: PUB.textMuted },
  pRating: { fontSize: 13, fontWeight: "700", color: PUB.ink },

  svcRow: { flexDirection: "row", flexWrap: "nowrap", gap: SP._4, marginTop: SP._12 },
  svcChip: { backgroundColor: PUB.surfaceAlt, borderRadius: RADIUS.full, paddingHorizontal: SP._12, paddingVertical: 7 },
  svcChipText: { fontSize: 12.5, fontWeight: "600", color: PUB.textSecondary },

  actionsRow: { flexDirection: "row", gap: SP._10 },
  btnOutline: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray300, backgroundColor: C.white },
  btnOutlineText: { fontSize: 14, fontWeight: "700", color: C.gray800 },
  btnPrimary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: RADIUS.md, backgroundColor: C.brand500 },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: C.white },

  // Section
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: C.gray900 },
  sectionLink: { fontSize: 13, fontWeight: "700" },

  // Stats
  gateBanner: { flexDirection: "row", alignItems: "center", gap: SP._10, marginTop: SP._10, backgroundColor: C.warning100, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._10 },
  gateTitle: { fontSize: 13.5, fontWeight: "800", color: C.warning700 },
  gateBody: { fontSize: 12, color: C.warning700, marginTop: 1, lineHeight: 16 },
  statsSection: { gap: SP._10 },
  statsRow: { flexDirection: "row", gap: SP._8 },
  statTile: { flex: 1, backgroundColor: C.white, borderRadius: 16, padding: SP._10, alignItems: "center", gap: 5 },
  statIcon: { width: 34, height: 34, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: C.gray900 },
  statLabel: { fontSize: 10.5, color: C.gray500, textAlign: "center" },

  // Active orders
  listCard: { backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm },
  orderRow: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  orderBadge: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" },
  orderBadgeText: { fontSize: 14, fontWeight: "700", color: TEAL_D },
  orderName: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  orderMeta: { fontSize: 12, color: C.gray500, marginTop: 1, fontFamily: "monospace" },
  orderPill: { backgroundColor: TEAL_BG, borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 4 },
  orderPillText: { fontSize: 11, fontWeight: "700", color: TEAL_D },
  divider: { height: 1, backgroundColor: C.gray100, marginHorizontal: SP._14 },

  // Empty
  emptyCard: { backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, padding: SP._24, alignItems: "center", gap: SP._8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.gray700 },
  emptySub: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 },
});
