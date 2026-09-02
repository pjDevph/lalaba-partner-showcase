// Tours / walkthrough replay screen — extracted from settings.tsx.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { C, SP } from "../../theme/tokens";
import { TopBar } from "../../components/ui";
import { useTourStore } from "../../stores/tourStore";
import { TOUR_REGISTRY, TOUR_LABELS, type TourId } from "../../data/tourContent";
import { S } from "./styles";

const TOUR_IDS: TourId[] = [
  "dashboard", "pos-terminal", "pos-queue", "pos-claim",
  "sales", "services", "settings",
];

export function ToursScreenInline({ onBack }: Readonly<{ onBack: () => void }>) {
  const { replayTour, isTourSeen, setPendingPosTab } = useTourStore();

  // Tab route each tour lives on
  const TOUR_TAB_ROUTE: Partial<Record<TourId, string>> = {
    dashboard:       "/(tabs)/dashboard",
    "pos-terminal":  "/(tabs)/pos",
    "pos-queue":     "/(tabs)/pos",
    "pos-claim":     "/(tabs)/pos",
    sales:           "/(tabs)/sales",
    services:        "/(tabs)/services",
    // settings stays on current screen — no navigation needed
  };

  // Which POS sub-tab to open for POS sub-tours
  const POS_SUB_TAB: Partial<Record<TourId, "terminal" | "queue" | "claim">> = {
    "pos-terminal": "terminal",
    "pos-queue":    "queue",
    "pos-claim":    "claim",
  };

  const handleReplay = (id: TourId) => {
    const steps = TOUR_REGISTRY[id];
    if (!steps) return;

    // Set pending POS sub-tab BEFORE navigating so pos.tsx picks it up on focus
    const posTab = POS_SUB_TAB[id];
    if (posTab) setPendingPosTab(posTab);

    // Queue the tour — TourOverlay on the target screen will fire it
    replayTour(id, steps);

    // Navigate to the correct tab (if different from settings)
    const route = TOUR_TAB_ROUTE[id];
    if (route) router.navigate(route as Parameters<typeof router.navigate>[0]);
  };

  return (
    <SafeAreaView style={S.safe} edges={["top"]}>
      <TopBar title="App Tours" onBack={onBack} />
      <ScrollView
        style={{ flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" }}
        contentContainerStyle={{ padding: SP._16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={S.tourPageHint}>
          Replay guided walkthroughs for any tab at any time.
        </Text>
        <View style={S.subCard}>
          {TOUR_IDS.map((id, idx) => {
            const seen = isTourSeen(id);
            return (
              <React.Fragment key={id}>
                {idx > 0 && <View style={S.divider} />}
                <View style={[S.tourRow, { paddingHorizontal: SP._16 }]}>
                  <View style={S.tourRowLeft}>
                    <View style={S.tourStatusIcon}>
                      {seen ? (
                        <Ionicons name="checkmark-circle" size={20} color={C.success500} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={20} color={C.gray300} />
                      )}
                    </View>
                    <View>
                      <Text style={S.tourLabel}>{TOUR_LABELS[id]}</Text>
                      <Text style={S.tourRowSub}>{seen ? "Completed" : "Not started"}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={S.tourReplayBtn}
                    onPress={() => handleReplay(id)}
                    activeOpacity={0.7}
                  >
                    <Text style={S.tourReplayText}>▶ Replay</Text>
                  </TouchableOpacity>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HELP & SUPPORT SCREEN (INLINE SUB-PAGE)
// Searchable FAQs (accordion), contact channels, and a report-a-problem action
// that opens a prefilled email with diagnostics. Contact endpoints are constants
// below — change them to your real support channels.
// ══════════════════════════════════════════════════════════════════════════════
