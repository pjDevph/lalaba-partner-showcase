// src/components/chat/ChatListParts.tsx
// Shared building blocks for the three provider chat lists (merchant, washer,
// courier) — previously each (tabs)/chat.tsx, (washer)/chat.tsx and
// (courier)/chat.tsx hand-rolled its own row/pin/formatting with only the
// accent color swapped. One row style, one pin banner, one filter-pill row —
// each screen just supplies its accent and data.

import React from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import type { Conversation } from "../../services/graphql/chat";

export type ChatAccent = { fg: string; bg: string; dark: string };

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function initials(name: string): string {
  const p = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Short, stable human order number derived from the Mongo id, matching the
 *  `#LB-XXXX` convention already used in the courier row and every thread. */
export function orderNo(id: string | null | undefined): string {
  return id ? `#LB-${id.slice(-4).toUpperCase()}` : "";
}

// ─── Conversation row ──────────────────────────────────────────────────────

export interface ConversationRowProps {
  conversation: Conversation;
  accent: ChatAccent;
  onPress: () => void;
  /** Courier threads are one-per-leg — show "Pickup"/"Return" ahead of the
   *  order number. Merchant/washer threads aren't leg-scoped. */
  showLeg?: boolean;
  style?: ViewStyle;
}

export function ConversationRow({ conversation, accent, onPress, showLeg, style }: Readonly<ConversationRowProps>) {
  const ended = conversation.ended;
  const unread = conversation.providerUnread > 0 && !ended;
  const legLabel = showLeg ? (conversation.legType === "RETURN" ? "Return" : "Pickup") : null;
  const sub = [legLabel, orderNo(conversation.orderId)].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: SP._12,
          backgroundColor: ended ? C.gray50 : C.white,
          borderWidth: 1,
          borderColor: C.gray200,
          borderRadius: 16,
          padding: SP._14,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: RADIUS.full,
          backgroundColor: ended ? C.gray100 : accent.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: ended ? C.gray400 : accent.dark }}>
          {initials(conversation.customerName)}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text
            style={{ fontSize: 15, fontWeight: unread ? "800" : "700", color: ended ? C.gray500 : C.gray900 }}
            numberOfLines={1}
          >
            {conversation.customerName}
          </Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>{timeAgo(conversation.lastMessageAt)}</Text>
        </View>

        {sub ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: ended ? C.gray400 : accent.dark }} numberOfLines={1}>
              {sub}
            </Text>
            {ended ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: RADIUS.full, backgroundColor: C.gray200 }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: C.gray600 }}>ENDED</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={{ fontSize: 13, color: ended ? C.gray400 : unread ? C.gray800 : C.gray500, marginTop: 2 }} numberOfLines={1}>
          {conversation.lastMessageText ?? "New conversation"}
        </Text>
      </View>

      {unread ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: RADIUS.full,
            backgroundColor: accent.fg,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.white }}>{conversation.providerUnread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Active-order pin ────────────────────────────────────────────────────────
// Pins the most recently active (not-ended, order-linked) conversation above
// the list — mirrors the customer app's tracking pin, but here "active" reads
// off the real `ended` flag already on every conversation rather than a
// fabricated ETA/status the provider apps don't have data for.

export function mostRecentActiveOrderConversation(conversations: Conversation[]): Conversation | null {
  const candidates = conversations.filter((c) => !c.ended && !!c.orderId);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, c) => {
    const a = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    const b = latest.updatedAt ? new Date(latest.updatedAt).getTime() : 0;
    return a > b ? c : latest;
  });
}

export function ActiveOrderPin({
  conversation,
  accent,
  onPress,
  legLabel,
}: Readonly<{ conversation: Conversation; accent: ChatAccent; onPress: () => void; legLabel?: string }>) {
  const title = [orderNo(conversation.orderId), legLabel].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SP._12,
        marginHorizontal: SP._16,
        marginTop: SP._8,
        marginBottom: SP._4,
        padding: SP._12,
        borderRadius: RADIUS.lg,
        backgroundColor: accent.bg,
        borderWidth: 1,
        borderColor: accent.bg,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: RADIUS.md,
          backgroundColor: C.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="receipt-outline" size={18} color={accent.dark} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: accent.dark, letterSpacing: 0.3 }}>
          ORDER {title} IN PROGRESS
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: C.gray900, marginTop: 1 }}>
          {conversation.customerName}: {conversation.lastMessageText ?? "New conversation"}
        </Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: "700", color: accent.dark }}>Open</Text>
    </Pressable>
  );
}

// ─── Filter pills ────────────────────────────────────────────────────────────

export type ChatFilter = "all" | "unread";

export function FilterPills({
  filter,
  onChange,
  unreadCount,
  accent,
}: Readonly<{ filter: ChatFilter; onChange: (f: ChatFilter) => void; unreadCount: number; accent: ChatAccent }>) {
  const items: { key: ChatFilter; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", count: unreadCount },
  ];
  return (
    <View style={{ flexDirection: "row", gap: SP._8, paddingHorizontal: SP._16, paddingVertical: SP._10 }}>
      {items.map(({ key, label, count }) => {
        const selected = filter === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SP._6,
              height: 32,
              paddingHorizontal: SP._12,
              borderRadius: RADIUS.full,
              backgroundColor: selected ? accent.fg : C.white,
              borderWidth: 1,
              borderColor: selected ? accent.fg : C.gray200,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? C.white : C.gray700 }}>{label}</Text>
            {typeof count === "number" && count > 0 ? (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 5,
                  borderRadius: RADIUS.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? "rgba(255,255,255,0.25)" : accent.bg,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: selected ? C.white : accent.dark }}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChatEmptyState({ title, body }: Readonly<{ title: string; body: string }>) {
  return (
    <View style={{ alignItems: "center", padding: SP._32, gap: SP._8 }}>
      <Ionicons name="chatbubbles-outline" size={44} color={C.gray200} />
      <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray700 }}>{title}</Text>
      <Text style={{ fontSize: 13, color: C.gray500, textAlign: "center" }}>{body}</Text>
    </View>
  );
}
