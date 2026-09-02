// src/screens/providerChat/ProviderMessageThreadScreen.tsx
// Provider chat thread — a washer's or merchant's view of one customer
// conversation (PROVIDER-kind, one thread per customer spanning orders,
// `orderId` always set here). Loads + polls every 4s so the customer's
// messages arrive; the provider replies from here. Own (PROVIDER) messages
// sit right in the role's accent color; the customer's sit left.
//
// Originally two near-duplicate files, app/(washer)/message-thread.tsx and
// app/(tabs)/message-thread.tsx, that differed only in accent color and route
// names. Extracted here following the same "one shared screen, thin per-role
// re-export" pattern already used for the courier-leg thread
// (src/screens/orderLeg/MessageThreadScreen.tsx) — see that file's
// taskRoute/chatRoute/backTo params for the convention this mirrors.
//
// Role (and therefore accent) is derived from the route group segment
// ((washer) vs (tabs)) rather than an explicit param, since both re-exports
// are pushed to from their own role's chat list with no room to inject one —
// matches how this screen is actually navigated to today.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errField } from "../../utils/userError";
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { notify } from "../../stores/notificationStore";
import { quickRepliesFor } from "../../data/providerQuickReplies";
import { pickChatImage } from "../../components/chat/pickChatImage";
import {
  gqlConversationMessages,
  gqlSendMessage,
  gqlUploadChatImage,
  type Message,
} from "../../services/graphql/chat";
import {
  gqlOnlineOrder,
  customerAddressLine,
  isOrderConcluded,
  type GqlOnlineOrder,
} from "../../services/graphql/onlineOrders";
import { gqlPingPresence, gqlGetPresence } from "../../services/graphql/presence";
import { STATUS_LABEL } from "../../stores/onlineOrdersStore";
import { usePoll } from "../../hooks/usePoll";

const POLL_MS = 4000;
const ORDER_POLL_MS = 8000;
const PRESENCE_POLL_MS = 25000;

type Role = "washer" | "merchant";

interface Accent {
  main: string;
  bg: string;
  dark: string;
  chatRoute: string;
}

const ACCENTS: Record<Role, Accent> = {
  washer: { main: C.washer500, bg: C.washer100, dark: C.washer700, chatRoute: "/(washer)/chat" },
  merchant: { main: C.brand500, bg: C.brand50, dark: C.brand700, chatRoute: "/(tabs)/chat" },
};

function orderNo(id: string): string {
  return `LB-${id.slice(-4).toUpperCase()}`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}
function minuteKey(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : String(Math.floor(d.getTime() / 60_000));
}

export default function ProviderMessageThreadScreen() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const role: Role = segments[0] === "(washer)" ? "washer" : "merchant";
  const accent = ACCENTS[role];

  const { id, name, orderId, backTo } = useLocalSearchParams<{
    id: string; name?: string; orderId?: string; backTo?: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [order, setOrder] = useState<GqlOnlineOrder | null>(null);
  const [counterpartyOnline, setCounterpartyOnline] = useState(false);
  const listRef = useRef<FlatList<{ message: Message; showTime: boolean }>>(null);

  // Order context for the header — who + which order this chat is about.
  // Polled (not fetch-once): the order can conclude while this thread is
  // already open, and a stale copy here would leave the status pill wrong and
  // the composer unlocked past the point the server has already closed the
  // thread (sendMessage/uploadChatImage would start rejecting silently-ish).
  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    try { setOrder(await gqlOnlineOrder(orderId)); } catch { /* transient */ }
  }, [orderId]);
  usePoll(loadOrder, ORDER_POLL_MS, !!orderId);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setMessages(await gqlConversationMessages(id));
    } catch { /* transient */ }
    finally { setLoading(false); }
  }, [id]);

  usePoll(load, POLL_MS);

  // Real presence: heartbeat for ourselves + poll the customer's status.
  // Not fabricated — no default-on state, the dot only shows once the BE
  // confirms the customer pinged within the last 45s.
  const customerUid = order?.customer.uid ?? null;
  const pollPresence = useCallback(async () => {
    try { await gqlPingPresence(); } catch { /* transient */ }
    if (!customerUid) return;
    try {
      const status = await gqlGetPresence(customerUid);
      setCounterpartyOnline(status.isOnline);
    } catch { /* transient */ }
  }, [customerUid]);
  usePoll(pollPresence, PRESENCE_POLL_MS, !!customerUid);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);
  useEffect(() => { if (messages.length) scrollToEnd(); }, [messages.length, scrollToEnd]);

  // Precompute whether each message shows its timestamp (last of a same-sender,
  // same-minute run).
  const rows = useMemo(
    () =>
      messages.map((m, i) => {
        const next = messages[i + 1];
        const showTime = !next || next.senderRole !== m.senderRole || minuteKey(next.createdAt) !== minuteKey(m.createdAt);
        return { message: m, showTime };
      }),
    [messages],
  );

  // Quick replies re-roll on mount and whenever the order status genuinely
  // changes — not on every 4s poll tick.
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  useEffect(() => {
    setQuickReplies(quickRepliesFor({ orderStatus: order?.status }));
  }, [order?.status]);

  // Mirrors the BE's own gate (chat.service.ts's isThreadEnded/
  // CONCLUDED_ORDER_STATUSES) — a PROVIDER thread closes once its order
  // concludes, same as sendMessage/uploadChatImage already enforce
  // server-side. Locks the composer here too instead of only finding out via
  // a rejected send.
  const ended = !!order && isOrderConcluded(order.status);
  const canSend = text.trim().length > 0 && !sending && !uploading && !ended;

  const send = async (body: { text?: string; imageKey?: string }, restore?: () => void) => {
    if (!id || sending || ended) return;
    setSending(true);
    try {
      const msg = await gqlSendMessage(id, body);
      setMessages((prev) => [...prev, msg]);
      scrollToEnd();
    } catch (e: unknown) {
      if (restore) restore();
      else notify.error("Message not sent", errField(e, "message") ?? "Try again.");
    } finally {
      setSending(false);
    }
  };

  const onSend = () => {
    const body = text.trim();
    if (!body || uploading) return;
    setText("");
    void send({ text: body }, () => setText(body));
  };

  const onAttach = async () => {
    if (!id || uploading || sending || ended) return;
    const picked = await pickChatImage();
    if (!picked) return;
    setUploading(true);
    try {
      const imageKey = await gqlUploadChatImage(id, picked.base64, picked.mimeType);
      await send({ imageKey });
    } catch (e: unknown) {
      notify.error("Photo not sent", errField(e, "message") ?? "Try again.");
    } finally {
      setUploading(false);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(backTo || accent.chatRoute));

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Top bar — who you're talking with */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: SP._10, paddingTop: insets.top + SP._8, paddingBottom: SP._12, paddingHorizontal: SP._12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
        <TouchableOpacity onPress={goBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={C.gray900} />
        </TouchableOpacity>
        <View style={{ width: 36, height: 36 }}>
          <View style={{ width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: accent.bg, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: accent.dark }}>{initials(order?.customer.displayName ?? name ?? "?")}</Text>
          </View>
          {counterpartyOnline ? (
            <View style={{
              position: "absolute", bottom: -1, right: -1,
              width: 11, height: 11, borderRadius: RADIUS.full,
              backgroundColor: C.success500, borderWidth: 2, borderColor: C.white,
            }} />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: C.gray900 }} numberOfLines={1}>{order?.customer.displayName ?? name ?? "Customer"}</Text>
          <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={1}>Customer</Text>
        </View>
      </View>

      {/* Order-context card — which order this chat is about */}
      {order ? (
        <View style={{ marginHorizontal: SP._16, marginTop: SP._12, backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, padding: SP._12, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray900, fontFamily: "monospace" }}>#{orderNo(order._id)}</Text>
            <View style={{ backgroundColor: accent.bg, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: accent.dark }}>{STATUS_LABEL[order.status] ?? order.status}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: C.gray600 }} numberOfLines={1}>
            {order.serviceLines.map((l) => l.serviceName).join(" · ")}
          </Text>
          <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={1}>{customerAddressLine(order)}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading && messages.length === 0 ? (
          <ActivityIndicator color={accent.main} style={{ marginTop: SP._32 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.message._id}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: SP._16, gap: SP._6, flexGrow: 1, justifyContent: "flex-end" }}
            onContentSizeChange={scrollToEnd}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              // The logged-in user is the provider (role WASHER/MERCHANT) — any
              // non-customer, non-system, non-support message is "mine" (right,
              // accent). SUPPORT is a third party (admin panel takeover), never
              // the provider herself.
              const mine =
                item.message.senderRole !== "CUSTOMER" &&
                item.message.senderRole !== "SYSTEM" &&
                item.message.senderRole !== "SUPPORT";
              return (
                <View style={{ maxWidth: "80%", alignSelf: mine ? "flex-end" : "flex-start", alignItems: mine ? "flex-end" : "flex-start", gap: 2 }}>
                  <View style={{
                    backgroundColor: mine ? accent.main : C.white,
                    borderWidth: mine ? 0 : 1, borderColor: C.gray200,
                    borderRadius: RADIUS.lg,
                    borderBottomRightRadius: mine ? RADIUS.xs : RADIUS.lg,
                    borderBottomLeftRadius: mine ? RADIUS.lg : RADIUS.xs,
                    padding: item.message.imageUrl ? 4 : undefined,
                    paddingHorizontal: item.message.imageUrl ? undefined : SP._12,
                    paddingVertical: item.message.imageUrl ? undefined : SP._8,
                  }}>
                    {item.message.imageUrl ? (
                      <Image
                        source={{ uri: item.message.imageUrl }}
                        style={{ width: 220, height: 220, borderRadius: RADIUS.md, backgroundColor: C.gray100 }}
                        resizeMode="cover"
                      />
                    ) : null}
                    {item.message.text ? (
                      <Text style={{
                        fontSize: 15, lineHeight: 20, color: mine ? C.white : C.gray900,
                        marginTop: item.message.imageUrl ? 6 : 0,
                        marginHorizontal: item.message.imageUrl ? 6 : 0,
                      }}>
                        {item.message.text}
                      </Text>
                    ) : null}
                  </View>
                  {item.showTime ? (
                    <Text style={{ fontSize: 11, color: C.gray400, paddingHorizontal: 4 }}>{timeLabel(item.message.createdAt)}</Text>
                  ) : null}
                </View>
              );
            }}
          />
        )}

        {/* Input row — replaced by a notice once the order is concluded */}
        {ended ? (
          <View style={{ paddingHorizontal: SP._16, paddingTop: SP._12, paddingBottom: SP._12 + insets.bottom, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white, flexDirection: "row", alignItems: "center", gap: SP._8 }}>
            <Ionicons name="lock-closed-outline" size={16} color={C.gray400} />
            <Text style={{ flex: 1, fontSize: 13, color: C.gray500 }}>
              This conversation has ended — the order is complete.
            </Text>
          </View>
        ) : (
        <>
        {/* One-tap canned replies */}
        {quickReplies.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: SP._8, paddingHorizontal: SP._16, paddingVertical: SP._8 }}
            style={{ flexGrow: 0, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100 }}
          >
            {quickReplies.map((reply) => (
              <TouchableOpacity
                key={reply}
                onPress={() => void send({ text: reply })}
                disabled={sending || uploading}
                activeOpacity={0.8}
                style={{ paddingHorizontal: SP._12, paddingVertical: SP._8, borderRadius: RADIUS.full, backgroundColor: accent.bg, borderWidth: 1, borderColor: accent.bg, opacity: sending || uploading ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: accent.dark }}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {/* Input row */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SP._8, paddingHorizontal: SP._16, paddingTop: SP._8, paddingBottom: SP._8 + insets.bottom, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white }}>
          <TouchableOpacity
            onPress={onAttach}
            disabled={uploading || sending}
            style={{ width: 44, height: 44, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center", opacity: uploading || sending ? 0.5 : 1 }}
          >
            {uploading ? <ActivityIndicator color={accent.main} size="small" /> : <Ionicons name="camera-outline" size={24} color={accent.main} />}
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Reply to customer"
            placeholderTextColor={C.gray400}
            multiline
            style={{ flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: C.gray50, borderRadius: RADIUS.lg, paddingHorizontal: SP._14, paddingTop: SP._12, paddingBottom: SP._12, fontSize: 15, color: C.gray900 }}
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            style={{ width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: canSend ? accent.main : C.gray300, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="send" size={18} color={C.white} />
          </TouchableOpacity>
        </View>
        </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
