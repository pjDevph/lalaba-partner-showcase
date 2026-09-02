// app/(tabs)/dashboard.tsx
// Lalaba Merchant — home dashboard, "provider home" design (matches the
// home-washer dashboard). White, card-first: identity header + status chips, a
// public-profile card, a 4-tile business overview, and the live Active Orders
// list. When the merchant operates 2+ branches the profile card becomes a
// swipeable CAROUSEL — one card per branch; swiping re-scopes the stats and
// active-orders below to that branch (client-side, no refetch).
//
// Shared presentational pieces (ProgressRing / StatTile / BranchProfileCard /
// ProfileCarousel) live in src/screens/dashboard/providerHome.tsx and are shared
// with the washer dashboard so the two can't drift.

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Store } from "lucide-react-native";
import { C, RADIUS, SP } from "../../src/theme/tokens";
import { NotificationBellButton } from "../../src/components/NotificationBellButton";
import { useNotificationFeedStore, NOTIFICATION_POLL_MS } from "../../src/stores/notificationFeedStore";
import { type GqlTransaction } from "../../src/services/graphql/orders";
import { useAuthStore } from "../../src/stores/authStore";
import { useDeepLinkStore } from "../../src/stores/deepLinkStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useOnlineOrdersStore, STATUS_LABEL, ONLINE_ORDERS_POLL_MS } from "../../src/stores/onlineOrdersStore";
import { usePoll } from "../../src/hooks/usePoll";
import { useWalletStore, isNotVisible, isActivated } from "../../src/stores/walletStore";
import { gqlMyProviderCards, type MyProviderCard } from "../../src/services/graphql/discovery";
import { gqlMyConversations } from "../../src/services/graphql/chat";
import {
  loadRawOrders, loadRawTransactions, deriveStats, type RawOrderDoc,
} from "../../src/screens/dashboard/shared";
import {
  StatTile, BranchProfileCard, ProfileCarousel, initials, peso, type ProfileCardData,
} from "../../src/screens/dashboard/providerHome";

const ACCENT    = C.brand500;
const ACCENT_D  = C.brand700;
const ACCENT_BG = C.brand50;
const PURPLE     = "#7C3AED";
const PURPLE_BG  = "#EDE9FE";

// Marketplace order statuses that count as "active" (mirrors the washer home).
const NEW_STATUS   = "pending_provider_acceptance";
const READY_STATUS = "laundry_ready";
const ACTIVE_STATUSES = new Set([
  "accepted_by_provider", "awaiting_pickup_assignment",
  "pickup_assigned", "pickup_en_route", "pickup_arrived", "pickup_weighed",
  "picked_up_from_customer", "received_by_provider",
  "laundry_in_progress", "laundry_quality_hold",
  "awaiting_return_assignment", "return_assigned", "return_en_route", "return_arrived",
]);

function completionOf(card: MyProviderCard, hasHours: boolean): number {
  const checks = [
    !!card.coverPhotoUrl,
    !!card.logoUrl,
    (card.serviceCategories?.length ?? 0) > 0,
    !!card.areaLabel,
    hasHours,
    card.isVerified,
  ];
  return (checks.filter(Boolean).length / checks.length) * 100;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const user       = useAuthStore((s) => s.user);
  const merchantId = useAuthStore((s) => s.merchantId);
  const branches   = useMerchantStore((s) => s.branches);
  const toggleOnline = useMerchantStore((s) => s.toggleOnline);
  // The one shared "current branch". Swiping the carousel re-scopes POS,
  // Orders, Wallet and Services too — see BranchSelectorBar.
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const selectBranch     = useMerchantStore((s) => s.selectBranch);

  const [rawOrders, setRawOrders] = useState<RawOrderDoc[]>([]);
  const [rawTxns,   setRawTxns]   = useState<GqlTransaction[]>([]);
  const [cards,     setCards]     = useState<MyProviderCard[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);

  // Default the selected branch to the first once branches load, and heal a
  // stale id left over from a branch that was archived on another device.
  useEffect(() => {
    if (branches.length === 0) return;
    if (!selectedBranchId || !branches.some((b) => b.id === selectedBranchId)) {
      selectBranch(branches[0].id);
    }
  }, [branches, selectedBranchId, selectBranch]);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? branches[0] ?? null;
  const effectiveBranchId = selectedBranch?.id ?? null;

  const stats = useMemo(
    () => deriveStats(rawOrders, rawTxns, effectiveBranchId),
    [rawOrders, rawTxns, effectiveBranchId],
  );

  // ── Data: POS orders/txns (for the stat tiles) + public cards (per branch) ──
  const fetchData = useCallback(async () => {
    if (!merchantId) return;
    const [orders, txns] = await Promise.all([loadRawOrders(merchantId), loadRawTransactions()]);
    setRawOrders(orders);
    setRawTxns(txns);
  }, [merchantId]);

  const loadCards = useCallback(async () => {
    try { setCards(await gqlMyProviderCards()); } catch { /* keep last */ }
  }, []);

  // Unread chat → drives the header chat-icon dot.
  const loadChat = useCallback(async () => {
    try { const cs = await gqlMyConversations(); setChatUnread(cs.some((c) => c.providerUnread > 0)); } catch { /* transient */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), loadCards()]).finally(() => setLoading(false));
  }, [fetchData, loadCards]);

  // Unread notifications → drives the header bell dot, the same way loadChat
  // drives the chat dot beside it.
  const refreshUnread = useNotificationFeedStore((s) => s.refreshUnread);

  useFocusEffect(useCallback(() => { void fetchData(); void loadCards(); void loadChat(); void refreshUnread(); }, [fetchData, loadCards, loadChat, refreshUnread]));

  usePoll(refreshUnread, NOTIFICATION_POLL_MS);

  // ── Active online orders for the selected branch ──
  const incoming      = useOnlineOrdersStore((s) => s.incoming);
  const fetchIncoming = useOnlineOrdersStore((s) => s.fetchIncoming);
  usePoll(
    () => (effectiveBranchId ? fetchIncoming(effectiveBranchId) : undefined),
    ONLINE_ORDERS_POLL_MS,
    !!effectiveBranchId,
  );
  const activeOrders = useMemo(
    () => incoming.filter((o) => o.status === NEW_STATUS || o.status === READY_STATUS || ACTIVE_STATUSES.has(o.status)),
    [incoming],
  );

  // ── Fee wallet (per selected branch) — drives the chips + top-up modal ──
  const balanceCentavos = useWalletStore((s) => s.balanceCentavos);
  const activatedAt     = useWalletStore((s) => s.activatedAt);
  const loadedBranchId  = useWalletStore((s) => s.loadedBranchId);
  const loadBalance     = useWalletStore((s) => s.load);
  useEffect(() => { if (effectiveBranchId) void loadBalance(effectiveBranchId); }, [effectiveBranchId, loadBalance]);
  // Only judge visibility once the wallet on hand is THIS branch's. Otherwise a
  // funded branch gets a "below the ₱100 minimum" prompt on the first frame,
  // before its balance has arrived.
  const walletReady = !!effectiveBranchId && loadedBranchId === effectiveBranchId;
  const notVisible = walletReady && isNotVisible(balanceCentavos, activatedAt);
  const activated  = isActivated(activatedAt);

  const [topUpOpen, setTopUpOpen] = useState(false);
  const promptShownRef = useRef(false);
  useEffect(() => {
    if (notVisible && !promptShownRef.current) { promptShownRef.current = true; setTopUpOpen(true); }
  }, [notVisible]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), loadCards(), effectiveBranchId ? loadBalance(effectiveBranchId) : Promise.resolve()]);
    setRefreshing(false);
  };

  // ── Card(s) ──
  const selectedCard = cards.find((c) => c.branchId === effectiveBranchId) ?? cards[0] ?? null;
  const selectedIndex = Math.max(0, cards.findIndex((c) => c.branchId === effectiveBranchId));
  const isOnline = selectedBranch?.isOnline ?? false;
  // Second marketplace gate, same reasoning as the washer dashboard's: a
  // funded, online merchant with an empty catalog is still not bookable —
  // read off the real public card, not local state that can disagree with it.
  const catalogEmpty = selectedCard != null && (selectedCard.serviceCategories?.length ?? 0) === 0;

  const businessName = selectedCard?.name ?? selectedBranch?.name ?? user?.displayName ?? "My Laundry";
  // The top-up prompt moves real money into ONE branch's wallet — name it
  // rather than saying "your branch" to a merchant who has several.
  const branchLabel = selectedBranch?.name ?? "this branch";
  const operator = user?.displayName ?? null;
  const areaLabel = selectedCard?.areaLabel ?? selectedBranch?.address ?? null;

  const onSelectIndex = (i: number) => {
    const c = cards[i];
    if (c) selectBranch(c.branchId);
  };

  const renderCard = (c: MyProviderCard) => {
    const branch = branches.find((b) => b.id === c.branchId);
    const cardData: ProfileCardData = {
      branchId: c.branchId, name: c.name, initials: c.initials, areaLabel: c.areaLabel,
      statusText: c.statusText, ratingAverage: c.ratingAverage, ratingCount: c.ratingCount,
      serviceCategories: c.serviceCategories, coverPhotoUrl: c.coverPhotoUrl, logoUrl: c.logoUrl,
      isVerified: c.isVerified,
      // Was fetched by myProviderCards and dropped here, so the preview never
      // showed the price customers actually compare on.
      priceFromCentavos: c.priceFromCentavos,
      priceUnit: "kg",
    };
    return (
      <BranchProfileCard
        card={cardData}
        completionPct={completionOf(c, !!branch?.operatingHours)}
        operator={operator}
        badgeLabel="Laundromat"
        badgeGlyph={Store}
        accent={ACCENT}
        accentDark={ACCENT_D}
        accentBg={ACCENT_BG}
        editLabel="Edit profile"
        editIcon="create-outline"
        previewLabel="View as customer"
        previewIcon="eye-outline"
        // "Edit profile" used to open the Settings HUB — a menu, not an
        // editor. It names a branch now and opens that branch's branding
        // editor (logo, cover, description), which is what the card above is
        // showing. Mirrors the washer's "Edit store".
        onEdit={() => {
          if (effectiveBranchId) {
            useDeepLinkStore.getState().setBrandingBranch(effectiveBranchId);
          }
          router.push("/(tabs)/settings");
        }}
        // The card says "this is what customers see", so the primary action is
        // to go and see it. Services are reachable from Settings and from the
        // empty-catalog banner; they are not what this card is about.
        onPreview={() =>
          router.push(
            (effectiveBranchId
              ? `/(tabs)/preview?branchId=${encodeURIComponent(effectiveBranchId)}`
              : "/(tabs)/preview") as never,
          )
        }
      />
    );
  };

  if (loading && cards.length === 0) {
    return (
      <View style={styles.loader}><ActivityIndicator size="large" color={ACCENT} /></View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Onboarding / top-up prompt */}
      <Modal visible={topUpOpen} transparent animationType="fade" onRequestClose={() => setTopUpOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 }}>
          <View style={{ backgroundColor: C.white, borderRadius: 20, padding: SP._20, width: "100%", maxWidth: 360, gap: SP._12 }}>
            <TouchableOpacity style={{ alignSelf: "flex-end" }} onPress={() => setTopUpOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={C.gray500} />
            </TouchableOpacity>
            <View style={{ alignItems: "center", gap: SP._8 }}>
              <View style={{ width: 56, height: 56, borderRadius: RADIUS.full, backgroundColor: ACCENT_BG, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="wallet-outline" size={26} color={ACCENT_D} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: C.gray900, textAlign: "center" }}>
                {activated ? "Top up to keep accepting" : `Activate ${branchLabel}`}
              </Text>
              <Text style={{ fontSize: 14, color: C.gray600, textAlign: "center", lineHeight: 20 }}>
                {activated
                  ? `${branchLabel}'s fee wallet is below the ₱100 minimum needed to accept a booking. Top up (minimum ₱100) to stay visible and keep receiving bookings.`
                  : `Onboarding requires a top-up of ₱1,000 to ${branchLabel}'s wallet to activate it, receive bookings, and become visible in the Marketplace.`}
              </Text>
            </View>
            <TouchableOpacity
              style={{ height: 50, borderRadius: RADIUS.md, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginTop: SP._4 }}
              // The fee wallet lives on the wallet tab, not settings — this sent
              // anyone acting on the prompt to the wrong screen. Mirrors the
              // washer dashboard, which routes to its fee-balance screen.
              onPress={() => { setTopUpOpen(false); router.push("/(tabs)/wallet"); }}
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
          <TouchableOpacity style={styles.avatarSm} onPress={() => router.push("/(tabs)/settings")} activeOpacity={0.8}>
            {selectedCard?.logoUrl ? (
              <Image source={{ uri: selectedCard.logoUrl }} style={styles.avatarSmImg} />
            ) : (
              <Text style={styles.avatarSmText}>{initials(businessName)}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => router.push("/(tabs)/settings")} activeOpacity={0.7}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.biz} numberOfLines={1}>{businessName}</Text>
              <Ionicons name="chevron-down" size={16} color={C.gray500} />
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              Laundromat{branches.length > 1 ? ` · ${branches.length} branches` : areaLabel ? ` · ${areaLabel}` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bell} onPress={() => router.push("/(tabs)/chat")}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.gray700} />
            {chatUnread ? <View style={styles.headerDot} /> : null}
          </TouchableOpacity>
          <NotificationBellButton />
        </View>

        <View style={styles.chipsRow}>
          {notVisible || catalogEmpty ? (
            <>
              <View style={[styles.chip, { backgroundColor: C.gray100 }]}>
                <View style={[styles.dot, { backgroundColor: C.gray400 }]} />
                <Text style={[styles.chipText, { color: C.gray600 }]}>NOT VISIBLE</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: C.error100 }]}>
                <Ionicons name="alert-circle-outline" size={13} color={C.error700} />
                <Text style={[styles.chipText, { color: C.error700 }]}>
                  {notVisible ? "INSUFFICIENT FUNDS" : "NO SERVICES YET"}
                </Text>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: isOnline ? ACCENT_BG : C.gray100 }]}
                onPress={() => effectiveBranchId && toggleOnline(effectiveBranchId)}
                activeOpacity={0.7}
              >
                <View style={[styles.dot, { backgroundColor: isOnline ? C.success500 : C.gray400 }]} />
                <Text style={[styles.chipText, { color: isOnline ? ACCENT_D : C.gray600 }]}>{isOnline ? "ONLINE" : "OFFLINE"}</Text>
              </TouchableOpacity>
              <View style={[styles.chip, { backgroundColor: isOnline ? C.brand50 : C.gray100 }]}>
                <Ionicons name="bicycle-outline" size={13} color={isOnline ? C.brand600 : C.gray500} />
                <Text style={[styles.chipText, { color: isOnline ? C.brand600 : C.gray600 }]}>{isOnline ? "ACCEPTING ORDERS" : "PAUSED"}</Text>
              </View>
            </>
          )}
        </View>

        {/* The wallet gate already raises a top-up modal; the catalog gate had
            no surface at all, so a merchant could be funded, online, and still
            invisible with nothing telling them why — same fix as the washer
            dashboard. */}
        {catalogEmpty && !notVisible ? (
          <TouchableOpacity
            style={styles.gateBanner}
            activeOpacity={0.8}
            onPress={() => router.push("/(tabs)/services")}
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
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Public profile — single card or a per-branch carousel */}
        {cards.length > 1 ? (
          <ProfileCarousel index={selectedIndex} onIndexChange={onSelectIndex} cardWidth={width - 2 * SP._16} accent={ACCENT}>
            {cards.map((c) => <React.Fragment key={c.branchId}>{renderCard(c)}</React.Fragment>)}
          </ProfileCarousel>
        ) : selectedCard ? (
          renderCard(selectedCard)
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="storefront-outline" size={40} color={C.gray200} />
            <Text style={styles.emptyTitle}>No branch yet</Text>
            <Text style={styles.emptySub}>Add a branch in Settings to start receiving bookings.</Text>
          </View>
        )}

        {/* Business overview */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.sectionTitle}>Your business today</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/(tabs)/sales" as never)}>
            <Text style={[styles.sectionLink, { color: ACCENT_D }]}>View all stats</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <StatTile icon="cash-outline" tint={C.success700} tintBg={C.success100} value={peso(stats.todayRevenue)} label="Today" small />
          <StatTile icon="bag-handle-outline" tint={C.brand500} tintBg={C.brand50} value={stats.todayOrders} label="Orders" />
          <StatTile icon="sync-outline" tint={C.warning700} tintBg={C.warning100} value={stats.activeOrders} label="In progress" />
          <StatTile icon="checkmark-done-outline" tint={PURPLE} tintBg={PURPLE_BG} value={stats.readyOrders} label="Ready" />
        </View>

        {/* Active orders */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active orders</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/online-orders" as never)}>
            <Text style={[styles.sectionLink, { color: ACCENT_D }]}>View all orders</Text>
          </TouchableOpacity>
        </View>

        {activeOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={40} color={C.gray200} />
            <Text style={styles.emptyTitle}>No active orders yet</Text>
            <Text style={styles.emptySub}>{`New marketplace bookings for ${branchLabel} appear here.`}</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {activeOrders.slice(0, 4).map((o, idx) => (
              <React.Fragment key={o._id}>
                {idx > 0 && <View style={styles.divider} />}
                <TouchableOpacity style={styles.orderRow} onPress={() => router.push("/(tabs)/online-orders" as never)} activeOpacity={0.7}>
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

  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: SP._16, paddingBottom: SP._12, gap: SP._10 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  avatarSm: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: ACCENT_BG, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarSmImg: { width: "100%", height: "100%" },
  avatarSmText: { fontSize: 14, fontWeight: "800", color: ACCENT_D },
  biz: { fontSize: 17, fontWeight: "800", color: C.gray900, flexShrink: 1 },
  sub: { fontSize: 12, color: C.gray500, marginTop: 1 },
  bell: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: C.gray50, alignItems: "center", justifyContent: "center" },
  headerDot: { position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: RADIUS.full, backgroundColor: C.error500, borderWidth: 1.5, borderColor: C.white },

  chipsRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: SP._10, borderRadius: RADIUS.full },
  dot: { width: 7, height: 7, borderRadius: RADIUS.full },
  chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  gateBanner: { flexDirection: "row", alignItems: "center", gap: SP._10, marginTop: SP._10, backgroundColor: C.warning100, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._10 },
  gateTitle: { fontSize: 13.5, fontWeight: "800", color: C.warning700 },
  gateBody: { fontSize: 12, color: C.warning700, marginTop: 1, lineHeight: 16 },

  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16, gap: SP._16 },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: C.gray900 },
  sectionLink: { fontSize: 13, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: SP._8 },

  listCard: { backgroundColor: C.white, borderRadius: 16 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  orderBadge: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: ACCENT_BG, alignItems: "center", justifyContent: "center" },
  orderBadgeText: { fontSize: 14, fontWeight: "700", color: ACCENT_D },
  orderName: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  orderMeta: { fontSize: 12, color: C.gray500, marginTop: 1, fontFamily: "monospace" },
  orderPill: { backgroundColor: ACCENT_BG, borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 4 },
  orderPillText: { fontSize: 11, fontWeight: "700", color: ACCENT_D },
  divider: { height: 1, backgroundColor: C.gray100, marginHorizontal: SP._14 },

  emptyCard: { backgroundColor: C.white, borderRadius: 16, padding: SP._24, alignItems: "center", gap: SP._8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.gray700 },
  emptySub: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 },
});
