// src/screens/washer/staff.styles.ts
// Styles for the washer Staff screen (app/(washer)/staff.tsx).

import { StyleSheet } from "react-native";
import { C, RADIUS, SP, SHADOW } from "../../theme/tokens";

const TEAL    = C.washer500;
const TEAL_D  = C.washer700;
const TEAL_BG = C.washer100;

export const staffStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  flex1: { flex: 1 },
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: SP._16, paddingBottom: SP._12, gap: SP._8 },
  title: { fontSize: 24, fontWeight: "800", color: C.gray900 },
  sub: { fontSize: 13, color: C.gray500 },
  tabs: { flexDirection: "row", gap: SP._8, marginTop: SP._4 },
  chip: { height: 32, paddingHorizontal: SP._12, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: TEAL },
  chipIdle: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200 },
  chipText: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  chipTextActive: { color: C.white },

  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16 },
  bottomSpacer: { height: SP._16 },

  listCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16 },
  divider: { height: 1, backgroundColor: C.gray100, marginLeft: 60 },
  row: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  rowArchived: { opacity: 0.55 },
  avatar: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontWeight: "700", color: TEAL_D },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  role: { fontSize: 12, color: C.gray500, marginTop: 1 },
  statePill: { height: 22, paddingHorizontal: SP._8, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  statePillText: { fontSize: 11, fontWeight: "700" },
  rowActionBtn: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: C.gray50, alignItems: "center", justifyContent: "center" },

  // States
  centerBox: { padding: SP._24, alignItems: "center", gap: SP._8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.gray700 },
  emptyText: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 },
  errorBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12, marginBottom: SP._12 },
  errorText: { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },
  retryBtn: { marginTop: SP._8, borderWidth: 1.5, borderColor: TEAL, borderRadius: RADIUS.md, paddingHorizontal: SP._16, paddingVertical: SP._8 },
  retryText: { fontSize: 13, fontWeight: "700", color: TEAL },

  actionCard: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200, paddingHorizontal: SP._16, paddingTop: SP._12, ...SHADOW.sm },
  primaryBtn: { height: 48, borderRadius: RADIUS.md, backgroundColor: TEAL, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 15, fontWeight: "600", color: C.white },

  // Invite sheet
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SP._20 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.gray200, alignSelf: "center", marginBottom: SP._16 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: C.gray900, marginBottom: SP._12 },
  fieldSpacing: { marginBottom: SP._12 },
  fieldError: { fontSize: 12, color: C.error700, marginTop: -SP._8, marginBottom: SP._8 },
  nameRow: { flexDirection: "row", gap: SP._10 },
  nameCol: { flex: 1 },
  cancelBtn: { height: 48, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, alignItems: "center", justifyContent: "center", marginTop: SP._8 },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: C.gray600 },
});
