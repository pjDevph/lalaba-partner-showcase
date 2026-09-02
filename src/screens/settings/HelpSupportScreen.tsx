// Help & Support screen (FAQ + contact rows) — extracted from settings.tsx.
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, SP } from "../../theme/tokens";
import { HeroHeader } from "../../components/ui";
import { showAlert } from "../../lib/dialog";
import { useAuthStore } from "../../stores/authStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { I } from "./shared";
import { S } from "./styles";

const SUPPORT = {
  email:     "support@lalaba.app",
  phone:     "+639000000000",
  messenger: "https://m.me/lalabaapp",
} as const;

export interface HelpTopic { q: string; a: string }

// Default (merchant / POS) topics. Roles whose day-to-day is different — the
// courier stack, for one — pass their own via the `topics` prop rather than
// showing riders how to add staff or run a walk-in order.
const HELP_TOPICS: readonly HelpTopic[] = [
  { q: "How to create a walk-in order", a: "Open the POS tab (the center button), tap “New Walk-in Order”, add the customer’s services, then proceed to payment to print or send the claim ticket." },
  { q: "How to claim an order",         a: "From the Dashboard tap “Claim Order” (or POS → Claim). Enter the claim code or search the customer, confirm the items, then mark it as claimed." },
  { q: "How to manage services",        a: "Go to Settings → Services. You can add, edit, set pricing, and archive services. Archived services stay hidden but can be restored anytime." },
  { q: "How to add staff",              a: "Go to Settings → Staff Management → Add. Pick a role (Manager / Cashier / Staff), choose branch access, then share the generated PIN with them." },
  { q: "How to switch branches",        a: "Tap the branch chip at the top of the Dashboard, or use the branch picker when the app asks which branch to act on." },
  { q: "How to refund or cancel an order", a: "Open the order from the POS queue, tap it to view details, then choose Cancel or Refund. This requires the matching permission on your role." },
];

function HelpContactRow({
  icon, title, sub, onPress,
}: Readonly<{ icon: React.ReactNode; title: string; sub: string; onPress: () => void }>) {
  return (
    <TouchableOpacity style={S.helpContactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[S.hubIconCircle, { backgroundColor: C.brand50 }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={S.helpContactTitle}>{title}</Text>
        <Text style={S.helpContactSub}>{sub}</Text>
      </View>
      <I.Chevron c={C.gray400} />
    </TouchableOpacity>
  );
}

export function HelpSupportScreenInline({
  onBack,
  topics: topicSource = HELP_TOPICS,
  onReportProblem,
}: Readonly<{
  onBack: () => void;
  topics?: readonly HelpTopic[];
  /**
   * Shows a real "Report a problem" card (creates a support ticket, chat-
   * style) above the mailto "Report an Issue" fallback — but ONLY when a
   * caller passes this. Deliberately opt-in per route rather than a role
   * check inside this shared component: staff and courier callers omit it
   * on purpose (this feature is merchant/washer-only), and a prop that has
   * to be explicitly wired can't go quietly true for a route nobody intended.
   */
  onReportProblem?: () => void;
}>) {
  const user           = useAuthStore((s) => s.user);
  const role           = useAuthStore((s) => s.role);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const merchant       = useMerchantStore((s) => s.profile);
  const branches       = useMerchantStore((s) => s.branches);
  const activeBranch   = branches.find((b) => b.id === activeBranchId) ?? null;

  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const needle = q.trim().toLowerCase();
  const topics = needle === ""
    ? topicSource
    : topicSource.filter((t) => t.q.toLowerCase().includes(needle) || t.a.toLowerCase().includes(needle));

  const openURL = async (url: string, fallbackMsg: string) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) { showAlert("Not available", fallbackMsg); return; }
      await Linking.openURL(url);
    } catch {
      showAlert("Not available", fallbackMsg);
    }
  };

  const diagnostics =
    `\n\n———\nApp: Lalaba Merchant v4.2.1\n` +
    `Platform: ${Platform.OS} ${String(Platform.Version)}\n` +
    `Account: ${user?.email ?? "—"}\n` +
    `Role: ${role ?? "—"}\n` +
    `Branch: ${activeBranch?.name ?? "—"}\n` +
    `Business: ${merchant?.businessName ?? "—"}`;

  const handleReport = () => {
    const subject = encodeURIComponent("Lalaba Merchant — Issue Report");
    const body = encodeURIComponent(
      `Describe the problem here:\n\n\n(Please attach screenshots if possible.)${diagnostics}`
    );
    openURL(`mailto:${SUPPORT.email}?subject=${subject}&body=${body}`, `Email us at ${SUPPORT.email}`);
  };

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <HeroHeader compact noWave title="Help & Support" subtitle="FAQs and ways to reach us" onBack={onBack} />
      <ScrollView
        style={{ flex: 1, backgroundColor: C.gray100, maxWidth: 880, width: "100%", alignSelf: "center" }}
        contentContainerStyle={{ padding: SP._16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Quick help search ── */}
        <Text style={S.subGroupLabel}>QUICK HELP</Text>
        <View style={S.helpSearchBox}>
          <I.Search c={C.gray400} />
          <TextInput
            style={S.helpSearchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search help articles..."
            placeholderTextColor={C.gray400}
            autoCapitalize="none"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")} hitSlop={8} activeOpacity={0.7}>
              <I.X c={C.gray400} s={16} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Topics (accordion) ── */}
        <View style={[S.subCard, { marginTop: SP._8 }]}>
          {topics.length === 0 ? (
            <Text style={S.helpEmpty}>No articles match “{q}”. Try contacting support below.</Text>
          ) : (
            topics.map((t, idx) => {
              const open = expanded === idx;
              return (
                <React.Fragment key={t.q}>
                  {idx > 0 && <View style={S.divider} />}
                  <TouchableOpacity style={S.helpTopicRow} onPress={() => setExpanded(open ? null : idx)} activeOpacity={0.7}>
                    <Text style={S.helpTopicQ}>{t.q}</Text>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={C.gray400} />
                  </TouchableOpacity>
                  {open && <Text style={S.helpTopicA}>{t.a}</Text>}
                </React.Fragment>
              );
            })
          )}
        </View>

        {/* ── Contact support ── */}
        <Text style={[S.subGroupLabel, { marginTop: SP._20 }]}>CONTACT SUPPORT</Text>
        <View style={S.subCard}>
          {/* <HelpContactRow
            icon={<I.MessageCircle c={C.brand500} />}
            title="Chat on Messenger"
            sub="Fastest response for app issues"
            onPress={() => { void openURL(SUPPORT.messenger, "Message us on Facebook: Lalaba"); }}
          />
          <View style={S.divider} />
          <HelpContactRow
            icon={<I.Phone c={C.brand500} />}
            title="Call Support"
            sub="For urgent store problems"
            onPress={() => { void openURL(`tel:${SUPPORT.phone}`, `Call us at ${SUPPORT.phone}`); }}
          />
          <View style={S.divider} /> */}
          <HelpContactRow
            icon={<I.Mail c={C.brand500} />}
            title="Email Support"
            sub="Send detailed concerns or screenshots"
            onPress={() => { void openURL(`mailto:${SUPPORT.email}`, `Email us at ${SUPPORT.email}`); }}
          />
        </View>

        {/* ── Report a problem ── */}
        <Text style={[S.subGroupLabel, { marginTop: SP._20 }]}>REPORT A PROBLEM</Text>
        {onReportProblem ? (
          <TouchableOpacity style={[S.helpReportCard, { marginBottom: SP._8 }]} onPress={onReportProblem} activeOpacity={0.85}>
            <View style={[S.hubIconCircle, { backgroundColor: C.warning100 ?? "#FEF3C7" }]}>
              <I.LifeBuoy c={C.warning700 ?? "#B45309"} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={S.helpReportTitle}>Report a Problem</Text>
              <Text style={S.helpReportSub}>Chat with Lalaba Support — track your report and get replies right here.</Text>
            </View>
            <I.Chevron c={C.gray400} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={S.helpReportCard} onPress={handleReport} activeOpacity={0.85}>
          <View style={[S.hubIconCircle, { backgroundColor: C.warning100 ?? "#FEF3C7" }]}>
            <I.AlertTriangle c={C.warning700 ?? "#B45309"} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={S.helpReportTitle}>{onReportProblem ? "Email a Report Instead" : "Report an Issue"}</Text>
            <Text style={S.helpReportSub}>Opens an email with your app version, device, and account details attached automatically.</Text>
          </View>
          <I.Chevron c={C.gray400} />
        </TouchableOpacity>

        <Text style={S.helpFootnote}>Lalaba Merchant v4.2.1 · {Platform.OS} {String(Platform.Version)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Settings fetch helpers (all via API — no direct Firestore) ──────────────

