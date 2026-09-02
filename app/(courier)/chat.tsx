// app/(courier)/chat.tsx
// Courier Chat — the rider's conversations with customers, one per order leg
// they're assigned to, from the real BE chat module (myConversations returns
// this courier's COURIER threads). Tapping a row opens the thread. Polls so new
// customer messages + unread counts stay current. No mock data. An
// active-order pin surfaces the most recently active leg; filter pills
// narrow to unread.

import React, { useCallback, useMemo, useState } from "react";
import { View, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { router } from "expo-router";
import { C, SP } from "../../src/theme/tokens";
import { gqlMyConversations, type Conversation } from "../../src/services/graphql/chat";
import { CourierHeader } from "../../src/components/CourierHeader";
import { usePoll } from "../../src/hooks/usePoll";
import {
  ActiveOrderPin,
  ChatEmptyState,
  ConversationRow,
  FilterPills,
  mostRecentActiveOrderConversation,
  type ChatFilter,
} from "../../src/components/chat/ChatListParts";

const ACCENT = { fg: C.courier500, bg: C.courier100, dark: C.courier700 };
const POLL_MS = 8000;

function legLabelOf(c: Conversation): string {
  return c.legType === "RETURN" ? "Return" : "Pickup";
}

export default function CourierChat() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>("all");

  const load = useCallback(async () => {
    try {
      setConvos(await gqlMyConversations());
    } catch { /* transient */ }
    finally { setLoading(false); }
  }, []);

  usePoll(load, POLL_MS);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openThread = (c: Conversation) =>
    router.push({
      pathname: "/(courier)/message-thread",
      params: { id: c._id, name: c.customerName, orderId: c.orderId ?? "", leg: c.legType ?? "", from: "chat" },
    });

  const pinned = useMemo(() => mostRecentActiveOrderConversation(convos), [convos]);
  const unreadCount = useMemo(() => convos.filter((c) => c.providerUnread > 0 && !c.ended).length, [convos]);
  const visible = useMemo(
    () => (filter === "unread" ? convos.filter((c) => c.providerUnread > 0 && !c.ended) : convos),
    [convos, filter],
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      <CourierHeader title="Chat" subtitle="Customers on your active deliveries" />

      {pinned ? (
        <ActiveOrderPin conversation={pinned} accent={ACCENT} legLabel={legLabelOf(pinned)} onPress={() => openThread(pinned)} />
      ) : null}

      {convos.length > 0 ? (
        <FilterPills filter={filter} onChange={setFilter} unreadCount={unreadCount} accent={ACCENT} />
      ) : null}

      {loading && convos.length === 0 ? (
        <ActivityIndicator color={ACCENT.fg} style={{ marginTop: SP._32 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(c) => c._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT.fg} />}
          contentContainerStyle={{ padding: SP._16, gap: SP._8 }}
          ListEmptyComponent={
            <ChatEmptyState
              title={filter === "unread" ? "No unread messages" : "No messages yet"}
              body={filter === "unread" ? "You're all caught up." : "Customer chats for your assigned deliveries appear here."}
            />
          }
          renderItem={({ item }) => (
            <ConversationRow conversation={item} accent={ACCENT} showLeg onPress={() => openThread(item)} />
          )}
        />
      )}
    </View>
  );
}
