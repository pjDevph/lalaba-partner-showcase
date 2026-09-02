// Styles for the Inventory screen — extracted from inventory.tsx for readability.
// Pure static StyleSheet; no behavior.
import { StyleSheet } from "react-native";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.white,
  },
  endOfList: {
    marginTop: SP._10, fontSize: 12, fontWeight: "600",
    color: C.gray300, textAlign: "center",
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    padding: SP._16,
    gap: SP._16,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },
  // Tab switcher
  tabRow: {
    flexDirection: "row",
    backgroundColor: C.gray100,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: SP._16,
    marginTop: SP._12,
    marginBottom: SP._8,
    gap: 4,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: C.white,
    shadowColor: "#0F283C", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  tabBtnText: { fontSize: 14, fontWeight: "700", color: C.gray500 },
  tabBtnTextActive: { color: C.brand600 },
  tabHint: { fontSize: 12, color: C.gray500, paddingHorizontal: SP._16, marginBottom: SP._8, lineHeight: 16 },

  lowStockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._12,
    paddingHorizontal: SP._14,
    paddingVertical: SP._12,
    borderRadius: RADIUS.md,
    backgroundColor: C.warning100,
    borderLeftWidth: 4,
    borderLeftColor: C.warning700,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.warning700,
    flex: 1,
  },
  summaryRow: {
    flexDirection: "row",
    gap: SP._10,
  },
  chip: {
    flex: 1,
    paddingHorizontal: SP._12,
    paddingVertical: SP._12,
    borderRadius: RADIUS.md,
    backgroundColor: C.white,
    alignItems: "center",
    ...SHADOW.xs,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: C.gray600,
    marginBottom: 4,
  },
  chipValue: {
    fontSize: 18,
    fontWeight: "700",
    color: C.gray900,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._10,
    paddingHorizontal: SP._14,
    paddingVertical: SP._10,
    borderRadius: RADIUS.md,
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.gray900,
    padding: 0,
  },
  productCard: {
    backgroundColor: C.white,
    borderRadius: RADIUS.md,
    padding: SP._14,
    marginBottom: SP._10,
    borderWidth: 1,
    borderColor: C.gray100,
    ...SHADOW.xs,
  },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SP._10,
  },
  cardArchiveBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.gray50,
  },
  archiveToggle: { alignSelf: "center", paddingVertical: SP._10, marginTop: SP._4 },
  archiveToggleText: { fontSize: 13, fontWeight: "600", color: C.brand500 },
  archivedCard: { backgroundColor: C.gray50, borderColor: C.gray200, borderWidth: 1 },
  archiveEmpty: { textAlign: "center", color: C.gray400, fontSize: 13, paddingVertical: SP._8 },
  restoreBtn: { backgroundColor: C.brand500, borderRadius: 8, paddingHorizontal: SP._14, paddingVertical: SP._8 },
  restoreBtnText: { color: C.white, fontWeight: "700", fontSize: 13 },
  productName: {
    fontSize: 15,
    fontWeight: "700",
    color: C.gray900,
    flex: 1,
  },
  unitBadge: {
    paddingHorizontal: SP._8,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    backgroundColor: C.brand100,
    marginLeft: SP._8,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.brand700,
  },
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SP._8,
  },
  stockLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: C.gray600,
  },
  stockValue: {
    fontSize: 16,
    fontWeight: "700",
    color: C.gray900,
  },
  progressBar: {
    height: 4,
    backgroundColor: C.gray200,
    borderRadius: 2,
    marginBottom: SP._8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  thresholdText: {
    fontSize: 11,
    fontWeight: "500",
    color: C.gray500,
    marginBottom: SP._10,
  },
  actionRow: {
    flexDirection: "row",
    gap: SP._8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: SP._10,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  restockBtn: {
    backgroundColor: C.accent500,
  },
  adjustBtn: {
    backgroundColor: C.gray100,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  restockBtnText: {
    color: C.white,
  },
  adjustBtnText: {
    color: C.gray700,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.gray900,
    marginBottom: SP._12,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._12,
    paddingHorizontal: SP._14,
    paddingVertical: SP._12,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  logType: {
    fontSize: 12,
    fontWeight: "700",
    color: C.gray600,
    minWidth: 60,
  },
  logDetails: {
    flex: 1,
  },
  logProduct: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray900,
    marginBottom: 2,
  },
  logTime: {
    fontSize: 11,
    color: C.gray500,
  },
  logQty: {
    fontSize: 13,
    fontWeight: "700",
    color: C.gray900,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP._32,
    gap: SP._12,
  },
  emptyIcon: {
    opacity: 0.3,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray500,
  },
  // Modal styles
  modal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalTablet: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalContent: {
    backgroundColor: C.white,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SP._16,
    paddingTop: SP._16,
    paddingBottom: SP._24,
    maxHeight: "80%",
  },
  // Generous bottom padding inside the scrollable form area — same as the
  // Services modal — so the last field can scroll clear of the keyboard
  // instead of hiding behind it, and short forms get breathing room above
  // the footer buttons instead of hugging them.
  modalScrollContent: {
    paddingBottom: 240,
  },
  modalContentTablet: {
    borderRadius: RADIUS.xl,
    width: "100%",
    maxWidth: 540,
    maxHeight: "82%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SP._16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.gray900,
  },
  formGroup: {
    marginBottom: SP._16,
    gap: SP._8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray700,
  },
  input: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SP._12,
    paddingVertical: SP._10,
    fontSize: 14,
    color: C.gray900,
  },
  inputError: {
    borderColor: C.error500,
    backgroundColor: "#fff5f5",
  },
  errorText: {
    fontSize: 12,
    color: C.error500,
  },
  unitPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP._8,
  },
  unitOption: {
    paddingHorizontal: SP._12,
    paddingVertical: SP._8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: C.white,
  },
  unitOptionActive: {
    borderColor: C.brand500,
    backgroundColor: C.brand100,
  },
  unitOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.gray600,
  },
  unitOptionTextActive: {
    color: C.brand700,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._12,
  },
  toggleBtn: {
    paddingHorizontal: SP._12,
    paddingVertical: SP._8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    minWidth: 50,
    alignItems: "center",
  },
  toggleBtnActive: {
    borderColor: C.brand500,
    backgroundColor: C.brand100,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray600,
  },
  toggleTextActive: {
    color: C.brand700,
  },
  submitBtn: {
    paddingVertical: SP._12,
    borderRadius: RADIUS.md,
    backgroundColor: C.brand500,
    alignItems: "center",
    marginTop: SP._12,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.white,
  },
  // Category picker (AddProductModal)
  catRow: {
    flexDirection: "row",
    gap: SP._8,
  },
  catOption: {
    flex: 1,
    paddingVertical: SP._10,
    paddingHorizontal: SP._8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: C.white,
    alignItems: "center",
  },
  catOptionActive: {
    borderColor: C.brand500,
    backgroundColor: C.brand100,
  },
  catOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.gray600,
    textAlign: "center",
  },
  catOptionTextActive: {
    color: C.brand700,
  },
  catHint: {
    fontSize: 11,
    color: C.gray500,
    marginTop: SP._4,
    lineHeight: 15,
  },
  modalCancelBtn: {
    fontSize: 14,
    fontWeight: "500",
    color: C.brand500,
    minWidth: 56,
  },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.gray100,
    alignItems: "center", justifyContent: "center",
  },
  // Modal description banner
  modalDescBox: {
    backgroundColor: C.brand50,
    borderRadius: RADIUS.md,
    paddingHorizontal: SP._12,
    paddingVertical: SP._10,
    marginBottom: SP._16,
    gap: SP._4,
  },
  modalDescText: {
    fontSize: 13,
    color: C.brand800,
    lineHeight: 18,
  },
  modalDescExample: {
    fontSize: 12,
    color: C.brand600,
    fontStyle: "italic",
  },

  requiredNote: { fontSize: 11, color: C.gray400, marginBottom: 14, fontStyle: "italic" as const },

  /* Modal footer row — Cancel + Action side-by-side */
  invFooterRow: { flexDirection: "row", gap: 10, marginTop: SP._12 },
  invCancelBtn: {
    flex: 1,
    paddingVertical: SP._12,
    borderRadius: RADIUS.md,
    backgroundColor: C.white,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.gray200,
  },
  invCancelBtnText: { fontSize: 15, fontWeight: "600", color: C.gray600 },

  /* SelectField dropdown */
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectBtnText: { fontSize: 14, color: C.gray900, flex: 1 },
  selectDropdown: {
    borderRadius: RADIUS.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.gray200,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  selectOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  selectOptionActive: { backgroundColor: C.brand50 },
  selectOptionText: { fontSize: 14, color: C.gray700 },
  selectOptionTextActive: { color: C.brand700, fontWeight: "700" as const },
});
