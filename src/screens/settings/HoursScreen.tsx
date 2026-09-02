// Merchant operating-hours screen.
//
// The week editor itself now lives in HoursEditor so the washer stack can reuse
// it verbatim; this file is the merchant shell around it — the branch it saves
// to, the mutation, and the sticky footer. Behaviour is unchanged.

import React, { useState, useEffect } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { Btn, TopBar } from "../../components/ui";
import { showAlert } from "../../lib/dialog";
import { useNotificationStore } from "../../stores/notificationStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { gqlUpdateBranch, type GqlOperatingHours } from "../../services/graphql/branches";
import { type OperatingHours, type BranchConfig } from "./shared";
import { HoursEditor } from "./HoursEditor";
import { feToBeHours, findInvalidHoursDay, sameHours } from "./hoursMapping";
import { S } from "./styles";

export function HoursScreenInline({
  config, setConfig, branchId, onBack,
}: Readonly<{
  config: BranchConfig;
  setConfig: React.Dispatch<React.SetStateAction<BranchConfig>>;
  branchId: string | null;
  onBack: () => void;
}>) {
  // Settings no longer puts a branch picker in front of this screen — the
  // header selector chose the branch — so the screen has to say which one.
  const branchName = useMerchantStore(
    (st) => st.branches.find((b) => b.id === branchId)?.name ?? null,
  );

  const [saving, setSaving] = useState(false);

  // Last-saved hours. `dirty` is derived from this, so undoing an edit by hand
  // clears the pending state the same way Cancel does.
  const [savedHours, setSavedHours] = useState<OperatingHours>(config.operatingHours);
  const dirty = !sameHours(config.operatingHours, savedHours);

  // Switching branches re-bases the comparison on the incoming branch's hours.
  useEffect(() => {
    setSavedHours(config.operatingHours);
    // Intentionally branch-keyed: depending on config.operatingHours would re-base
    // on every edit and dirty would never be true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const cancel = () => setConfig((p) => ({ ...p, operatingHours: savedHours }));

  const setHours = (next: OperatingHours) =>
    setConfig((p) => ({ ...p, operatingHours: next }));

  const save = async () => {
    if (!branchId) {
      showAlert("No Branch", "Select a branch before saving hours.");
      return;
    }
    const invalid = findInvalidHoursDay(config.operatingHours);
    if (invalid) {
      showAlert("Invalid hours", `${invalid}: closing time must be after opening time.`);
      return;
    }
    setSaving(true);
    try {
      await gqlUpdateBranch(branchId, {
        operatingHours: feToBeHours(config.operatingHours) as unknown as GqlOperatingHours,
      });
      setSavedHours(config.operatingHours);
      useNotificationStore.getState().push({ type: "success", title: "Saved", message: "Operating hours updated." });
    } catch {
      showAlert("Could not save operating hours", "Please try again.");
    } finally { setSaving(false); }
  };

  const idleButtonLabel = dirty ? "Save Changes" : "No changes";
  const saveButtonLabel = saving ? "Saving…" : idleButtonLabel;

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <TopBar title="Operating Hours" subtitle={branchName ?? undefined} onBack={onBack} blue />

      <ScrollView
        style={{ flex: 1, backgroundColor: C.gray50, maxWidth: 880, width: "100%", alignSelf: "center" }}
        contentContainerStyle={{ padding: SP._16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <HoursEditor hours={config.operatingHours} onChange={setHours} />
      </ScrollView>

      {/* Sticky save — only active when changes pending */}
      <View style={S.stickyFooter}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", flexDirection: "row", gap: SP._12 }}>
          {dirty && (
            <View style={{ flex: 1 }}>
              <Btn onPress={cancel} disabled={saving} variant="outline">
                Cancel
              </Btn>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Btn
              onPress={() => { void save(); }}
              disabled={!dirty || saving}
              variant={dirty ? "primary" : "outline"}
            >
              {saveButtonLabel}
            </Btn>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
