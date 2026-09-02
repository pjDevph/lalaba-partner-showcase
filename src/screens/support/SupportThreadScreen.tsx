// src/screens/support/SupportThreadScreen.tsx
// The washer/merchant's own support ticket thread — one shared screen, thin
// per-role re-export (same pattern as ProviderMessageThreadScreen). Polls
// every 4s so agent replies surface without a manual refresh. Header states
// what the report is about, its ticket number, and who's handling it —
// "Waiting for an agent" until one picks it up, then their name — plus a way
// to end the session herself (distinct from an agent resolving it).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { useAuthStore } from "../../stores/authStore";
import { notify } from "../../stores/notificationStore";
import { showConfirm } from "../../lib/dialog";
import { pickChatImage } from "../../components/chat/pickChatImage";
import {
  gqlMyOpenSupportTicket,
  gqlMySupportTicketNotes,
  gqlAddMySupportTicketNote,
  gqlUploadMySupportTicketImage,
  gqlMarkMySupportTicketRead,
  gqlCloseMySupportTicket,
  type SupportTicket,
  type SupportTicketNote,
} from "../../services/graphql/supportTickets";

const POLL_MS = 4000;

const CATEGORY_LABELS: Record<string, string> = {
  ORDER_LATE: "Order is late",
  PAYMENT_DISPUTE: "Payment issue",
  WALLET_TOPUP: "Wallet top-up issue",
  CUSTOMER_CONDUCT: "Problem with a customer",
  COURIER_CONDUCT: "Problem with a courier",
  ACCOUNT_ACCESS: "Account access",
  VERIFICATION: "Verification",
  APP_BUG: "Something's broken",
  OTHER: "Something else",
};

function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export default function SupportThreadScreen() {
  const segments = useSegments();
  const backTo = segments[0] === "(washer)" ? "/(washer)/chat" : "/(tabs)/chat";
  const insets = useSafeAreaInsets();
  const myUid = useAuthStore((s) => s.user?.uid ?? "");

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [notes, setNotes] = useState<SupportTicketNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<FlatList<{ note: SupportTicketNote; showTime: boolean }>>(null);

  const load = useCallback(async () => {
    try {
      const t = await gqlMyOpenSupportTicket();
      setTicket(t);
      if (t) setNotes(await gqlMySupportTicketNotes(t._id));
    } catch {
      /* transient — next poll retries */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (ticket) void gqlMarkMySupportTicketRead(ticket._id);
  }, [ticket?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () =>
      notes.map((n, i) => {
        const next = notes[i + 1];
        return { note: n, showTime: !next || next.authorUid !== n.authorUid };
      }),
    [notes],
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);
  useEffect(() => {
    if (rows.length > 0) scrollToEnd();
  }, [rows.length, scrollToEnd]);

  const isClosed = ticket?.status === "RESOLVED" || ticket?.status === "CLOSED";
  const canSend = text.trim().length > 0 && !sending && !!ticket && !isClosed;
  const waitingForAgent = !isClosed && notes.length > 0 && notes.every((n) => n.authorUid === myUid);

  async function onSend() {
    if (!ticket) return;
    const body = text.trim();
    if (!body) return;
    setText("");
    setSending(true);
    try {
      const note = await gqlAddMySupportTicketNote(ticket._id, body);
      setNotes((prev) => [...prev, note]);
    } catch {
      notify.error("Couldn't send", "Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function onAttach() {
    if (!ticket || uploading) return;
    const picked = await pickChatImage();
    if (!picked) return;
    setUploading(true);
    try {
      const key = await gqlUploadMySupportTicketImage(ticket._id, picked.base64, picked.mimeType);
      const note = await gqlAddMySupportTicketNote(ticket._id, "", key);
      setNotes((prev) => [...prev, note]);
    } catch {
      notify.error("Couldn't send photo", "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function onEndSession() {
    if (!ticket) return;
    showConfirm(
      "End this session?",
      "You can always start a new report from Help & Support if you need us again.",
      () => {
        void gqlCloseMySupportTicket(ticket._id)
          .then((updated) => setTicket(updated))
          .catch(() => notify.error("Couldn't end this session", "Please try again."));
      },
      { confirmLabel: "End session", destructive: true },
    );
  }

  const agentLine = ticket?.assignedToName ? `Talking to ${ticket.assignedToName}` : "Waiting for an agent";

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SP._8,
          paddingTop: insets.top + SP._8,
          paddingBottom: SP._12,
          paddingHorizontal: SP._12,
          backgroundColor: C.white,
          borderBottomWidth: 1,
          borderBottomColor: C.gray200,
        }}
      >
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo as never))} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={C.gray900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: C.gray900 }}>Lalaba Support</Text>
        </View>
      </View>

      {ticket ? (
        <View style={{ paddingHorizontal: SP._16, paddingVertical: SP._10, borderBottomWidth: 1, borderBottomColor: C.gray200, backgroundColor: C.gray50 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray900 }} numberOfLines={1}>
            {CATEGORY_LABELS[ticket.category] ?? ticket.subject}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
            <Text style={{ fontSize: 12, color: C.gray500, flex: 1 }} numberOfLines={1}>
              {ticket.ticketNumber} · {agentLine}
            </Text>
            {!isClosed ? (
              <TouchableOpacity onPress={onEndSession} hitSlop={8}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.error700 ?? "#B91C1C" }}>End session</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading && notes.length === 0 ? (
          <ActivityIndicator color={C.warning700 ?? "#B45309"} style={{ marginTop: SP._32 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.note._id}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: SP._16, gap: SP._6, flexGrow: 1, justifyContent: "flex-end" }}
            onContentSizeChange={scrollToEnd}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              waitingForAgent ? (
                <View style={{ alignItems: "center", marginTop: SP._6 }}>
                  <View
                    style={{
                      maxWidth: "86%",
                      backgroundColor: C.gray100,
                      borderRadius: RADIUS.full,
                      paddingHorizontal: SP._12,
                      paddingVertical: SP._6,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: C.gray500, textAlign: "center" }}>
                      Waiting for an agent to reply…
                    </Text>
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 14, color: C.gray500, textAlign: "center" }}>
                  {ticket?.body ?? "Loading your report…"}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.note.authorUid === myUid;
              return (
                <View style={{ maxWidth: "80%", alignSelf: mine ? "flex-end" : "flex-start", alignItems: mine ? "flex-end" : "flex-start", gap: 2 }}>
                  <View
                    style={{
                      backgroundColor: mine ? C.brand500 : C.white,
                      borderWidth: mine ? 0 : 1,
                      borderColor: C.gray200,
                      borderRadius: RADIUS.lg,
                      borderBottomRightRadius: mine ? RADIUS.xs : RADIUS.lg,
                      borderBottomLeftRadius: mine ? RADIUS.lg : RADIUS.xs,
                      padding: item.note.imageUrl ? 4 : undefined,
                      paddingHorizontal: item.note.imageUrl ? undefined : SP._12,
                      paddingVertical: item.note.imageUrl ? undefined : SP._8,
                    }}
                  >
                    {item.note.imageUrl ? (
                      <Image
                        source={{ uri: item.note.imageUrl }}
                        style={{ width: 220, height: 220, borderRadius: RADIUS.md, backgroundColor: C.gray100 }}
                        resizeMode="cover"
                      />
                    ) : null}
                    {item.note.body ? (
                      <Text
                        style={{
                          fontSize: 15,
                          lineHeight: 20,
                          color: mine ? C.white : C.gray900,
                          marginTop: item.note.imageUrl ? 6 : 0,
                          marginHorizontal: item.note.imageUrl ? 6 : 0,
                        }}
                      >
                        {item.note.body}
                      </Text>
                    ) : null}
                  </View>
                  {item.showTime ? (
                    <Text style={{ fontSize: 11, color: C.gray400, paddingHorizontal: 4 }}>{timeLabel(item.note.createdAt)}</Text>
                  ) : null}
                </View>
              );
            }}
          />
        )}

        {isClosed ? (
          <View style={{ paddingHorizontal: SP._16, paddingTop: SP._12, paddingBottom: SP._12 + insets.bottom, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white, alignItems: "center", gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray700 }}>This session has ended</Text>
            <Text style={{ fontSize: 12, color: C.gray400, textAlign: "center" }}>
              Need help with something else? Start a new report from Help &amp; Support.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SP._8, paddingHorizontal: SP._16, paddingTop: SP._8, paddingBottom: SP._8 + insets.bottom, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white }}>
            <TouchableOpacity
              onPress={() => void onAttach()}
              disabled={uploading || sending}
              style={{ width: 44, height: 44, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center", opacity: uploading || sending ? 0.5 : 1 }}
            >
              {uploading ? <ActivityIndicator color={C.brand500} size="small" /> : <Ionicons name="camera-outline" size={24} color={C.brand500} />}
            </TouchableOpacity>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message"
              placeholderTextColor={C.gray400}
              multiline
              style={{ flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: C.gray50, borderRadius: RADIUS.lg, paddingHorizontal: SP._14, paddingTop: SP._12, paddingBottom: SP._12, fontSize: 15, color: C.gray900 }}
            />
            <TouchableOpacity
              onPress={() => void onSend()}
              disabled={!canSend}
              style={{ width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: canSend ? C.brand500 : C.gray300, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="send" size={18} color={C.white} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
