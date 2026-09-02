// src/screens/wallet/TopUpSheet.tsx
// Shared secure top-up sheet (merchant wallet tab + washer fee-balance).
// Production path per the Phase 2 wallet contract:
//   amount (integer pesos → centavos Int) → initializeTopUp (returns PENDING
//   TopUpIntent) → open invoiceUrl in the browser (if any) → poll topUpStatus
//   with backoff → SUCCEEDED refreshes the balance; FAILED/EXPIRED/timeout is
//   recoverable with retry. The wallet is credited ONLY by the payment webhook
//   — no client-fabricated references. In non-production the BE dev gateway
//   auto-succeeds, so the first poll resolves immediately.
//
// Returning from the hosted payment page: the BE now sends Xendit
// success/failure redirect URLs (PAYMENT_SUCCESS_REDIRECT_URL /
// PAYMENT_FAILURE_REDIRECT_URL, defaulting to the `lalaba-merchant://` deep
// links below), so the checkout page bounces straight back into the app. Three
// layered returns, cheapest signal first: the deep-link URL listener fires
// `checkOnce` the moment we're re-opened, an AppState foreground listener
// covers a manual return (user hits Back in the browser), and a
// "I've paid — check status" button covers the post-timeout case.
//
// The redirect is UX ONLY — landing on the success link is never treated as
// payment. It just re-polls `topUpStatus`; only the verified webhook credits.
// Funding is independent of KYC — no verification gating in this flow.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator, Linking, AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import { gqlInitializeTopUp, gqlTopUpStatus, type TopUpIntent } from "../../services/graphql/wallet";
import { pollTopUpStatus } from "./topUpPolling";
import { toUserMessage } from "../../utils/userError";
import { topUpStyles as styles } from "./TopUpSheet.styles";

/**
 * Path fragments of the deep links the BE hands to Xendit as
 * success/failure redirect URLs (see the BE's DEFAULT_PAYMENT_*_REDIRECT_URL).
 * Matched as substrings so an https universal-link override with the same
 * paths keeps working.
 */
export const TOPUP_RETURN_PATHS = ["wallet/topup-return", "wallet/topup-failed"] as const;

const PRESET_PESOS = [100, 500, 1000];
const MIN_PESOS = 100;
const MAX_PESOS = 1_000_000;

type Stage = "amount" | "pending" | "success" | "failed";

interface Props {
  readonly visible: boolean;
  readonly branchId: string | null;
  /** Brand accent for buttons (merchant brand vs washer teal). */
  readonly accentColor: string;
  readonly onClose: () => void;
  /** Called once after a SUCCEEDED intent (refresh balance/ledger). */
  readonly onSuccess: () => void;
  /** Default amount in pesos when the sheet opens. */
  readonly initialPesos?: number;
}

function pesos(n: number): string {
  return `₱${n.toLocaleString("en-PH")}`;
}

export function TopUpSheet({ visible, branchId, accentColor, onClose, onSuccess, initialPesos = 1000 }: Props) {
  const [stage, setStage] = useState<Stage>("amount");
  const [amountText, setAmountText] = useState(String(initialPesos));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<TopUpIntent | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // Reset when opened.
  useEffect(() => {
    if (!visible) { cancelledRef.current = true; return; }
    cancelledRef.current = false;
    setStage("amount");
    setAmountText(String(initialPesos));
    setAmountError(null);
    setError(null);
    setIntent(null);
    setFailReason(null);
  }, [visible, initialPesos]);

  const parsedPesos = Number.parseInt(amountText.replace(/[^\d]/g, ""), 10);
  const amountValid = Number.isInteger(parsedPesos) && parsedPesos >= MIN_PESOS && parsedPesos <= MAX_PESOS;

  // One-shot status check — used by the foreground listener and the manual
  // "I've paid" button. Never throws; leaves the stage alone when still pending.
  const checkOnce = useCallback(async (intentId: string): Promise<boolean> => {
    try {
      const latest = await gqlTopUpStatus(intentId);
      setIntent(latest);
      if (latest.status === "SUCCEEDED") {
        cancelledRef.current = true; // stop any in-flight poll loop
        setStage("success");
        onSuccess();
        return true;
      }
      if (latest.status === "FAILED" || latest.status === "EXPIRED") {
        cancelledRef.current = true;
        setFailReason(latest.status === "EXPIRED"
          ? "The payment window expired before the payment completed."
          : "The payment did not complete.");
        setStage("failed");
        return true;
      }
    } catch {
      // Leave the current state; the poll loop / another tap can retry.
    }
    return false;
  }, [onSuccess]);

  const beginPolling = useCallback(async (createdIntent: TopUpIntent) => {
    const result = await pollTopUpStatus(() => gqlTopUpStatus(createdIntent._id), {
      isCancelled: () => cancelledRef.current,
    });
    if (result.cancelled) return;
    const status = result.intent?.status;
    if (status === "SUCCEEDED") {
      setIntent(result.intent);
      setStage("success");
      onSuccess();
      return;
    }
    if (status === "FAILED" || status === "EXPIRED") {
      setIntent(result.intent);
      setFailReason(status === "EXPIRED"
        ? "The payment window expired before the payment completed."
        : "The payment did not complete.");
      setStage("failed");
      return;
    }
    // Timed out while still pending — recoverable, the webhook may still land.
    setFailReason("We haven't received the payment confirmation yet. If you completed the payment, your balance will update automatically once it's confirmed.");
    setStage("failed");
  }, [onSuccess]);

  const startTopUp = async () => {
    if (!branchId || busy) return;
    if (!amountValid) {
      setAmountError(`Enter a whole-peso amount between ${pesos(MIN_PESOS)} and ${pesos(MAX_PESOS)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setAmountError(null);
    try {
      const created = await gqlInitializeTopUp(branchId, parsedPesos * 100);
      setIntent(created);
      setStage("pending");
      // Hand the user to the hosted payment page when the gateway issued one.
      if (created.invoiceUrl) {
        Linking.openURL(created.invoiceUrl).catch(() => { /* user can reopen from the sheet */ });
      }
      void beginPolling(created);
    } catch (err) {
      setError(toUserMessage(err, "Couldn't start the top-up. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  // Coming back from the hosted payment page in the browser: re-check as soon
  // as the app is foregrounded. Covers a manual return (browser Back) as well
  // as the gateway redirect, which also foregrounds us.
  const intentId = intent?._id ?? null;
  const awaitingPayment = stage === "pending" || stage === "failed";
  useEffect(() => {
    if (!visible || !intentId || !awaitingPayment) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void checkOnce(intentId);
    });
    return () => sub.remove();
  }, [visible, intentId, awaitingPayment, checkOnce]);

  // Gateway redirect: Xendit sends the payer to PAYMENT_*_REDIRECT_URL, which
  // deep-links back here. Re-poll immediately rather than waiting for the next
  // backoff tick. The URL itself carries no trust — the failure link only sets
  // the copy, and `checkOnce` still asks the server for the real status.
  useEffect(() => {
    if (!visible || !intentId || !awaitingPayment) return;

    const handleUrl = (url: string | null) => {
      if (!url || !TOPUP_RETURN_PATHS.some((p) => url.includes(p))) return;
      void checkOnce(intentId);
    };

    // A cold start on the deep link may deliver the URL before we mount.
    void Linking.getInitialURL().then(handleUrl).catch(() => { /* nothing to resume */ });
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [visible, intentId, awaitingPayment, checkOnce]);

  const [checking, setChecking] = useState(false);
  const manualCheck = async () => {
    if (!intentId || checking) return;
    setChecking(true);
    const resolved = await checkOnce(intentId);
    setChecking(false);
    if (!resolved) {
      setFailReason("We still haven't received the payment confirmation. If you've paid, it will land shortly — you can close this and check your balance in a moment.");
    }
  };

  const retry = () => {
    setStage("amount");
    setError(null);
    setFailReason(null);
    setIntent(null);
  };

  const close = () => {
    cancelledRef.current = true;
    onClose();
  };

  const amountStage = (
    <>
      <Text style={styles.sub}>Choose an amount to add to the fee wallet. Whole pesos only.</Text>
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={C.error700} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.presetRow}>
        {PRESET_PESOS.map((p) => {
          const active = parsedPesos === p;
          return (
            <TouchableOpacity
              key={p}
              onPress={() => { setAmountText(String(p)); setAmountError(null); }}
              activeOpacity={0.8}
              style={[styles.preset, active && { borderColor: accentColor }]}
            >
              <Text style={[styles.presetText, active && { color: accentColor }]}>{pesos(p)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.customLabel}>Custom amount (min {pesos(MIN_PESOS)})</Text>
      <View style={styles.customRow}>
        <Text style={styles.customPrefix}>₱</Text>
        <TextInput
          style={styles.customInput}
          value={amountText}
          onChangeText={(t) => { setAmountText(t.replace(/[^\d]/g, "")); setAmountError(null); }}
          keyboardType="number-pad"
          placeholder="1000"
          placeholderTextColor={C.gray400}
        />
      </View>
      {amountError ? <Text style={styles.fieldError}>{amountError}</Text> : null}
      <Text style={styles.note}>
        You&apos;ll be taken to a secure payment page. The balance covers platform fees only and
        can&apos;t be withdrawn. Verification status doesn&apos;t affect top-ups.
      </Text>
      {__DEV__ ? (
        <View style={styles.devNote}>
          <Ionicons name="construct-outline" size={14} color={C.warning700} />
          <Text style={styles.devNoteText}>
            Dev build: when the backend&apos;s dev payment gateway is active, the top-up auto-succeeds
            without a payment page.
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: accentColor }, (busy || !amountValid) && styles.primaryBtnDisabled]}
        onPress={() => void startTopUp()}
        disabled={busy || !amountValid}
        activeOpacity={0.85}
      >
        {busy
          ? <ActivityIndicator color={C.white} />
          : <Text style={styles.primaryBtnText}>Top up {amountValid ? pesos(parsedPesos) : ""}</Text>}
      </TouchableOpacity>
    </>
  );

  const pendingStage = (
    <View style={styles.centerBox}>
      <ActivityIndicator size="large" color={accentColor} />
      <Text style={styles.amountText}>{intent ? pesos(Math.round(intent.amountCentavos / 100)) : ""}</Text>
      <Text style={styles.stateTitle}>Waiting for payment…</Text>
      <Text style={styles.stateText}>
        {intent?.invoiceUrl
          ? "Complete the payment in your browser. This screen updates automatically once the payment is confirmed."
          : "Confirming your top-up. This usually takes a few seconds."}
      </Text>
      {intent?.invoiceUrl ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: accentColor }, styles.btnStretch]}
          onPress={() => { void Linking.openURL(intent.invoiceUrl!); }}
          activeOpacity={0.85}
        >
          <Ionicons name="open-outline" size={16} color={C.white} />
          <Text style={styles.primaryBtnText}>Open payment page</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.secondaryBtn, styles.btnStretch]}
        onPress={() => void manualCheck()}
        disabled={checking}
      >
        {checking
          ? <ActivityIndicator size="small" color={C.gray500} />
          : <Text style={styles.secondaryBtnText}>I&apos;ve paid — check status</Text>}
      </TouchableOpacity>
    </View>
  );

  const successStage = (
    <View style={styles.centerBox}>
      <View style={[styles.stateIconWrap, { backgroundColor: C.success100 }]}>
        <Ionicons name="checkmark" size={30} color={C.success700} />
      </View>
      <Text style={styles.stateTitle}>Top-up successful</Text>
      <Text style={styles.stateText}>
        {intent ? `${pesos(Math.round(intent.amountCentavos / 100))} has been added to the fee wallet.` : "The fee wallet has been credited."}
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: accentColor }, styles.btnStretch]}
        onPress={close}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const failedStage = (
    <View style={styles.centerBox}>
      <View style={[styles.stateIconWrap, { backgroundColor: C.error100 }]}>
        <Ionicons name="alert" size={30} color={C.error700} />
      </View>
      <Text style={styles.stateTitle}>Top-up not completed</Text>
      <Text style={styles.stateText}>{failReason ?? "The payment did not complete."}</Text>
      {intentId ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: accentColor }, styles.btnStretch]}
          onPress={() => void manualCheck()}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking
            ? <ActivityIndicator size="small" color={C.white} />
            : <Text style={styles.primaryBtnText}>I&apos;ve paid — check status</Text>}
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.secondaryBtn, styles.btnStretch]}
        onPress={retry}
        activeOpacity={0.85}
      >
        <Text style={styles.secondaryBtnText}>Start a new top-up</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryBtn, styles.btnStretch]} onPress={close}>
        <Text style={styles.secondaryBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} supportedOrientations={["portrait", "landscape"]}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Top up fee wallet</Text>
            <View style={styles.spacer} />
            <TouchableOpacity onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={C.gray500} />
            </TouchableOpacity>
          </View>
          {stage === "amount" && amountStage}
          {stage === "pending" && pendingStage}
          {stage === "success" && successStage}
          {stage === "failed" && failedStage}
        </View>
      </View>
    </Modal>
  );
}
