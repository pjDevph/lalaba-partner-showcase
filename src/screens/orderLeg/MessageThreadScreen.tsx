// src/screens/orderLeg/MessageThreadScreen.tsx
// Courier-style chat thread — the rider's view of one customer conversation
// for a specific order leg. Loads + polls every 4s so the customer's messages
// arrive; the rider replies from here. Own (COURIER) messages sit right in
// indigo; the customer's sit left.
//
// Originally app/(courier)/message-thread.tsx — moved here so a provider
// self-running their own pickup/return leg gets the identical chat UI a real
// courier uses. See TaskDetailScreen.tsx for why this pairs with it.
//
// `taskRoute`/`chatRoute`/`backTo` are optional params forwarded from
// TaskDetailScreen; omitted, they default to the original `(courier)` paths.

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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { useAuthStore } from "../../stores/authStore";
import { notify } from "../../stores/notificationStore";
import { quickRepliesFor } from "../../data/courierQuickReplies";
import { pickChatImage } from "../../components/chat/pickChatImage";
import {
  gqlConversationMessages,
  gqlSendMessage,
  gqlUploadChatImage,
  type Message,
} from "../../services/graphql/chat";
import {
  gqlOnlineOrder,
  courierLegLive,
  customerAddressLine,
  type GqlOnlineOrder,
} from "../../services/graphql/onlineOrders";
import { gqlPingPresence, gqlGetPresence } from "../../services/graphql/presence";
import { STATUS_LABEL } from "../../stores/onlineOrdersStore";
import { usePoll } from "../../hooks/usePoll";

const DEFAULT_TASK_ROUTE = "/(courier)/task-detail";
const DEFAULT_CHAT_ROUTE = "/(courier)/message-thread";

const INDIGO = C.courier500;
const INDIGO_BG = C.courier100;
const INDIGO_D = C.courier700;
const POLL_MS = 4000;
const ORDER_POLL_MS = 8000;
const PRESENCE_POLL_MS = 25000;

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

export default function MessageThreadScreen() {
  const insets = useSafeAreaInsets();
  const { id, name, orderId, leg, from, taskRoute, chatRoute, backTo } = useLocalSearchParams<{
    id: string; name?: string; orderId?: string; leg?: string; from?: string;
    taskRoute?: string; chatRoute?: string; backTo?: string;
  }>();
  const taskRouteResolved = taskRoute || DEFAULT_TASK_ROUTE;
  const chatRouteResolved = chatRoute || DEFAULT_CHAT_ROUTE;

  // message-thread is a hidden TAB (href: null), so router.back() unwinds to the
  // tab navigator's initial route (Tasks) rather than to whatever opened it —
  // canGoBack() is true, so the old fallback never ran. Return to the real
  // origin: the task we came from, else the Chat list.
  const goBack = () => {
    if (from === "task-detail" && orderId && leg) {
      router.replace({
        pathname: taskRouteResolved,
        params: { id: orderId, leg, taskRoute: taskRouteResolved, chatRoute: chatRouteResolved, backTo },
      });
      return;
    }
    router.replace(backTo || "/(courier)/chat");
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [order, setOrder] = useState<GqlOnlineOrder | null>(null);
  const [counterpartyOnline, setCounterpartyOnline] = useState(false);
  const myUid = useAuthStore((st) => st.user?.uid) ?? "";
  const listRef = useRef<FlatList<{ message: Message; showTime: boolean }>>(null);

  const legLabel = leg === "RETURN" ? "Return delivery" : "Pickup";

  // Order context for the header — who + which order this chat is about.
  // Polled (not fetch-once): the leg's `ended` state below is derived from
  // this order, and a stale copy would leave the composer unlocked past the
  // point the leg actually handed over.
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

  // Real presence: heartbeat for ourselves + poll the customer's status. No
  // fabricated/default-on state — the dot only shows once the BE confirms the
  // customer pinged within the last 45s.
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

  // Quick replies re-roll on mount and whenever the leg genuinely changes —
  // not on every 4s poll tick.
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  useEffect(() => {
    setQuickReplies(quickRepliesFor(leg as "PICKUP" | "RETURN" | undefined));
  }, [leg]);

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

  // The rider's access to a leg thread expires when that leg is handed over
  // (the BE rejects reads and sends past that point). Derived from the order
  // rather than from a failed request, so the composer locks the moment the
  // status flips instead of after the rider types a message and loses it.
  const ended = !!order && !!myUid && courierLegLive(order, myUid) === null;
  const canSend = text.trim().length > 0 && !sending && !uploading && !ended;

  // Shared by the composer, the quick-reply chips, and the attach flow.
  // `restore` puts the text back in the box on failure — right for something
  // the rider typed, wrong for a canned line or a photo they never typed, so
  // those surface an error toast instead.
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
    if (!body) return;
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

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Top bar — who you're talking with */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: SP._10, paddingTop: insets.top + SP._8, paddingBottom: SP._12, paddingHorizontal: SP._12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
        <TouchableOpacity onPress={goBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={C.gray900} />
        </TouchableOpacity>
        <View style={{ width: 36, height: 36 }}>
          <View style={{ width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: INDIGO_BG, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: INDIGO_D }}>{initials(order?.customer.displayName ?? name ?? "?")}</Text>
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
          <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={1}>Customer · {legLabel}</Text>
        </View>
      </View>

      {/* Order-context card — which order this chat is about */}
      {order ? (
        <View style={{ marginHorizontal: SP._16, marginTop: SP._12, backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, padding: SP._12, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray900, fontFamily: "monospace" }}>#{orderNo(order._id)}</Text>
            <View style={{ backgroundColor: INDIGO_BG, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: INDIGO_D }}>{STATUS_LABEL[order.status] ?? order.status}</Text>
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
          <ActivityIndicator color={INDIGO} style={{ marginTop: SP._32 }} />
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
              // The logged-in user is the rider (role COURIER) — any non-customer,
              // non-system, non-support message is "mine" (right, indigo). SUPPORT
              // is a third party (admin panel takeover), never the rider herself.
              const mine =
                item.message.senderRole !== "CUSTOMER" &&
                item.message.senderRole !== "SYSTEM" &&
                item.message.senderRole !== "SUPPORT";
              return (
                <View style={{ maxWidth: "80%", alignSelf: mine ? "flex-end" : "flex-start", alignItems: mine ? "flex-end" : "flex-start", gap: 2 }}>
                  <View style={{
                    backgroundColor: mine ? INDIGO : C.white,
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

        {/* Input row — replaced by a notice once the leg is complete */}
        {ended ? (
          <View style={{ paddingHorizontal: SP._16, paddingTop: SP._12, paddingBottom: SP._12 + insets.bottom, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white, flexDirection: "row", alignItems: "center", gap: SP._8 }}>
            <Ionicons name="lock-closed-outline" size={16} color={C.gray400} />
            <Text style={{ flex: 1, fontSize: 13, color: C.gray500 }}>
              This conversation has ended — the delivery is complete.
            </Text>
          </View>
        ) : (
        <>
        {/* One-tap canned replies — sends immediately rather than filling the
            box, since the whole point is not having to type while riding. */}
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
              style={{ paddingHorizontal: SP._12, paddingVertical: SP._8, borderRadius: RADIUS.full, backgroundColor: C.courier100, borderWidth: 1, borderColor: C.courier200, opacity: sending || uploading ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: INDIGO }}>{reply}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SP._8, paddingHorizontal: SP._16, paddingTop: SP._8, paddingBottom: SP._8 + insets.bottom, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white }}>
          <TouchableOpacity
            onPress={onAttach}
            disabled={uploading || sending}
            style={{ width: 44, height: 44, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center", opacity: uploading || sending ? 0.5 : 1 }}
          >
            {uploading ? <ActivityIndicator color={INDIGO} size="small" /> : <Ionicons name="camera-outline" size={24} color={INDIGO} />}
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
            style={{ width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: canSend ? INDIGO : C.gray300, alignItems: "center", justifyContent: "center" }}
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
