// app/(washer)/staff.tsx
// Washer › Couriers — the riders this washer has invited.
//
// This screen used to be a scaffold: a four-person hardcoded roster (Maria,
// Josie, Ana, Ben), rows that did nothing when tapped, an "On shift" filter
// counting fake people, and an "Invite staff" button with no handler. It now
// runs on the real staff domain (`myStaff`, `createStaff`), which merchants
// already use.
//
// COURIERS ONLY, deliberately. A home washer has no shop floor and no POS, so a
// "staff" account would be provisioned onto screens that do not apply to her.
// The backend enforces this too (StaffService.createStaff rejects role=staff
// from a washer) — the UI here simply never offers the choice.
//
// There is no "on shift" state: nothing in the backend tracks shifts, so the
// old filter was counting a field that does not exist. Accounts are either
// active or archived, which is what the roster shows.

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { notify } from "../../src/stores/notificationStore";
import { fetchMyStaff, gqlCreateStaff } from "../../src/services/graphql/staff";
import type { StaffMember } from "../../src/stores/activeStaffStore";

const TEAL = C.washer500;
const TEAL_D = C.washer700;
const TEAL_BG = C.washer100;

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phoneNumber: "" };

export default function WasherStaff() {
  const insets = useSafeAreaInsets();

  const [couriers, setCouriers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const all = await fetchMyStaff();
      // `myStaff` returns every account she provisioned; role is the only thing
      // separating couriers from anything else.
      setCouriers(all.filter((m) => m.role === "COURIER" && !m.isArchived));
      setLoadError(false);
    } catch {
      if (!silent) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const submitInvite = async () => {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    const phoneNumber = form.phoneNumber.trim();

    if (!firstName || !lastName || !email || !phoneNumber) {
      setFormError("Fill in every field so we can set up their account.");
      return;
    }
    // Matches the backend's rule, so the common typo is caught before a
    // round-trip rather than coming back as a validation error.
    if (!/^09\d{9}$/.test(phoneNumber)) {
      setFormError("Enter a mobile number as 09XXXXXXXXX.");
      return;
    }

    setInviting(true);
    setFormError(null);
    try {
      await gqlCreateStaff({
        firstName,
        lastName,
        email,
        phoneNumber,
        role: "COURIER",
      });
      setInviteOpen(false);
      setForm(EMPTY_FORM);
      notify.success(`Invite sent to ${email}`);
      await load(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Couldn't send that invite.",
      );
    } finally {
      setInviting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + SP._10 }]}>
        <BackLink label="Settings" fallback="/(washer)/settings" />
        <Text style={styles.title}>Couriers</Text>
        <Text style={styles.sub}>
          {loading
            ? "Loading…"
            : `${couriers.length} ${couriers.length === 1 ? "courier" : "couriers"}`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />
        }
      >
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={TEAL} />
          </View>
        ) : loadError ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>Couldn&apos;t load your couriers.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : couriers.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="bicycle-outline" size={34} color={C.gray200} />
            <Text style={styles.emptyText}>No couriers yet.</Text>
            <Text style={styles.emptyHint}>
              Invite a courier to handle pickups and deliveries for you.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {couriers.map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(m.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{m.name}</Text>
                    <Text style={styles.role} numberOfLines={1}>
                      {m.email ?? m.phone ?? "Courier"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statePill,
                      { backgroundColor: m.isActive ? C.success100 : C.gray100 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statePillText,
                        { color: m.isActive ? C.success700 : C.gray500 },
                      ]}
                    >
                      {m.isActive ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
        <View style={{ height: SP._16 }} />
      </ScrollView>

      <View style={[styles.actionCard, { paddingBottom: insets.bottom + SP._12 }]}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={() => {
            setForm(EMPTY_FORM);
            setFormError(null);
            setInviteOpen(true);
          }}
        >
          <Ionicons name="person-add-outline" size={17} color={C.white} />
          <Text style={styles.primaryBtnText}>Invite courier</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={inviteOpen}
        transparent
        animationType="slide"
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setInviteOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + SP._16 }]}>
            <Text style={styles.sheetTitle}>Invite a courier</Text>
            <Text style={styles.sheetSub}>
              They&apos;ll get an email to set their password and sign in.
            </Text>

            <Field
              label="First name"
              value={form.firstName}
              onChangeText={(v) => setForm((p) => ({ ...p, firstName: v }))}
            />
            <Field
              label="Last name"
              value={form.lastName}
              onChangeText={(v) => setForm((p) => ({ ...p, lastName: v }))}
            />
            <Field
              label="Email"
              value={form.email}
              onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Mobile number"
              value={form.phoneNumber}
              onChangeText={(v) => setForm((p) => ({ ...p, phoneNumber: v }))}
              keyboardType="number-pad"
              placeholder="09XXXXXXXXX"
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnGhost]}
                onPress={() => setInviteOpen(false)}
                disabled={inviting}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                onPress={() => void submitInvite()}
                disabled={inviting}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetBtnPrimaryText}>
                  {inviting ? "Sending…" : "Send invite"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({
  label,
  ...props
}: Readonly<{ label: string } & React.ComponentProps<typeof TextInput>>) {
  return (
    <View style={{ marginTop: SP._12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.field}
        placeholderTextColor={C.gray400}
        {...props}
      />
    </View>
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: SP._16, paddingBottom: SP._12, gap: SP._8 },
  title: { fontSize: 24, fontWeight: "800", color: C.gray900 },
  sub: { fontSize: 13, color: C.gray500 },

  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16 },
  centerBox: { alignItems: "center", justifyContent: "center", paddingVertical: SP._40, gap: SP._8 },
  emptyText: { fontSize: 14, color: C.gray600 },
  emptyHint: { fontSize: 12, color: C.gray500, textAlign: "center", paddingHorizontal: SP._24 },
  retryBtn: { paddingHorizontal: SP._16, paddingVertical: SP._8, borderRadius: RADIUS.md, backgroundColor: TEAL_BG },
  retryText: { color: TEAL_D, fontWeight: "600" },

  listCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16 },
  divider: { height: 1, backgroundColor: C.gray100, marginLeft: 60 },
  row: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  avatar: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontWeight: "700", color: TEAL_D },
  name: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  role: { fontSize: 12, color: C.gray500, marginTop: 1 },
  statePill: { height: 22, paddingHorizontal: SP._8, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  statePillText: { fontSize: 11, fontWeight: "700" },

  actionCard: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200, paddingHorizontal: SP._16, paddingTop: SP._12, ...SHADOW.sm },
  primaryBtn: { height: 48, borderRadius: RADIUS.md, backgroundColor: TEAL, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8 },
  primaryBtnText: { fontSize: 15, fontWeight: "600", color: C.white },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SP._16 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  sheetSub: { fontSize: 13, color: C.gray500, marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: C.gray600, marginBottom: SP._4 },
  field: { height: 44, borderWidth: 1, borderColor: C.gray200, borderRadius: RADIUS.md, paddingHorizontal: SP._12, fontSize: 14, color: C.gray900, backgroundColor: C.white },
  formError: { color: C.error700, fontSize: 12, marginTop: SP._8 },
  sheetActions: { flexDirection: "row", gap: SP._12, marginTop: SP._16 },
  sheetBtn: { flex: 1, height: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  sheetBtnGhost: { borderWidth: 1, borderColor: C.gray200 },
  sheetBtnGhostText: { color: C.gray700, fontWeight: "600" },
  sheetBtnPrimary: { backgroundColor: TEAL },
  sheetBtnPrimaryText: { color: C.white, fontWeight: "700" },
});
