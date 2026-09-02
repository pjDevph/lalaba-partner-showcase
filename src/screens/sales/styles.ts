// Styles for the sales screen — extracted from sales.tsx for readability.
// Pure static StyleSheet; no behavior.
import { StyleSheet } from "react-native";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";

export const S = StyleSheet.create({
  // Brand-blue base so the top-inset area matches the blue TopBar header.
  safe: { flex: 1, backgroundColor: C.brand500 },

  // Export action (lives in the TopBar's `right` slot) — translucent white pill
  // so the white download icon/label stay visible on the blue header.
  exportIconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: RADIUS.full,
    paddingVertical: SP._8,
    paddingHorizontal: SP._12,
  },
  exportLabel: { fontSize: 13, fontWeight: "700", color: C.white },

  // Filter bar
  filterBar: {
    backgroundColor: C.white,
    paddingHorizontal: SP._16,
    paddingTop: SP._10,
    paddingBottom: SP._12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    gap: SP._8,
  },
  pillRow:  { flexDirection: "row", gap: SP._6 },
  pill:     { flex: 1, paddingVertical: SP._8, borderRadius: RADIUS.full, backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, alignItems: "center" },
  pillActive:    { backgroundColor: C.brand500, borderColor: C.brand500 },
  pillText:      { fontSize: 12, fontWeight: "600", color: C.gray700 },
  pillTextActive:{ color: C.white },
  basisPill:     { flex: 1, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200, alignItems: "center" },
  basisPillActive:    { backgroundColor: C.brand50, borderColor: C.brand300 },
  basisPillText:      { fontSize: 11, fontWeight: "600", color: C.gray500 },
  basisPillTextActive:{ color: C.brand700 },
  filterRowLabel: { fontSize: 11, fontWeight: "700", color: C.gray400, width: 58, flexShrink: 0, textTransform: "uppercase", letterSpacing: 0.3 },

  // Content
  content:    { padding: SP._14, paddingBottom: 40, gap: SP._14 },
  loadingBox: { height: 200, alignItems: "center", justifyContent: "center" },

  // KPI cards
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP._8 },
  kpiCard: { minWidth: "48%", flexGrow: 1, flexBasis: "48%" },
  kpiLabel:{ fontSize: 10, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue:{ fontSize: 17, fontWeight: "800", marginTop: SP._4, letterSpacing: -0.5 },
  kpiSub:  { fontSize: 10, color: C.gray400, marginTop: 2 },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.xs,
  },
  tab:         { flex: 1, paddingVertical: SP._10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive:   { borderBottomColor: C.brand500 },
  tabText:     { fontSize: 11, fontWeight: "600", color: C.gray400 },
  tabTextActive:{ fontSize: 11, fontWeight: "700", color: C.brand500 },

  // Shared row styles
  sectionTitle: { fontSize: 14, fontWeight: "700", color: C.gray900, marginBottom: SP._12 },
  emptyHint:    { fontSize: 13, color: C.gray400 },
  rowName:  { fontSize: 13, fontWeight: "600", color: C.gray900, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: "700", color: C.gray900 },
  track:    { height: 6, backgroundColor: C.gray100, borderRadius: 3, overflow: "hidden" },
  fill:     { height: 6, backgroundColor: C.brand500, borderRadius: 3 },

  // Export modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: C.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SP._24,
    paddingBottom: 40,
  },
  modalBtn: {
    paddingVertical: SP._14,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
