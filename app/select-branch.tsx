// app/select-branch.tsx
// Shown to STAFF (cashier) accounts that belong to MORE THAN ONE branch and
// have no active branch resolved yet: pick where you're working today, then
// continue to POS. Managers don't land here — the (tabs) stack has its own
// branch switcher.

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { gqlMyBranchOptions, BranchOption } from "../src/services/graphql/branches";
import { useAuthStore } from "../src/stores/authStore";
import { C, SP } from "../src/theme/tokens";

const LOGO_MARK = require("../assets/logo-mark.png");

export default function SelectBranchScreen() {
  const signOut = useAuthStore((s) => s.signOut);
  const [options, setOptions] = useState<BranchOption[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const opts = await gqlMyBranchOptions();
        if (!active) return;
        if (opts.length === 1) { choose(opts[0]); return; }
        setOptions(opts);
      } catch {
        if (active) setTimeout(load, 4000);
      }
    };
    void load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = useCallback((branch: BranchOption) => {
    const store = useAuthStore.getState();
    // Fill in branch names first — staff memberships come from me.branchIds
    // and carry no names, so setActiveBranch alone would leave the POS header
    // blank.
    store.syncBranchNames([{ id: branch.id, name: branch.name }]);
    store.setActiveBranch(branch.id);
    router.replace("/(staff)/pos");
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [signOut]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.card}>
        <Image source={LOGO_MARK} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>Select Your Branch</Text>
        <Text style={s.body}>Where are you working today?</Text>
        {options === null ? (
          <ActivityIndicator color={C.brand500} size="large" style={{ marginBottom: SP._16 }} />
        ) : (
          options.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[s.btn, s.branchBtn]}
              onPress={() => choose(b)}
              activeOpacity={0.85}
            >
              <Text style={[s.btnText, { color: C.gray900 }]}>{b.name}</Text>
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity
          style={[s.btn, { backgroundColor: C.gray100, marginTop: SP._8 }]}
          onPress={handleSignOut}
        >
          <Text style={[s.btnText, { color: C.gray600 }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.gray100, justifyContent: "center", alignItems: "center", padding: SP._24 },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: SP._24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  logo: { width: 48, height: 48, tintColor: C.brand500, marginBottom: SP._16 },
  title: { fontSize: 20, fontWeight: "800", color: C.gray900, marginBottom: SP._12, textAlign: "center" },
  body:  { fontSize: 14, color: C.gray500, textAlign: "center", lineHeight: 22, marginBottom: SP._24 },
  btn: { borderRadius: 12, paddingVertical: SP._12, paddingHorizontal: SP._24, alignSelf: "stretch", alignItems: "center" },
  branchBtn: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.gray200,
    marginBottom: SP._8,
  },
  btnText: { fontSize: 14, fontWeight: "700" },
});
