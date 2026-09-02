// src/components/PayAtHandoverCard.tsx
// The shop's deferred-settlement opt-in (§14), shared by both partner roles —
// merchant branches and the home washer's anchor branch are the same Branch
// record, so one card serves both.
//
// The copy matters as much as the switch: turning this on means the shop does
// the laundry before it gets paid, and keeps fronting the platform fee at
// pickup either way. A provider carrying several deferred orders burns wallet
// balance with nothing coming back in, and can drop below the marketplace
// floor faster than usual. That is stated plainly rather than buried.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { C, SP } from "../theme/tokens";
import { notify } from "../stores/notificationStore";
import { useMerchantStore } from "../stores/merchantStore";
import { gqlGetBranch, gqlSetPayAtHandover } from "../services/graphql/branches";
import { toUserMessage } from "../utils/userError";

export default function PayAtHandoverCard({
  branchId,
  accent,
}: Readonly<{ branchId: string | null; accent: string }>) {
  // The branch list already carries allowsPayAtHandover, so paint from the
  // store for an instant first frame — but still confirm against the server,
  // because the value can have been changed on another device and this is a
  // money setting. (The old cost of one getBranch per card is gone because the
  // Branches directory no longer renders a card per branch; it shows the
  // cached value read-only and this editor lives on Booking & Fees.)
  const knownEnabled = useMerchantStore(
    (st) => st.branches.find((b) => b.id === branchId)?.allowsPayAtHandover ?? null,
  );
  const applyToStore = useMerchantStore((st) => st.setPayAtHandoverLocal);
  // Read through a ref: the cached value is only ever a first paint, so load()
  // must not re-run every time the store updates (including from its own
  // write-back, which would fetch a second time for nothing).
  const knownRef = useRef(knownEnabled);
  knownRef.current = knownEnabled;

  const [enabled, setEnabled] = useState<boolean | null>(knownEnabled);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setFailed(false);
    // Repaint from cache on every branch change too, otherwise switching
    // branches leaves the PREVIOUS branch's switch on screen until the fetch
    // lands — the exact kind of cross-branch confusion the single selector
    // exists to prevent.
    setEnabled(knownRef.current);
    try {
      const branch = await gqlGetBranch(branchId);
      setEnabled(branch.allowsPayAtHandover);
      applyToStore(branchId, branch.allowsPayAtHandover);
    } catch {
      // Never guess a default — showing "off" for a shop that actually has it
      // on would misrepresent a money setting. But don't sit on a spinner
      // either: say it failed and offer a retry. (A stale persisted branchId
      // after a database change lands here, and an endless spinner made that
      // look like the screen had simply hung.)
      //
      // The cached value is a legitimate first paint but NOT a legitimate
      // answer when the confirm fails — fall back to the same honest
      // "couldn't load" state rather than presenting cache as fact.
      setEnabled(null);
      setFailed(true);
    }
  }, [branchId, applyToStore]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    if (!branchId || busy) return;
    setBusy(true);
    const previous = enabled;
    setEnabled(next); // optimistic — a switch that lags feels broken
    try {
      const saved = await gqlSetPayAtHandover(branchId, next);
      setEnabled(saved);
      // Keep the branch list in agreement — it reads the same field, and a
      // stale row there would contradict the switch the owner just flipped.
      applyToStore(branchId, saved);
      notify.success(
        saved ? "Pay Later is on for this shop." : "Pay Later is off for new orders.",
      );
    } catch (e: unknown) {
      setEnabled(previous);
      notify.error("Couldn't save", toUserMessage(e, "Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!branchId) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>Allow Pay Later</Text>
          <Text style={styles.body}>
            Customers can take the Pay Later option after their laundry is weighed, and
            pay the full amount when it comes back to them.
          </Text>
        </View>
        {failed ? (
          <TouchableOpacity onPress={() => void load()} hitSlop={8}>
            <Text style={[styles.retry, { color: accent }]}>Retry</Text>
          </TouchableOpacity>
        ) : enabled == null ? (
          <ActivityIndicator color={accent} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={toggle}
            disabled={busy}
            trackColor={{ false: C.gray200, true: accent }}
            thumbColor={C.white}
          />
        )}
      </View>
      <Text style={styles.note}>
        {failed
          ? "Couldn't load this setting. Check your connection and try again."
          : "You still pay the platform fee at pickup on these orders, so your wallet balance drops before the money comes in. Orders already booked keep the setting they were booked under."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 16,
    padding: SP._14,
    gap: SP._8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: SP._12 },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  body: { fontSize: 13, color: C.gray600, lineHeight: 18 },
  note: { fontSize: 12, color: C.gray400, lineHeight: 17 },
  retry: { fontSize: 14, fontWeight: "700" },
});
