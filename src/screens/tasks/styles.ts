// Styles for the tasks screen — extracted from tasks.tsx for readability.
// Pure static StyleSheet; no behavior.
import { StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.brand500 },
  endOfList: {
    marginTop: SP._16, fontSize: 12, fontWeight: "600",
    color: C.gray300, textAlign: "center",
  },

  heroChip: { backgroundColor: C.warning500, borderRadius: RADIUS.full, paddingHorizontal: SP._12, paddingVertical: SP._6 },
  heroChipText: { fontSize: 12, fontWeight: "700", color: C.white },

  // Filter bar
  filterBar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100, paddingTop: SP._12, paddingBottom: SP._10 },
  filterContent: { paddingHorizontal: SP._16, gap: SP._8 },
  filterChip: { paddingHorizontal: SP._14, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray100 },
  filterChipActive: { backgroundColor: C.gray900 },
  filterChipText: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  filterChipTextActive: { color: C.white },
  countdownText: { fontSize: 10, color: C.gray500, textAlign: "center", marginTop: SP._8 },

  scroll: { flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" },
  content: { padding: SP._14, paddingBottom: SP._16 },
  loadingBox: { height: 200, alignItems: "center", justifyContent: "center" },

  emptyBox: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.gray900, marginBottom: SP._8 },
  emptyDesc: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 20, maxWidth: 300 },

  loadMoreBtn:  { alignItems: "center", paddingVertical: SP._12, marginTop: SP._4 },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: C.brand500 },

  sectionLabelPending: { fontSize: 10, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: SP._8, marginLeft: SP._4 },
  sectionLabelDoneRow: { flexDirection: "row", alignItems: "center", gap: SP._6, marginBottom: SP._8, marginLeft: SP._4 },
  sectionLabelDone: { fontSize: 10, fontWeight: "700", color: C.success700, textTransform: "uppercase", letterSpacing: 0.4 },

  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.gray300, flexShrink: 0, marginTop: 1 },
  doneCard: { backgroundColor: C.gray100 },
  circleDone: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.success500, flexShrink: 0, alignItems: "center", justifyContent: "center" },

  taskTitle: { fontSize: 14, fontWeight: "600", color: C.gray900, lineHeight: 19 },
  assignText: { fontSize: 11, color: C.gray500, marginTop: 2 },
  taskTitleDone: { fontSize: 14, color: C.gray500, textDecorationLine: "line-through", lineHeight: 19 },
  completedByText: { fontSize: 11, color: C.gray400, marginTop: 2 },
  completionNote: { fontSize: 12, color: C.gray600, fontStyle: "italic", marginTop: 2 },
  proofThumb: { width: 34, height: 34, borderRadius: 8, backgroundColor: C.gray200 },
  undoText: { fontSize: 11, fontWeight: "500", color: C.brand500 },

  // Card badges
  cardBadges: { flexDirection: "row", gap: SP._6, marginTop: SP._8, flexWrap: "wrap", alignItems: "center" },
  badge: { borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  metaPillText: { fontSize: 11, fontWeight: "600", color: C.gray600 },
  duePill: { backgroundColor: C.warning100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  duePillText: { fontSize: 11, fontWeight: "700", color: C.warning700 },

  // Footer
  footerContainer: { paddingHorizontal: SP._16, paddingVertical: SP._12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100 },
  addTaskBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8, backgroundColor: C.brand500, borderRadius: RADIUS.lg, height: 52 },
  addTaskBtnText: { fontSize: 16, fontWeight: "700", color: C.white },

  // Modal — tablet centering
  tabletOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", padding: 32,
  },
  tabletCard: {
    width: "100%", maxWidth: 620, height: "86%",
    backgroundColor: C.white, borderRadius: RADIUS.xl, overflow: "hidden",
  },
  // Modal
  modalSafe: { flex: 1, backgroundColor: C.white },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: SP._16, paddingVertical: SP._14, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  modalClose: { padding: SP._4 },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: C.gray900 },
  modalScroll: { flex: 1 },
  modalContent: { padding: SP._20, paddingBottom: SP._32 },

  sectionHeader: { fontSize: 12, fontWeight: "800", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.6, marginTop: SP._20, marginBottom: SP._4 },

  fieldLabel: { fontSize: 13, fontWeight: "600", color: C.gray900, marginTop: SP._14, marginBottom: SP._6 },
  fieldInput: { fontSize: 14, color: C.gray900, backgroundColor: C.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._12, paddingVertical: SP._10 },
  fieldInputMulti: { height: 80, textAlignVertical: "top", paddingTop: 12 },
  fieldHelp: { fontSize: 11, color: C.gray500, marginTop: SP._6, marginLeft: SP._2, lineHeight: 16 },

  // Option chips
  chipRow: { flexDirection: "row", gap: SP._8, marginTop: SP._4 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: SP._8, marginTop: SP._4 },
  optionChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: SP._12, paddingVertical: SP._10, borderRadius: RADIUS.md,
    backgroundColor: C.gray50, borderWidth: 1.5, borderColor: C.gray200, justifyContent: "center",
  },
  optionChipActive: { backgroundColor: C.brand100, borderColor: C.brand500 },
  optionChipText: { fontSize: 13, fontWeight: "600", color: C.gray600 },
  optionChipTextActive: { color: C.brand700 },

  // Weekday picker
  daysRow: { flexDirection: "row", gap: SP._6, marginTop: SP._4 },
  dayCircle: { flex: 1, aspectRatio: 1, maxWidth: 44, borderRadius: 22, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  dayCircleActive: { backgroundColor: C.brand100, borderColor: C.brand500 },
  dayText: { fontSize: 13, fontWeight: "700", color: C.gray500 },
  dayTextActive: { color: C.brand700 },

  // Completion rules
  rulesCard: { marginTop: SP._8, backgroundColor: C.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: SP._14 },
  ruleRow: { flexDirection: "row", alignItems: "center", paddingVertical: SP._12 },
  ruleRowBorder: { borderTopWidth: 1, borderTopColor: C.gray200 },
  ruleLabel: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  ruleHint: { fontSize: 12, color: C.gray500, marginTop: 2 },

  // Preview
  previewCard: { marginTop: SP._8, backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.brand200, padding: SP._14 },
  previewBadges: { flexDirection: "row", gap: SP._6, marginBottom: SP._8, flexWrap: "wrap" },
  previewTitle: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  previewMeta: { fontSize: 12, color: C.gray500, marginTop: 4 },
  previewRules: { flexDirection: "row", gap: SP._6, marginTop: SP._10, flexWrap: "wrap" },
  previewRulePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 3 },
  previewRuleText: { fontSize: 11, fontWeight: "600", color: C.gray600 },

  // Footer buttons
  modalFooter: { flexDirection: "row", gap: SP._12, padding: SP._16, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white },
  cancelBtn: { flex: 1, height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: C.gray600 },
  createBtn: { flex: 2, height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.brand500 },
  createBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
});
