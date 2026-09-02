// src/screens/providerChat/ProviderConversationsScreen.tsx
// The provider side of customer messaging, shared by the merchant owner and
// their staff.
//
// `basePath` is what makes it shareable: the two callers live in different
// route groups, and a screen that hardcodes /(tabs) would send a staff member
// into the OWNER's stack to read a message. The backend scopes the list itself
// — an owner sees every branch, a staff member only the branch their approved
// device pins them to — so this component asks for "my conversations" and
// renders whatever comes back.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, SP } from "../../theme/tokens";
import { gqlMyConversations, type Conversation } from "../../services/graphql/chat";
import { usePoll } from "../../hooks/usePoll";
import { useAuthStore } from "../../stores/authStore";
import {
  ActiveOrderPin,
  ChatEmptyState,
  ConversationRow,
  FilterPills,
  mostRecentActiveOrderConversation,
  type ChatFilter,
} from "../../components/chat/ChatListParts";
import { SupportRow } from "../../components/chat/SupportRow";
import { StaffNotificationBell } from "../../components/staff/StaffNotificationBell";
import {
  gqlMyOpenSupportTicket,
  gqlMySupportTicketNotes,
  type SupportTicket,
  type SupportTicketNote,
} from "../../services/graphql/supportTickets";

const ACCENT = { fg: C.brand500, bg: C.brand50, dark: C.brand700 };
const POLL_MS = 8000;

export function ProviderConversationsScreen({
  basePath,
}: Readonly<{ basePath: "/(tabs)" | "/(staff)" }>) {
  // Platform support is the account owner's channel — it is about billing,
  // verification and the business itself, none of which a staff member acts on.
  // The staff stack has no support route at all, so rendering the row there
  // would be a link to nowhere.
  const showSupport = basePath === "/(tabs)";
  const insets = useSafeAreaInsets();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [supportTicket, setSupportTicket] = useState<SupportTicket | null>(null);
  const [supportNotes, setSupportNotes] = useState<SupportTicketNote[]>([]);
  const myUid = useAuthStore((s) => s.user?.uid ?? "");

  const load = useCallback(async () => {
    try { setConvos(await gqlMyConversations()); } catch { /* transient */ }
    finally { setLoading(false); }
  }, []);

  // Same poll cadence, own tick — SupportRow needs the ticket's notes too
  // (for its unread badge), not just the ticket itself.
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
    router.push({ pathname: `${basePath}/message-thread` as never, params: { id: c._id, name: c.customerName, orderId: c.orderId ?? "" } });

  const pinned = useMemo(() => mostRecentActiveOrderConversation(convos), [convos]);
  const unreadCount = useMemo(() => convos.filter((c) => c.providerUnread > 0 && !c.ended).length, [convos]);
  const visible = useMemo(
    () => (filter === "unread" ? convos.filter((c) => c.providerUnread > 0 && !c.ended) : convos),
    [convos, filter],
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8, paddingTop: insets.top + SP._8, paddingBottom: SP._12, paddingHorizontal: SP._12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
        {/* For staff this IS a tab — there is no parent to return to, so no
            chevron. router.canGoBack() cannot answer that question: inside a
            tab navigator it is true simply because another tab was visited
            first, which is why the chevron survived the last attempt and went
            to POS. The route group is the honest signal. The owner reaches
            this screen from their dashboard, so theirs keeps a back button. */}
        {basePath === "/(tabs)" ? (
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={C.gray900} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.gray900 }}>Messages</Text>
          <Text style={{ fontSize: 13, color: C.gray500 }}>Chats with your customers</Text>
        </View>
        {/* Staff reach notifications from whatever screen they are on; the
            owner has a dashboard bell instead. */}
        {basePath === "/(staff)" ? <StaffNotificationBell /> : null}
      </View>

      {/* Only once a report actually exists — Help & Support's "Report a
          problem" card is the entry point. A permanently-pinned row with
          nothing behind it read as clutter, not a real conversation. */}
      {showSupport && supportTicket ? (
        <View style={{ paddingHorizontal: SP._16, paddingTop: SP._12 }}>
          <SupportRow
            ticket={supportTicket}
            notes={supportNotes}
            myUid={myUid}
            onPress={() => router.push(`${basePath}/support-thread` as never)}
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
