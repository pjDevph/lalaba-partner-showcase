// src/components/CustomerPreviewBody.tsx
// The "View as customer" body, shared by app/(washer)/preview.tsx (the
// dashboard's read-only mirror of the live profile) and the store editor's
// preview modal (app/(washer)/store.tsx), which overlays unsaved local edits
// on top of the same server data. One rendering, so the two can't drift —
// they used to be two separate implementations that looked nothing alike.

import React, { useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Truck, ShieldCheck } from "lucide-react-native";
import { C, RADIUS, SP } from "../theme/tokens";
import type { MyProviderProfile, ProviderServiceItem } from "../services/graphql/discovery";

const TEAL = C.washer500;
const TEAL_D = C.washer700;
const TEAL_BG = C.washer100;

type TabKey = "overview" | "services" | "reviews" | "policies";
const TABS: readonly { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "reviews", label: "Reviews" },
  { key: "policies", label: "Policies" },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function firstName(name: string) { return name.trim().split(/\s+/)[0] || name; }
// Whole pesos — customers never see decimals or a separate platform fee.
function peso(centavos: number) { return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`; }
function priceUnit(pricingType: string) {
  const t = pricingType.toUpperCase();
  return t.includes("KG") || t.includes("KILO") ? "/kg" : t.includes("LOAD") ? "/load" : "";
}

/** override !== undefined wins, even when it's null/"" — that's how "the draft
 * removed this photo" or "the draft cleared the description" gets represented. */
function pick<T>(override: T | undefined, fallback: T): T {
  return override !== undefined ? override : fallback;
}

function InfoRow({ icon, iconNode, children }: Readonly<{ icon?: React.ComponentProps<typeof Ionicons>["name"]; iconNode?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SP._10, paddingVertical: SP._6 }}>
      {iconNode ?? (icon ? <Ionicons name={icon} size={18} color={TEAL_D} /> : null)}
      <Text style={{ flex: 1, fontSize: 15, color: C.gray800 }}>{children}</Text>
    </View>
  );
}

// Mirrors the customer app's PhotoStrip in app/provider/_tabs.tsx.
function PhotoStrip({ photos }: Readonly<{ photos: readonly string[] }>) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const usable = photos.filter((u) => !failed.includes(u));
  if (usable.length === 0) return null;
  return (
    <View style={{ gap: SP._8 }}>
      <Text style={{ fontSize: 16, fontWeight: "800", color: C.gray900 }}>Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP._8, paddingRight: SP._16 }}>
        {usable.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            onError={() => setFailed((f) => [...f, uri])}
            resizeMode="cover"
            style={{ width: 132, height: 99, borderRadius: 12, backgroundColor: C.gray100 }}
          />
        ))}
      </ScrollView>
      <Text style={{ fontSize: 12, color: C.gray500 }}>Photos are provided by the provider.</Text>
    </View>
  );
}

function ServiceRow({ s, showDescription }: Readonly<{ s: ProviderServiceItem; showDescription?: boolean }>) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: SP._10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ flex: 1, paddingRight: SP._8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray900 }}>{s.name}</Text>
          {s.approved ? (
            <View style={{ backgroundColor: C.success100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: C.success700, letterSpacing: 0.4 }}>APPROVED</Text>
            </View>
          ) : null}
        </View>
        {showDescription && s.description ? <Text style={{ fontSize: 12.5, color: C.gray500, marginTop: 2 }}>{s.description}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: C.gray900 }}>{peso(s.price)}</Text>
        <Text style={{ fontSize: 12, color: C.gray500 }}>{priceUnit(s.pricingType)}</Text>
      </View>
    </View>
  );
}

function PolicyRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SP._14, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <Text style={{ fontSize: 15, color: C.gray700 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: "800", color: C.gray900 }}>{value}</Text>
    </View>
  );
}

/** Fields the store editor may have unsaved local edits for — everything else
 * (avatar, ratings, policies, services) always comes straight from the server,
 * since nothing else on this screen lets her edit it. */
export interface CustomerPreviewOverrides {
  name?: string;
  coverPhotoUrl?: string | null;
  featuredPhotos?: string[];
  description?: string | null;
}

export function CustomerPreviewBody({
  profile,
  services,
  onBack,
  overrides,
  topInset = 0,
  bottomInset = 0,
}: Readonly<{
  profile: MyProviderProfile;
  services: ProviderServiceItem[];
  onBack: () => void;
  overrides?: CustomerPreviewOverrides;
  topInset?: number;
  bottomInset?: number;
}>) {
  const [tab, setTab] = useState<TabKey>("overview");

  const name = overrides?.name?.trim() ? overrides.name.trim() : profile.name;
  const coverPhotoUrl = pick(overrides?.coverPhotoUrl, profile.coverPhotoUrl);
  const featuredPhotos = pick(overrides?.featuredPhotos, profile.featuredPhotos ?? []);
  const description = pick(overrides?.description, profile.description);

  const rated = profile.ratingCount > 0;
  // Same signal the customer app derives from verificationBadges, so the
  // shield shown here always agrees with the one on the real profile.
  const verified = profile.verificationBadges.includes("VERIFIED_HOME_WASHER");
  const approved = services.filter((s) => s.approved);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      {/* Top bar */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8, paddingTop: topInset + SP._8, paddingBottom: SP._8, paddingHorizontal: SP._12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={C.gray900} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: "800", color: C.gray900 }}>Customer preview</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SP._24 }}>
        {/* Cover + avatar */}
        <View style={{ height: 96, backgroundColor: TEAL_BG }}>
          {coverPhotoUrl ? <Image source={{ uri: coverPhotoUrl }} style={{ width: "100%", height: "100%" }} /> : null}
        </View>
        <View style={{ paddingHorizontal: SP._16, marginTop: -32 }}>
          <View style={{ width: 72, height: 72, borderRadius: RADIUS.full, borderWidth: 3, borderColor: C.white, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {profile.logoUrl ? <Image source={{ uri: profile.logoUrl }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontSize: 24, fontWeight: "800", color: C.white }}>{initials(name)}</Text>}
          </View>

          {/* Type badge + verification shield — the customer sees BOTH states,
              so an unverified washer must see the unverified shield here too
              rather than an empty gap. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8, marginTop: SP._12 }}>
            <View style={{ backgroundColor: TEAL_BG, borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: TEAL_D, letterSpacing: 0.5 }}>HOME WASHER</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {verified ? <ShieldCheck size={16} color={C.success500} /> : <MaterialCommunityIcons name="shield-alert-outline" size={16} color={C.gray400} />}
              <Text style={{ fontSize: 12, fontWeight: "700", color: verified ? C.success700 : C.gray400 }}>
                {verified ? "Verified" : "Unverified"}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 24, fontWeight: "800", color: C.gray900, marginTop: SP._8 }}>{name}</Text>
          <Text style={{ fontSize: 14, color: C.gray600, marginTop: 2 }}>{profile.statusText}</Text>
          {!verified ? (
            <Text style={{ fontSize: 14, color: C.gray500, marginTop: 4, lineHeight: 20 }}>
              Lalaba hasn&apos;t completed its verification checks for this provider yet. They can still take bookings.
            </Text>
          ) : null}
          {rated ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Ionicons name="star" size={14} color={C.warning500} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray900 }}>{profile.ratingAverage.toFixed(1)}</Text>
              <Text style={{ fontSize: 14, color: C.gray500 }}>({profile.ratingCount} reviews)</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 14, color: C.gray500, marginTop: 2 }}>No reviews yet</Text>
          )}
        </View>

        {/* Tab strip */}
        <View style={{ flexDirection: "row", gap: SP._8, backgroundColor: C.gray50, borderRadius: RADIUS.full, padding: 4, marginHorizontal: SP._16, marginTop: SP._16 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, paddingVertical: SP._8, borderRadius: RADIUS.full, backgroundColor: active ? C.white : "transparent", alignItems: "center", ...(active ? { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } } : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: active ? "800" : "600", color: active ? C.gray900 : C.gray500 }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={{ paddingHorizontal: SP._16, marginTop: SP._16, gap: SP._12 }}>
          {tab === "overview" ? (
            <>
              {description ? (
                <Text style={{ fontSize: 15, color: C.gray700, lineHeight: 22 }}>{description}</Text>
              ) : null}
              <PhotoStrip photos={featuredPhotos} />
              {/* Customers only get this row when an area is actually set — the
                  old "your area" fallback showed a line they never see. */}
              {profile.areaLabel ? (
                <InfoRow icon="location-outline">Serving {profile.areaLabel} — general area only</InfoRow>
              ) : null}
              <InfoRow iconNode={<Truck size={18} color={TEAL_D} />}>Pickup and return only</InfoRow>
              <InfoRow icon="calendar-outline">Limited daily bookings</InfoRow>
              <View style={{ flexDirection: "row", gap: SP._10, backgroundColor: TEAL_BG, borderRadius: 14, padding: SP._12, marginTop: SP._4 }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={TEAL_D} />
                <Text style={{ flex: 1, fontSize: 13.5, color: C.gray700, lineHeight: 19 }}>
                  {firstName(name)}&apos;s exact address is private. It is shared with delivery staff only after your booking is accepted.
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: TEAL_D, marginTop: SP._4 }}>Why no exact address?</Text>
              {approved.length > 0 ? (
                <View style={{ marginTop: SP._8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._8 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: C.gray900 }}>Offered services</Text>
                    <TouchableOpacity onPress={() => setTab("services")} hitSlop={6}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: TEAL_D }}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  {approved.slice(0, 2).map((s) => <ServiceRow key={s.serviceRefId} s={s} />)}
                </View>
              ) : null}
            </>
          ) : null}

          {tab === "services" ? (
            approved.length > 0 ? (
              <>
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.gray900 }}>Lalaba-approved service catalog</Text>
                {approved.map((s) => <ServiceRow key={s.serviceRefId} s={s} showDescription />)}
                <Text style={{ fontSize: 13, color: C.gray500, marginTop: SP._8, lineHeight: 19 }}>
                  Services and billing units are approved by Lalaba. Prices are selected by {firstName(name)}.
                </Text>
              </>
            ) : <Text style={{ fontSize: 14, color: C.gray500 }}>No offered services yet — add them under Edit profile.</Text>
          ) : null}

          {tab === "reviews" ? (
            rated ? (
              <View style={{ gap: SP._8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
                  <Text style={{ fontSize: 32, fontWeight: "800", color: C.gray900 }}>{profile.ratingAverage.toFixed(1)}</Text>
                  <Text style={{ fontSize: 14, color: C.gray500 }}>{profile.ratingCount} review{profile.ratingCount === 1 ? "" : "s"}</Text>
                </View>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = profile.ratingHistogram.find((h) => h.star === star)?.count ?? 0;
                  const pct = profile.ratingCount > 0 ? (count / profile.ratingCount) * 100 : 0;
                  return (
                    <View key={star} style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
                      <Text style={{ width: 14, fontSize: 12, color: C.gray500 }}>{star}</Text>
                      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.gray100 }}>
                        <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: C.warning500 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={{ alignItems: "center", paddingVertical: SP._32, gap: SP._6 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: C.gray900 }}>No reviews yet</Text>
                <Text style={{ fontSize: 14, color: C.gray500, textAlign: "center" }}>Be the first to book and review this provider.</Text>
              </View>
            )
          ) : null}

          {tab === "policies" ? (
            <View>
              <PolicyRow label="Minimum order" value={profile.policies.minOrderKg != null ? `${profile.policies.minOrderKg} kg` : "No minimum"} />
              <PolicyRow label="Free batch delivery" value={profile.policies.freeBatchDelivery ? "Available" : "Not available"} />
              <PolicyRow label="Express cut-off" value={profile.policies.expressCutoff ?? "Not offered"} />
              <Text style={{ fontSize: 13.5, color: C.gray500, marginTop: SP._12, lineHeight: 20 }}>
                Payment is collected on delivery or via e-wallet outside the app. Cancellations and reschedules are subject to the provider&apos;s confirmation and pickup status.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Book CTA — 1:1 with the customer view (inert in preview). */}
      <View style={{ paddingHorizontal: SP._16, paddingTop: SP._8, paddingBottom: bottomInset + SP._8, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white }}>
        <View style={{ height: 52, borderRadius: RADIUS.lg, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: C.white }}>Book laundry service</Text>
        </View>
      </View>
    </View>
  );
}
