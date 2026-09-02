// Styles for the costing screen — extracted from costing.tsx for readability.
// Pure static StyleSheet; no behavior.
import { StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.gray100 },
  segmentBar: { paddingHorizontal: SP._16, paddingVertical: SP._12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: SP._16, paddingBottom: 110 },
  gate: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP._32 },
  gateTitle: { fontSize: 17, fontWeight: "800", color: C.gray900, marginBottom: SP._8 },
  gateSub: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 },

  eyebrow: { fontSize: 11, fontWeight: "800", color: C.gray400, letterSpacing: 0.6, marginBottom: SP._10 },

  hero: { borderRadius: RADIUS.lg, padding: SP._20, alignItems: "center" },
  heroLabel: { fontSize: 13, fontWeight: "700", color: C.gray700 },
  heroValue: { fontSize: 44, fontWeight: "900", marginTop: 2 },
  heroUnit: { fontSize: 20, fontWeight: "800", color: C.gray500 },
  heroSub: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  heroSubMuted: { fontSize: 13, fontWeight: "600", color: C.gray500, marginTop: 2 },
  heroMeta: { fontSize: 12, color: C.gray600, marginTop: SP._8, textAlign: "center" },
  chip: { marginTop: SP._12, borderRadius: RADIUS.full, paddingHorizontal: SP._12, paddingVertical: SP._6 },
  chipText: { fontSize: 12, fontWeight: "700" },

  unitStrip: { flexDirection: "row", flexWrap: "wrap", gap: SP._8, marginTop: SP._10 },
  unitPill: { backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray100, paddingHorizontal: SP._12, paddingVertical: SP._8 },
  unitPillVal: { fontSize: 15, fontWeight: "800", color: C.brand700 },
  unitPillLabel: { fontSize: 10, color: C.gray500, marginTop: 1 },

  editNote: { fontSize: 12, color: C.warning700, marginTop: SP._8, marginLeft: SP._2 },

  sectionHeader: { fontSize: 12, fontWeight: "800", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.6, marginTop: SP._20, marginBottom: SP._8 },
  help: { fontSize: 12, color: C.gray500, marginBottom: SP._4, lineHeight: 16 },

  card: { backgroundColor: C.white, borderRadius: RADIUS.md, padding: SP._14, marginTop: SP._8, borderWidth: 1, borderColor: C.gray100 },
  cardTitle: { fontSize: 11, fontWeight: "800", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: SP._8 },
  cardSubtitle: { fontSize: 11, color: C.gray500, marginBottom: SP._8 },
  cardHint: { fontSize: 11, color: C.gray400, marginTop: SP._8, lineHeight: 15 },
  divider: { height: 1, backgroundColor: C.gray100, marginVertical: SP._6 },

  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: SP._6 },
  rowLabel: { fontSize: 13, color: C.gray600, flex: 1, paddingRight: SP._8 },
  rowValue: { fontSize: 13, fontWeight: "600", color: C.gray900 },
  rowStrong: { fontSize: 15, fontWeight: "800", color: C.gray900 },

  inputLabel: { fontSize: 13, fontWeight: "600", color: C.gray900, marginBottom: SP._6 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._12 },
  affix: { fontSize: 14, color: C.gray500, fontWeight: "600" },
  affixSm: { fontSize: 12, color: C.gray400, fontWeight: "600" },
  input: { flex: 1, paddingVertical: SP._10, paddingHorizontal: SP._6, fontSize: 14, color: C.gray900 },

  utilCard: { backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray100, padding: SP._12, marginBottom: SP._12 },
  utilHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._8 },
  utilLabel: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  utilMethod: { fontSize: 11, fontWeight: "700", color: C.brand600, backgroundColor: C.brand100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  estRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  estText: { fontSize: 12, color: C.gray500, flex: 1 },
  estVal: { fontSize: 14, fontWeight: "800", color: C.gray900 },
  meterLabel: { fontSize: 11, fontWeight: "600", color: C.gray500, marginBottom: 4 },
  useLast: { fontSize: 12, fontWeight: "600", color: C.brand600, marginTop: SP._8 },
  meterCalcRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SP._8, paddingTop: SP._8, borderTopWidth: 1, borderTopColor: C.gray100 },
  meterCalc: { fontSize: 12, color: C.gray500 },
  meterTotal: { fontSize: 15, fontWeight: "800", color: C.gray900 },

  ooRow: { flexDirection: "row", alignItems: "center", gap: SP._8, paddingVertical: SP._6 },
  ooName: { flex: 1, fontSize: 14, color: C.gray900, backgroundColor: C.gray50, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._10, paddingVertical: SP._8 },
  ooAmt: { flexDirection: "row", alignItems: "center", width: 100, backgroundColor: C.gray50, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._8 },
  ooRemove: { fontSize: 14, color: C.gray400, fontWeight: "700", paddingHorizontal: 4 },
  addLink: { paddingVertical: SP._8 },
  addLinkText: { fontSize: 13, fontWeight: "700", color: C.brand600 },

  primaryBtn: { marginTop: SP._20, height: 52, borderRadius: RADIUS.lg, backgroundColor: C.brand500, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { fontSize: 16, fontWeight: "800", color: C.white },

  checklistCard: { backgroundColor: C.brand100, borderRadius: RADIUS.md, padding: SP._14, marginBottom: SP._4 },
  checklistTitle: { fontSize: 15, fontWeight: "800", color: C.brand700 },
  checklistSub: { fontSize: 12, color: C.brand700, marginTop: 4, lineHeight: 17 },
  setupCard: { backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray100, padding: SP._14, marginTop: SP._8 },
  setupCardTitle: { fontSize: 13, fontWeight: "800", color: C.gray900, marginBottom: SP._8 },
  methodWrap: { flexDirection: "row", flexWrap: "wrap", gap: SP._6, marginBottom: SP._10 },
  methodChip: { paddingHorizontal: SP._10, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: "transparent" },
  methodChipActive: { backgroundColor: C.brand100, borderColor: C.brand500 },
  methodText: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  methodTextActive: { color: C.brand700 },
  fixedSummary: { backgroundColor: C.gray900, borderRadius: RADIUS.md, padding: SP._16, marginTop: SP._12, alignItems: "center" },
  fixedSummaryLabel: { fontSize: 11, fontWeight: "800", color: C.gray400, letterSpacing: 0.6 },
  fixedSummaryValue: { fontSize: 28, fontWeight: "900", color: C.white, marginTop: 2 },
  fixedSummaryUnit: { fontSize: 15, fontWeight: "700", color: C.gray400 },
  fixedSummarySub: { fontSize: 12, color: C.gray300, marginTop: 2, textAlign: "center" },

  periodRow: { flexDirection: "row", gap: SP._8 },
  periodChip: { flex: 1, paddingVertical: SP._8, borderRadius: RADIUS.md, alignItems: "center", backgroundColor: C.gray100, borderWidth: 1.5, borderColor: "transparent" },
  periodChipActive: { backgroundColor: C.brand100, borderColor: C.brand500 },
  periodText: { fontSize: 13, fontWeight: "600", color: C.gray600 },
  periodTextActive: { color: C.brand700 },

  noTrueBanner: { backgroundColor: C.warning100, borderRadius: RADIUS.sm, padding: SP._12, marginBottom: SP._10 },
  noTrueTitle: { fontSize: 13, fontWeight: "800", color: C.warning700 },
  noTrueSub: { fontSize: 12, color: C.warning700, marginTop: 2, lineHeight: 16 },

  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: SP._8, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  tcName: { flex: 1, paddingRight: SP._8 },
  tName: { fontSize: 13, fontWeight: "600", color: C.gray900 },
  tSub: { fontSize: 11, color: C.gray400, marginTop: 1 },
  tcNumVal: { fontSize: 13, fontWeight: "700", color: C.gray900, textAlign: "right" },
  tcNum2: { width: 46, textAlign: "right", fontSize: 13, fontWeight: "700" },

  histRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderRadius: RADIUS.md, padding: SP._14, marginBottom: SP._8, borderWidth: 1, borderColor: C.gray100 },
  histDate: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  histMeta: { fontSize: 12, color: C.gray500, marginTop: 2 },
  histCpk: { fontSize: 15, fontWeight: "800", color: C.brand700 },

  // Checklist
  ckRow: { flexDirection: "row", alignItems: "center", gap: SP._10, paddingVertical: SP._6 },
  ckIcon: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  ckDone: { backgroundColor: C.success500, borderColor: C.success500 },
  ckTodo: { backgroundColor: "transparent", borderColor: C.gray300 },
  ckInfo: { backgroundColor: C.warning100, borderColor: C.warning300 },
  ckMark: { fontSize: 11, fontWeight: "900", color: C.white },
  ckLabel: { fontSize: 13, color: C.gray800, flex: 1 },
  ckLabelDone: { color: C.gray400 },

  // Schedule
  schedDivider: { height: 1, backgroundColor: C.gray100, marginVertical: SP._12 },
  schedToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  schedTitle: { fontSize: 13, fontWeight: "700", color: C.gray900 },
  schedSub: { fontSize: 11, color: C.gray500, marginTop: 1 },
  miniLabel: { fontSize: 11, fontWeight: "700", color: C.gray500, marginTop: SP._10, marginBottom: SP._6, textTransform: "uppercase", letterSpacing: 0.3 },
  miniRow: { flexDirection: "row", gap: SP._6, flexWrap: "wrap" },
  miniChip: { paddingHorizontal: SP._10, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: "transparent" },
  miniChipActive: { backgroundColor: C.brand100, borderColor: C.brand500 },
  miniChipText: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  miniChipTextActive: { color: C.brand700 },

  // Wizard
  wizBackdrop: { flex: 1, backgroundColor: "rgba(15,40,60,0.5)", justifyContent: "flex-end" },
  // Tablet/landscape: center as a capped-width card instead of stretching
  // edge-to-edge as a full-width bottom sheet.
  wizBackdropTablet: { justifyContent: "center", alignItems: "center", padding: 32 },
  wizSheet: { backgroundColor: C.gray100, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: "92%" },
  // Fixed height (not maxHeight) + rounded on all corners + capped width —
  // same "good practice" card treatment as the Services modal.
  wizSheetTablet: { borderRadius: RADIUS.xl, width: "100%", maxWidth: 620, height: "86%" },
  wizHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SP._16, borderBottomWidth: 1, borderBottomColor: C.gray100, backgroundColor: C.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  wizStep: { fontSize: 12, fontWeight: "700", color: C.gray400 },
  wizTitle: { fontSize: 17, fontWeight: "800", color: C.gray900 },
  // Generous bottom padding — same as the Services modal — so the last field
  // scrolls clear of the keyboard and short steps get breathing room above
  // the sticky footer instead of hugging it.
  wizBody: { padding: SP._16, paddingBottom: 240 },
  wizFooter: { flexDirection: "row", gap: SP._12, padding: SP._16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100 },
  wizBack: { flex: 1, height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  wizBackText: { fontSize: 15, fontWeight: "700", color: C.gray600 },
  wizNext: { flex: 2, height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.brand500 },
  wizNextText: { fontSize: 15, fontWeight: "800", color: C.white },
  styleOpt: { backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, padding: SP._16, marginBottom: SP._10 },
  styleOptActive: { borderColor: C.brand500, backgroundColor: C.brand100 },
  styleOptTitle: { fontSize: 15, fontWeight: "800", color: C.gray900 },
  styleOptSub: { fontSize: 12, color: C.gray600, marginTop: 4, lineHeight: 17 },
});
