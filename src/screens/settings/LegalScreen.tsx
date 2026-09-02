// Read-only Terms & Conditions / Privacy Policy viewer for Settings.
// Reuses the shared <LegalBody> so the wording matches the Register agreement.
import React from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { TopBar } from "../../components/ui";
import { LegalBody, type LegalKind } from "../../components/LegalBody";
import { S } from "./styles";

export function LegalScreenInline({
  kind, onBack,
}: Readonly<{ kind: LegalKind; onBack: () => void }>) {
  const title = kind === "terms" ? "Terms & Conditions" : "Privacy Policy";
  const subtitle = kind === "terms" ? "Rules for using the app" : "How we handle your data";
  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <TopBar title={title} subtitle={subtitle} onBack={onBack} blue large />
      <ScrollView
        style={{ flex: 1, backgroundColor: C.gray100, maxWidth: 880, width: "100%", alignSelf: "center" }}
        contentContainerStyle={{ padding: SP._16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={S.subCard}>
          <LegalBody kind={kind} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
