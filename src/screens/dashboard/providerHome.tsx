// src/screens/dashboard/providerHome.tsx
// Shared presentational pieces for the "provider home" dashboard design used by
// both the home-washer (app/(washer)/dashboard.tsx) and the merchant
// (app/(tabs)/dashboard.tsx). Extracting them keeps the two dashboards visually
// identical and lets the merchant show a per-branch profile CAROUSEL.
//
// Accent colours are parameterized (washer teal vs merchant brand-blue) so the
// same components render in either stack.

import React, { useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { VerifiedBadge } from "../../components/verification/VerifiedBadge";
import { C, RADIUS, SP, SHADOW } from "../../theme/tokens";
import { Truck } from "lucide-react-native";
import { humanizeCategory } from "../../lib/categoryLabel";

// ─── Helpers ────────────────────────────────────────────────────────────────
export function initials(name: string): string {
  const p = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "LB";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function peso(n: number | null | undefined): string {
  if (n == null) return "₱—";
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

/**
 * Centavos → "₱220". Use this for anything that arrives from the backend.
 *
 * `peso()` above takes PESOS, while the customer app's identically-named
 * helper takes CENTAVOS — so handing a `*Centavos` field to `peso()` renders
 * it a hundred times too large, and it looks like a plausible price rather
 * than an obvious fault. "From ₱220/kg" shipped as "From ₱22,000/kg" exactly
 * this way. The field names carry the unit; so should the formatter.
 */
export function pesoFromCentavos(n: number | null | undefined): string {
  if (n == null) return "₱—";
  return peso(Math.round(n) / 100);
}

// ─── ProgressRing ─────────────────────────────────────────────────────────────
// Small SVG progress ring, optionally with the % in the centre (default —
// Profile Complete wants this). `showPct={false}` renders just the arc, for
// callers that show their own value/label text separately below it instead
// (e.g. the "Bookings today" stat tile's "1/3").
export function ProgressRing({
  pct, accent, accentDark, size = 52, stroke = 5, showPct = true,
}: Readonly<{ pct: number; accent: string; accentDark: string; size?: number; stroke?: number; showPct?: boolean }>) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.gray200} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={accent} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {showPct ? <Text style={{ fontSize: 13, fontWeight: "800", color: accentDark }}>{Math.round(pct)}%</Text> : null}
    </View>
  );
}

// ─── StarRow ──────────────────────────────────────────────────────────────────
// Five stars with fractional fill (4.8 → four full + a fifth at 80%). Empty grey
// outline when `rating` is null.
export function StarRow({ rating, size = 12 }: Readonly<{ rating: number | null; size?: number }>) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const frac = rating == null ? 0 : Math.max(0, Math.min(1, rating - i));
        return (
          <View key={i} style={{ width: size, height: size }}>
            <Ionicons name="star-outline" size={size} color={C.gray300} style={{ position: "absolute" }} />
            {frac > 0 ? (
              <View style={{ position: "absolute", left: 0, top: 0, width: size * frac, height: size, overflow: "hidden" }}>
                <Ionicons name="star" size={size} color={C.warning500} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ─── StatTile ───────────────────────────────────────────────────────────────
export function StatTile({
  icon, tint, tintBg, value, label, small, dense, ring,
}: Readonly<{
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string; tintBg: string;
  value: string | number; label: string;
  small?: boolean;
  /**
   * Same stacked layout, tightened: smaller icon, value and padding. Shaves
   * ~20px per tile so the content below the stats row sits higher, without
   * changing the tile's shape or reading like a different component.
   */
  dense?: boolean;
  /**
   * 0-100: swaps the icon+value pair for a ProgressRing (percentage drawn
   * inside the ring itself, same accent as `tint`) — for a stat that's
   * naturally "X of a ceiling" (e.g. today's bookings against the daily cap)
   * rather than a bare count. `value`/`label` still render below/beside it
   * as before; only the icon badge is replaced, so the tile keeps the exact
   * same footprint and alignment as its neighbors.
   */
  ring?: number;
}>) {
  if (dense) {
    return (
      <View style={[s.statTile, s.statTileDense, SHADOW.sm]}>
        {ring != null ? (
          <ProgressRing pct={ring} accent={tint} accentDark={tint} size={28} stroke={3} showPct={false} />
        ) : (
          <View style={[s.statIcon, s.statIconDense, { backgroundColor: tintBg }]}>
            <Ionicons name={icon} size={14} color={tint} />
          </View>
        )}
        <Text style={[s.statValueDense, small && { fontSize: 14 }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={[s.statLabel, s.statLabelDense]} numberOfLines={2}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={[s.statTile, SHADOW.sm]}>
      {ring != null ? (
        <ProgressRing pct={ring} accent={tint} accentDark={tint} size={34} stroke={4} showPct={false} />
      ) : (
        <View style={[s.statIcon, { backgroundColor: tintBg }]}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
      )}
      <Text style={[s.statValue, small && { fontSize: 15 }]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

// ─── BranchProfileCard ────────────────────────────────────────────────────────
// The rich, customer-facing public card for one branch/provider. Rendered from
// the exact card the BE builds for discovery, so it can't drift from what
// customers see. Used single (1 branch) or inside ProfileCarousel (2+ branches).
export interface ProfileCardData {
  branchId: string;
  name: string;
  initials: string;
  areaLabel: string | null;
  statusText: string;
  ratingAverage: number;
  ratingCount: number;
  serviceCategories: string[];
  coverPhotoUrl: string | null;
  logoUrl: string | null;
  isVerified: boolean;
  /** "From ₱X/kg" — the first thing a customer compares. */
  priceFromCentavos?: number | null;
  priceUnit?: string;
}

export function BranchProfileCard({
  card, completionPct, operator, badgeLabel, badgeGlyph: BadgeGlyph,
  accent, accentDark, accentBg, onEdit, onPreview,
  editLabel = "Edit profile", editIcon = "create-outline",
  previewLabel = "View as customer", previewIcon = "eye-outline",
}: Readonly<{
  card: ProfileCardData;
  completionPct: number;
  operator?: string | null;
  badgeLabel: string;   // may contain "\n"
  /** The badge's vector glyph — a lucide icon component, matching the
   *  customer card. Passed as a component rather than an Ionicons NAME so both
   *  apps can draw the same mark from the same icon set. */
  badgeGlyph: React.ComponentType<{ size: number; color: string }>;
  accent: string;
  accentDark: string;
  accentBg: string;
  onEdit: () => void;
  onPreview: () => void;
  editLabel?: string;
  editIcon?: React.ComponentProps<typeof Ionicons>["name"];
  previewLabel?: string;
  previewIcon?: React.ComponentProps<typeof Ionicons>["name"];
}>) {
  const rating = card.ratingCount > 0 ? card.ratingAverage : null;
  const closed = /^closed/i.test(card.statusText);
  const cats = card.serviceCategories ?? [];
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Your public profile</Text>
          <Text style={s.cardSub}>This is what customers see</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <ProgressRing pct={completionPct} accent={accent} accentDark={accentDark} />
          <Text style={s.ringLabel}>Profile{"\n"}complete</Text>
        </View>
      </View>

      <View style={s.previewRow}>
        <View style={s.cover}>
          {card.coverPhotoUrl ? (
            <Image source={{ uri: card.coverPhotoUrl }} style={s.coverImg} />
          ) : (
            <View style={[s.coverImg, { backgroundColor: accentBg }]} />
          )}
          {/* Brand blue, matched 1:1 with the customer card.
              brand700 rather than brand500: the label is white, and white on
              #00AEEF is about 2.2:1 — below any readable threshold, which is
              why this repo's own palette note reserves the vivid blue for
              fills and uses the deep blue for anything that must be READ. */}
          <View style={[s.coverBadge, { backgroundColor: C.brand700 }]}>
            <BadgeGlyph size={11} color={C.white} />
            <Text style={s.coverBadgeText}>{badgeLabel}</Text>
          </View>
          <View style={[s.coverAvatar, { backgroundColor: accentBg }]}>
            {card.logoUrl ? (
              <Image source={{ uri: card.logoUrl }} style={s.coverAvatarImg} />
            ) : (
              <Text style={[s.coverAvatarText, { color: accentDark }]}>{card.initials || initials(card.name)}</Text>
            )}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._8 }}>
            <Text style={[s.pName, { flex: 1 }]} numberOfLines={1}>{card.name}</Text>
            <VerifiedBadge verified={card.isVerified} />
          </View>
          {operator ? <Text style={s.pOperator} numberOfLines={1}>Operated by: {operator}</Text> : null}
          {card.areaLabel ? (
            <View style={s.pLine}>
              <Ionicons name="location-outline" size={13} color={C.gray500} />
              <Text style={s.pLineText} numberOfLines={1}>{card.areaLabel}</Text>
            </View>
          ) : null}
          {rating != null ? (
            <View style={s.pLine}>
              <StarRow rating={rating} />
              <Text style={s.pRating}>{rating.toFixed(1)}</Text>
              <Text style={s.pLineText}>· {card.ratingCount} reviews</Text>
            </View>
          ) : (
            <View style={s.pLine}>
              <StarRow rating={null} />
              <Text style={s.pLineText}>Not rated yet</Text>
            </View>
          )}
          <View style={s.pLine}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: closed ? C.gray400 : C.success500 }} />
            <Text style={s.pLineText}>{card.statusText}</Text>
          </View>
          <View style={s.pLine}>
            <Truck size={13} color={C.brand600} />
            <Text style={s.pLineText}>Pickup & delivery available</Text>
          </View>
          {/* The headline number on the customer's card, and it was missing
              here entirely — `priceFromCentavos` was already being fetched by
              myProviderCards and thrown away when the card data was built. A
              provider could not see the one figure customers compare them on. */}
          {typeof card.priceFromCentavos === "number" ? (
            <Text style={s.pPrice}>
              From <Text style={s.pPriceValue}>{pesoFromCentavos(card.priceFromCentavos)}</Text>
              {card.priceUnit ? `/${card.priceUnit}` : ""}
            </Text>
          ) : null}
        </View>
      </View>

      {cats.length > 0 ? (
        <View style={s.svcRow}>
          {cats.slice(0, 3).map((cat, i) => (
            <View key={i} style={s.svcChip}><Text style={s.svcChipText} numberOfLines={1}>{humanizeCategory(cat)}</Text></View>
          ))}
          {cats.length > 3 ? (
            <View style={s.svcChip}><Text style={s.svcChipText}>+{cats.length - 3}</Text></View>
          ) : null}
        </View>
      ) : null}

      <View style={s.actionsRow}>
        <TouchableOpacity style={s.btnOutline} onPress={onEdit} activeOpacity={0.8}>
          <Ionicons name={editIcon} size={16} color={C.gray800} />
          <Text style={s.btnOutlineText}>{editLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btnPrimary, { backgroundColor: C.brand500 }]} onPress={onPreview} activeOpacity={0.85}>
          <Ionicons name={previewIcon} size={16} color={C.white} />
          <Text style={s.btnPrimaryText}>{previewLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── ProfileCarousel ───────────────────────────────────────────────────────────
// Paged horizontal scroller with page dots. Each slide is `cardWidth` wide; the
// active page is reported via onIndexChange on momentum settle.
export function ProfileCarousel({
  index, onIndexChange, cardWidth, gap = SP._12, accent, children,
}: Readonly<{
  index: number;
  onIndexChange: (i: number) => void;
  cardWidth: number;
  gap?: number;
  accent: string;
  children: React.ReactNode;
}>) {
  const scrollRef = useRef<ScrollView>(null);
  const slides = React.Children.toArray(children);
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + gap));
    if (i !== index) onIndexChange(Math.max(0, Math.min(slides.length - 1, i)));
  };
  return (
    <View style={{ gap: SP._10 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + gap}
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ gap }}
      >
        {slides.map((child, i) => (
          <View key={i} style={{ width: cardWidth }}>{child}</View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
        {slides.map((_, i) => (
          <View key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? accent : C.gray300 }} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Public profile card
  card: { backgroundColor: C.white, borderRadius: 20, ...SHADOW.sm, padding: SP._16, gap: SP._14 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SP._12 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: C.gray900 },
  cardSub: { fontSize: 13, color: C.gray500, marginTop: 1 },
  ringLabel: { fontSize: 10, color: C.gray500, textAlign: "center", marginTop: 2, lineHeight: 12 },

  previewRow: { flexDirection: "row", gap: SP._12, alignItems: "center" },
  cover: { width: 116, height: 132, borderRadius: RADIUS.lg, backgroundColor: C.gray100, overflow: "hidden" },
  coverImg: { width: "100%", height: "100%" },
  coverBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: RADIUS.md, paddingHorizontal: 7, paddingVertical: 4 },
  coverBadgeText: { fontSize: 10, fontWeight: "800", color: C.white, lineHeight: 12 },
  coverAvatar: { position: "absolute", bottom: 6, left: 6, width: 40, height: 40, borderRadius: RADIUS.md, borderWidth: 2, borderColor: C.white, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverAvatarImg: { width: "100%", height: "100%" },
  coverAvatarText: { fontSize: 13, fontWeight: "800" },

  pName: { fontSize: 17, fontWeight: "800", color: C.gray900 },
  pOperator: { fontSize: 12.5, color: C.gray500 },
  pLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  pLineText: { fontSize: 12.5, color: C.gray600, flexShrink: 1 },
  pRating: { fontSize: 12.5, fontWeight: "700", color: C.gray800 },

  svcRow: { flexDirection: "row", flexWrap: "wrap", gap: SP._8 },
  pPrice: { fontSize: 13, color: C.gray600, marginTop: 2 },
  pPriceValue: { fontWeight: "800", color: C.gray900 },
  svcChip: { backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200, borderRadius: RADIUS.full, paddingHorizontal: SP._12, paddingVertical: 6 },
  svcChipText: { fontSize: 12, fontWeight: "600", color: C.gray700 },

  actionsRow: { flexDirection: "row", gap: SP._10 },
  btnOutline: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray300, backgroundColor: C.white },
  btnOutlineText: { fontSize: 14, fontWeight: "700", color: C.gray800 },
  btnPrimary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: RADIUS.md },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: C.white },

  // Stats
  // `statsRow` is a flex row with no `alignItems`, so it defaults to "stretch"
  // — every tile already matches the tallest sibling's height. Without
  // `justifyContent`, though, each tile top-packs its own content, so a
  // shorter one (e.g. the ring variant, which has less content than an
  // icon+value pair) ends up with its label sitting higher than its
  // neighbors'. "space-between" pins icon/ring to the top and the label to
  // the bottom of every tile uniformly, regardless of what's above it.
  statTile: { flex: 1, backgroundColor: C.white, borderRadius: 16, padding: SP._10, alignItems: "center", justifyContent: "space-between", gap: 5 },
  statIcon: { width: 34, height: 34, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: C.gray900 },
  statLabel: { fontSize: 10.5, color: C.gray500, textAlign: "center" },
  statTileDense: { paddingVertical: SP._8, gap: 3 },
  statIconDense: { width: 28, height: 28 },
  statValueDense: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  statLabelDense: { lineHeight: 13 },
});
