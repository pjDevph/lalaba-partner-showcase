// src/components/chat/SupportRow.tsx
// Pinned "Lalaba Support" row for the merchant/washer Chat tab — deliberately
// its own component, not ConversationRow fed a fake Conversation: a support
// ticket is a different shape (SupportTicket + notes, not a Conversation),
// and this reads amber/warning rather than the brand accent so it's never
// mistaken for a customer thread.

import React from "react";
import { Pressable, Text, View } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";
import { I } from "../../screens/settings/shared";
import { timeAgo } from "./ChatListParts";
import type { SupportTicket, SupportTicketNote } from "../../services/graphql/supportTickets";

export interface SupportRowProps {
  ticket: SupportTicket | null;
  notes: SupportTicketNote[];
  myUid: string;
  onPress: () => void;
}

export function SupportRow({ ticket, notes, myUid, onPress }: Readonly<SupportRowProps>) {
  const lastNote = notes.length > 0 ? notes[notes.length - 1] : null;
  const readAt = ticket?.requesterLastReadAt ? new Date(ticket.requesterLastReadAt).getTime() : 0;
  const unreadCount = notes.filter((n) => n.authorUid !== myUid && new Date(n.createdAt).getTime() > readAt).length;
  const hasUnread = unreadCount > 0;
  const preview = lastNote?.body?.trim() || ticket?.subject?.trim() || "Tell us what went wrong";

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SP._12,
        backgroundColor: C.white,
        borderWidth: 1,
        borderColor: C.gray200,
        borderRadius: 16,
        padding: SP._14,
        marginBottom: SP._8,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: RADIUS.full,
          backgroundColor: C.warning100 ?? "#FEF3C7",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <I.LifeBuoy c={C.warning700 ?? "#B45309"} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 15, fontWeight: hasUnread ? "800" : "700", color: C.gray900 }} numberOfLines={1}>
            Lalaba Support
          </Text>
          <Text style={{ fontSize: 11, color: C.gray400 }}>
            {timeAgo(lastNote?.createdAt ?? ticket?.updatedAt ?? null)}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: hasUnread ? C.gray800 : C.gray500, marginTop: 2 }} numberOfLines={1}>
          {preview}
        </Text>
      </View>

      {hasUnread ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: RADIUS.full,
            backgroundColor: C.warning700 ?? "#B45309",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.white }}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
