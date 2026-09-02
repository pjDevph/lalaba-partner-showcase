// app/(washer)/chat.tsx
// Chat tab — the washer's customer conversations, from the real BE chat module
// (myConversations). Tapping a row opens the thread. Polls so new customer
// messages + unread counts stay current. An active-order pin surfaces the
// most recently active order-linked thread; filter pills narrow to unread.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { C, SP } from "../../src/theme/tokens";
import { gqlMyConversations, type Conversation } from "../../src/services/graphql/chat";
import { usePoll } from "../../src/hooks/usePoll";
import { useAuthStore } from "../../src/stores/authStore";
import {
  ActiveOrderPin,
  ChatEmptyState,
  ConversationRow,
  FilterPills,
  mostRecentActiveOrderConversation,
  type ChatFilter,
} from "../../src/components/chat/ChatListParts";
import { SupportRow } from "../../src/components/chat/SupportRow";
import {
  gqlMyOpenSupportTicket,
  gqlMySupportTicketNotes,
  type SupportTicket,
  type SupportTicketNote,
} from "../../src/services/graphql/supportTickets";

const ACCENT = { fg: C.washer500, bg: C.washer100, dark: C.washer700 };
const POLL_MS = 8000;

export default function WasherChat() {
  const insets = useSafeAreaInsets();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [supportTicket, setSupportTicket] = useState<SupportTicket | null>(null);
  const [supportNotes, setSupportNotes] = useState<SupportTicketNote[]>([]);
  const myUid = useAuthStore((s) => s.user?.uid ?? "");

  const load = useCallback(async () => {
    try {
      setConvos(await gqlMyConversations());
    } catch { /* transient */ }
    finally { setLoading(false); }
  }, []);

  const loadSupport = useCallback(async () => {
    try {
      const t = await gqlMyOpenSupportTicket();
      setSupportTicket(t);
      setSupportNotes(t ? await gqlMySupportTicketNotes(t._id) : []);
    } catch { /* transient */ }
  }, []);

  usePoll(load, POLL_MS);
  usePoll(loadSupport, POLL_MS);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openThread = (c: Conversation) =>
    router.push({ pathname: "/(washer)/message-thread", params: { id: c._id, name: c.customerName, orderId: c.orderId ?? "" } });

  const pinned = useMemo(() => mostRecentActiveOrderConversation(convos), [convos]);
  const unreadCount = useMemo(() => convos.filter((c) => c.providerUnread > 0 && !c.ended).length, [convos]);
  const visible = useMemo(
    () => (filter === "unread" ? convos.filter((c) => c.providerUnread > 0 && !c.ended) : convos),
    [convos, filter],
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ paddingTop: insets.top + SP._10, paddingBottom: SP._12, paddingHorizontal: SP._16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: C.gray900 }}>Messages</Text>
        <Text style={{ fontSize: 13, color: C.gray500 }}>Chats with your customers</Text>
      </View>

      {/* Only once a report actually exists — Help & Support's "Report a
          problem" card is the entry point. A permanently-pinned row with
          nothing behind it read as clutter, not a real conversation. */}
      {supportTicket ? (
        <View style={{ paddingHorizontal: SP._16, paddingTop: SP._12 }}>
          <SupportRow
            ticket={supportTicket}
            notes={supportNotes}
            myUid={myUid}
            onPress={() => router.push("/(washer)/support-thread")}
          />
        </View>
      ) : null}

      {pinned ? <ActiveOrderPin conversation={pinned} accent={ACCENT} onPress={() => openThread(pinned)} /> : null}

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
              body={filter === "unread" ? "You're all caught up." : "Customer chats about your orders appear here."}
            />
          }
          renderItem={({ item }) => (
            <ConversationRow conversation={item} accent={ACCENT} onPress={() => openThread(item)} />
          )}
        />
      )}
    </View>
  );
}
