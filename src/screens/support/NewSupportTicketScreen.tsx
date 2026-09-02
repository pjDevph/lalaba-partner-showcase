// src/screens/support/NewSupportTicketScreen.tsx
// "Report a problem" — category + subject/body, creates the ticket then hands
// off to the thread screen. Includes CUSTOMER_CONDUCT (a partner reporting a
// customer) — the one category that doesn't exist on the customer app's own
// picker, since it's asymmetric: only partners file this kind of report.

import React, { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { notify } from "../../stores/notificationStore";
import {
  gqlCreateMySupportTicket,
  type TicketCategory,
} from "../../services/graphql/supportTickets";

const CATEGORIES: readonly { key: TicketCategory; label: string; description: string }[] = [
  { key: "ORDER_LATE", label: "Order is late", description: "A pickup or delivery is overdue" },
  { key: "PAYMENT_DISPUTE", label: "Payment issue", description: "A charge, top-up, or payout problem" },
  { key: "WALLET_TOPUP", label: "Wallet top-up issue", description: "A top-up didn't credit your fee wallet" },
  { key: "CUSTOMER_CONDUCT", label: "Problem with a customer", description: "Rude behavior, no-show, or similar" },
  { key: "COURIER_CONDUCT", label: "Problem with a courier", description: "The rider assigned to your pickup/delivery" },
  { key: "ACCOUNT_ACCESS", label: "Account access", description: "Trouble signing in or account settings" },
  { key: "VERIFICATION", label: "Verification", description: "A question about your verification status" },
  { key: "APP_BUG", label: "Something's broken in the app", description: "A bug, crash, or thing that doesn't work" },
  { key: "OTHER", label: "Something else", description: "" },
];

export default function NewSupportTicketScreen() {
  const segments = useSegments();
  const backTo = segments[0] === "(washer)" ? "/(washer)/chat" : "/(tabs)/chat";
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const canSubmit = category != null && subject.trim().length > 0 && body.trim().length > 0 && !sending;

  async function onSubmit() {
    if (!category) return;
    setSending(true);
    try {
      const ticket = await gqlCreateMySupportTicket({ subject: subject.trim(), body: body.trim(), category });
      router.replace((segments[0] === "(washer)" ? "/(washer)/support-thread" : "/(tabs)/support-thread") as never);
      void ticket; // thread screen re-fetches myOpenSupportTicket itself
    } catch {
      notify.error("Couldn't send your report", "Please try again.");
    } finally {
      setSending(false);
    }
  }

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
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.gray900 }}>Report a problem</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SP._16, gap: SP._20, paddingBottom: SP._32 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: SP._8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray900 }}>What's this about?</Text>
          <View style={{ gap: SP._8 }}>
            {CATEGORIES.map((c) => {
              const selected = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SP._12,
                    padding: SP._14,
                    borderRadius: RADIUS.lg,
                    borderWidth: 1.5,
                    borderColor: selected ? C.brand500 : C.gray200,
                    backgroundColor: selected ? C.brand50 : C.white,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: selected ? C.brand500 : C.gray300,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand500 }} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray900 }}>{c.label}</Text>
                    {c.description ? <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>{c.description}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ gap: SP._8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray900 }}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="A short summary"
            placeholderTextColor={C.gray400}
            maxLength={200}
            style={{ backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._14, paddingVertical: SP._12, fontSize: 15, color: C.gray900 }}
          />
        </View>

        <View style={{ gap: SP._8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray900 }}>Tell us what happened</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="The more detail, the faster we can help."
            // Matches TEXT_LIMITS.LONG on the server, so the limit is felt
            // while typing rather than as a rejection after Send.
            maxLength={5000}
            placeholderTextColor={C.gray400}
            multiline
            style={{ minHeight: 120, backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._14, paddingVertical: SP._12, fontSize: 15, color: C.gray900, textAlignVertical: "top" }}
          />
        </View>

        <TouchableOpacity
          onPress={() => void onSubmit()}
          disabled={!canSubmit}
          style={{ height: 48, borderRadius: RADIUS.lg, backgroundColor: canSubmit ? C.brand500 : C.gray300, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.white }}>{sending ? "Sending…" : "Send report"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
